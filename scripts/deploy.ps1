[CmdletBinding()]
param(
    [ValidateSet('be', 'app', 'all')]
    [string]$Target = 'all',
    [string]$Notes = 'Ban cap nhat moi',
    [string]$AppTarget = 'internal',
    [string]$RailwayProjectId = '267bdbe8-014e-4947-a633-52a475e10a51',
    [string]$Environment = 'production',
    [string]$TestRedisUrl = 'redis://127.0.0.1:6381',
    [switch]$SkipCheck,
    [switch]$CheckOnly,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
# PowerShell 5.1 ve thanh tien trinh cua Invoke-WebRequest: cham va lam vo output khi chay qua CI/terminal khac.
$ProgressPreference = 'SilentlyContinue'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$WithBackend = $Target -in @('be', 'all')
$WithApp = $Target -in @('app', 'all')
if ($DryRun -and $CheckOnly) { throw 'Chi chon mot trong -DryRun va -CheckOnly.' }

function Invoke-Checked {
    param([string]$Directory, [string]$Command, [string[]]$Arguments)
    Push-Location (Join-Path $RepoRoot $Directory)
    try {
        & $Command @Arguments
        if ($LASTEXITCODE -ne 0) { throw "$Command that bai (exit $LASTEXITCODE)." }
    } finally { Pop-Location }
}

function Get-RailwayEnvironment {
    Push-Location (Join-Path $RepoRoot 'be')
    try {
        $raw = & railway status --json
        if ($LASTEXITCODE -ne 0) { throw 'Khong doc duoc Railway. Chay railway login va railway link trong be/.' }
        $project = ($raw -join "`n") | ConvertFrom-Json
    } finally { Pop-Location }
    if ($project.id -ne $RailwayProjectId) { throw "Railway dang lien ket sai project. Can $RailwayProjectId; dung railway link trong be/." }
    $selected = @($project.environments.edges | Where-Object { $_.node.name -eq $Environment })
    if ($selected.Count -ne 1) { throw "Khong tim thay environment $Environment." }
    return $selected[0].node
}

function Get-ServiceInstance {
    param($RailwayEnvironment, [string]$Name)
    $selected = @($RailwayEnvironment.serviceInstances.edges | Where-Object { $_.node.serviceName -eq $Name })
    if ($selected.Count -ne 1) { throw "Thieu service $Name trong $Environment." }
    return $selected[0].node
}

function Test-TcpEndpoint {
    param([string]$Url)
    $uri = [Uri]$Url
    $client = New-Object Net.Sockets.TcpClient
    try { return $client.ConnectAsync($uri.Host, $uri.Port).Wait(2000) }
    catch { return $false }
    finally { $client.Close() }
}

function Test-CollabHealth {
    param($Response)
    # services.collab = ok | degraded | disabled. degraded = collab khong phan hoi HOAC tu choi COLLAB_SHARED_SECRET cua api
    # (doi bien ma collab chua DEPLOY lai: Restart cua Railway giu bien cu) => moi token bi tu choi, app bao "Mat phien ve".
    # Chi canh bao: collab la service rieng, khong chan deploy api/worker.
    $collab = $null
    try { $collab = ($Response.Content | ConvertFrom-Json).services.collab } catch { return }
    if ($collab -and $collab -notin @('ok', 'disabled')) {
        Write-Warning "collab: $collab. Kiem COLLAB_SHARED_SECRET tren api/worker/collab roi deploy lai collab (railway deployment redeploy --service collab)."
    }
}

function Wait-RailwayDeployment {
    param([string]$Service, [string]$PreviousId)
    # --ci chi doi build; phai doi runtime SUCCESS truoc khi gui APK cho tester.
    $deadline = (Get-Date).AddMinutes(15)
    do {
        $instance = Get-ServiceInstance (Get-RailwayEnvironment) $Service
        $latest = $instance.latestDeployment
        if ($latest -and $latest.id -ne $PreviousId) {
            if ($latest.status -eq 'SUCCESS') { return }
            if ($latest.status -in @('FAILED', 'CRASHED', 'REMOVED', 'SKIPPED')) {
                throw "Railway $Service deploy $($latest.id): $($latest.status)."
            }
        }
        Start-Sleep -Seconds 5
    } while ((Get-Date) -lt $deadline)
    throw "Het thoi gian cho $Service. Kiem tra Railway Dashboard truoc khi thu lai."
}

Write-Host "Super App | target=$Target | Railway=$RailwayProjectId/$Environment | Firebase target=$AppTarget"
foreach ($command in @('node', 'npm')) { $null = Get-Command $command -ErrorAction Stop }

# Dry-run chi kiem cau hinh cuc bo, khong can dang nhap, khong build/test/deploy.
if ($DryRun) {
    if ($WithBackend) {
        foreach ($service in @('api', 'worker')) {
            Write-Host "[dry-run] be/: railway up --project $RailwayProjectId --environment $Environment --service $service --ci"
        }
    }
    if ($WithApp) {
        Invoke-Checked 'app' 'node' @('scripts/distribute-android.mjs', '--target', $AppTarget, '--dry-run')
    }
    Write-Host 'Dry-run hoan tat. Chua build hoac deploy.'
    return
}

# Kiem ca hai dich TRUOC bat ky thao tac trien khai nao.
if ($WithBackend) {
    $null = Get-Command railway -ErrorAction Stop
    $railwayEnv = Get-RailwayEnvironment
    foreach ($service in @('api', 'worker', 'Redis')) {
        $instance = Get-ServiceInstance $railwayEnv $service
        Write-Host "Railway $service : $($instance.latestDeployment.status)"
    }
    $api = Get-ServiceInstance $railwayEnv 'api'
    $domain = @($api.domains.serviceDomains)[0].domain
    if (-not $domain) { throw 'API chua co public domain tren Railway.' }
    $healthUrl = "https://$domain/api/health"
    if ($WithApp) {
        $config = Get-Content (Join-Path $RepoRoot 'app/distribute.config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        $appConfig = $config.targets.$AppTarget
        if (-not $appConfig) { throw "Khong co Firebase target $AppTarget." }
        $apiUrl = $appConfig.env.EXPO_PUBLIC_API_BASE_URL
        $socketUrl = $appConfig.env.EXPO_PUBLIC_SOCKET_URL
        if ($apiUrl -ne "https://$domain/api/v1" -or $socketUrl -ne "https://$domain") {
            throw 'URL API/Socket cua app khong khop Railway. Kiem tra app/distribute.config.json.'
        }
    }
}
if ($WithApp) {
    Invoke-Checked 'app' 'node' @('scripts/distribute-android.mjs', '--target', $AppTarget, '--preflight-only')
}

if (-not $SkipCheck) {
    if ($WithBackend) {
        Invoke-Checked 'be' 'npm' @('run', 'build')
        Invoke-Checked 'be' 'npm' @('run', 'lint')
        # Bao loi ngay neu thieu Redis test, thay vi doi integration test timeout tung suite.
        if (-not (Test-TcpEndpoint $TestRedisUrl)) {
            throw "Khong ket noi duoc Redis test $TestRedisUrl. Dung Redis test theo docs/deploy-firebase-railway.md hoac doi -TestRedisUrl."
        }
        # Mongo tam + Redis test rieng; khong dung DB/Redis cua .env production.
        $savedEnv = @{}
        foreach ($key in @('TEST_DB', 'NODE_ENV', 'REDIS_URL', 'REDIS_PASSWORD', 'NODE_OPTIONS')) {
            $savedEnv[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
        }
        try {
            $env:TEST_DB = 'memory'
            $env:NODE_ENV = 'test'
            $env:REDIS_URL = $TestRedisUrl
            $env:REDIS_PASSWORD = ''
            # --runInBand gom ~660 suite vao mot tien trinh: heap mac dinh (~4 GB) bi OOM tren Windows/Node 24.
            if ("$env:NODE_OPTIONS" -notmatch 'max-old-space-size') {
                $env:NODE_OPTIONS = ("$env:NODE_OPTIONS --max-old-space-size=8192").Trim()
            }
            Invoke-Checked 'be' 'npm' @('test', '--', '--runInBand')
        } finally {
            foreach ($key in $savedEnv.Keys) { [Environment]::SetEnvironmentVariable($key, $savedEnv[$key], 'Process') }
        }
    }
    if ($WithApp) { Invoke-Checked 'app' 'npm' @('run', 'check') }
}

if ($CheckOnly) {
    if ($WithBackend) {
        $health = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 30
        if ($health.StatusCode -ne 200) { throw 'API healthcheck khong dat.' }
        Write-Host "API healthcheck: HTTP $($health.StatusCode)"
        Test-CollabHealth $health
    }
    Write-Host 'Kiem tra hoan tat. Chua build APK, upload hoac deploy.'
    return
}

if ($WithBackend) {
    foreach ($service in @('api', 'worker')) {
        $previous = (Get-ServiceInstance (Get-RailwayEnvironment) $service).latestDeployment.id
        Invoke-Checked 'be' 'railway' @('up', '--project', $RailwayProjectId, '--environment', $Environment, '--service', $service, '--ci')
        Wait-RailwayDeployment $service $previous
    }
    $health = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 30
    if ($health.StatusCode -ne 200) { throw 'API healthcheck sau deploy khong dat.' }
    Test-CollabHealth $health
}
if ($WithApp) {
    # Ghi chu qua file de giu nguyen tieng Viet/xuong dong/ky tu shell tren Windows.
    $notesFile = [IO.Path]::GetTempFileName()
    try {
        [IO.File]::WriteAllText($notesFile, $Notes, [Text.UTF8Encoding]::new($false))
        Invoke-Checked 'app' 'node' @('scripts/distribute-android.mjs', '--target', $AppTarget, '--notes-file', $notesFile)
    } finally { Remove-Item -LiteralPath $notesFile -Force }
}
Write-Host 'Trien khai hoan tat.' -ForegroundColor Green
