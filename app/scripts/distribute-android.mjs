#!/usr/bin/env node
/**
 * Build APK release rồi đẩy lên **Firebase App Distribution** để chia sẻ cho tester — MỘT lệnh:
 *
 *   npm run distribute -- --notes "Sửa lỗi đăng nhập"
 *
 * Đích đến khai trong `distribute.config.json` (mỗi "target" = một project Firebase), KHÔNG hardcode
 * trong `package.json`. Đổi đích = `--target <tên>`. Doc đầy đủ: `docs/deploy-firebase-app-distribution.md`.
 *
 * ── Thứ tự các bước (quan trọng) ─────────────────────────────────────────────
 *  1. Kiểm cấu hình + đăng nhập Firebase + app có thuộc project — TRƯỚC khi build. Build mất 3–10 phút;
 *     để lỗi "chưa đăng nhập" nổ ở bước upload là ngồi chờ hết chừng đó rồi mới biết.
 *  2. `expo prebuild` CHỈ khi phần native đổi (dấu vân tay `@expo/fingerprint`, cùng cách
 *     `ensure-dev-build.mjs` làm) — prebuild SDK 57 mặc định `--clean` nên chạy thừa là mất vài phút.
 *  3. Ghi `versionCode` tăng dần vào `android/app/build.gradle` (file sinh ra, gitignore).
 *  4. `gradlew app:assembleRelease`, biến `EXPO_PUBLIC_*` của target đè lên `.env` dev.
 *  5. Kiểm APK: đúng package, đúng versionCode, JS bundle chứa URL API của target.
 *  6. `firebase appdistribution:distribute` — ghi chú đi qua FILE (xem chú thích ở bước upload).
 *
 * ⛔ Bản build ký bằng **debug key** của template Expo: đủ để tester cài qua App Distribution, nhưng KHÔNG
 * upload Google Play được và không cài đè lên bản ký bằng khoá khác (phải gỡ bản cũ trước).
 *
 * ── Cờ ───────────────────────────────────────────────────────────────────────
 *  --target <tên>          chọn đích (mặc định `defaultTarget`; env SUPERAPP_DISTRIBUTE_TARGET)
 *  --notes "…"             ghi chú một dòng     --notes-file <đường dẫn>  ghi chú nhiều dòng
 *  --groups a,b            đè danh sách group   --testers x@y.com,…       gửi thẳng theo email
 *  --abi <arm64-v8a|x86_64|universal|a,b>       ABI đưa vào APK (mặc định theo target, thường arm64-v8a)
 *  --version-code <số>     đè versionCode       --artifact <apk>          đè file đẩy lên
 *  --upload-only           không build, đẩy APK có sẵn      --build-only   build + kiểm, không đẩy
 *  --prebuild              ép prebuild lại      --no-prebuild             bỏ qua prebuild (chỉ khi CHỈ sửa JS)
 *  --dry-run               in kế hoạch + lệnh, không chạy gì (không cần đăng nhập/SDK)
 *  --preflight-only        kiểm cấu hình, Firebase, SDK/JDK; không build hay upload
 *  --list                  liệt kê đích         --check-apk <apk>         chỉ kiểm APK (kèm --expect-host)
 *  --add-testers a@x.com,… thêm tester vào group của target
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  IS_WIN,
  buildReleaseNotes,
  commandLine,
  computeVersionCode,
  loadConfig,
  parseArgs,
  gradleJvmArgs,
  patchGradleVersion,
  pickTarget,
  readApkBundle,
  resolveAbis,
  setGradleProperty,
  stripAnsi,
} from './lib/distribute.mjs';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..');
const ANDROID_DIR = path.join(ROOT, 'android');
const APK_DIR = path.join(ANDROID_DIR, 'app/build/outputs/apk/release');
const STATE_FILE = path.join(ROOT, '.expo/distribute-android.json');
const METRO_CACHE = path.join(os.tmpdir(), 'metro-cache');
/**
 * Nơi Gradle đặt bundle JS + ảnh của bản release (`createBundleReleaseJsAndAssets`). Ta XOÁ trước mỗi lần
 * phân phối — xem `buildApk`.
 */
const RELEASE_BUNDLE_DIRS = [
  path.join(ANDROID_DIR, 'app/build/generated/assets/react/release'),
  path.join(ANDROID_DIR, 'app/build/generated/res/react/release'),
];

// `@expo/config` · `@expo/env` · `@expo/fingerprint` là phụ thuộc của `expo`, lấy qua nó để khỏi khai thêm gói.
const requireFromExpo = createRequire(createRequire(import.meta.url).resolve('expo/package.json'));

const log = (msg) => console.log(msg);
const die = (msg) => {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
};

const args = parseArgs(process.argv.slice(2));

if (args.flag('help')) {
  const doc = fs.readFileSync(SELF, 'utf8').split('*/')[0];
  log(doc.replace(/^#!.*\n\/\*\*\n/, '').replace(/^ \* ?/gm, ''));
  process.exit(0);
}

// ── 0. Kiểm APK có sẵn (không cần cấu hình) ──────────────────────────────────
if (args.value('check-apk')) {
  const file = path.resolve(ROOT, args.value('check-apk'));
  const problems = inspectApk(file, { expectHost: args.value('expect-host') });
  if (problems.length) die(problems.join('\n'));
  log(`✔ ${path.basename(file)} đạt kiểm tra.`);
  process.exit(0);
}

// ── 1. Cấu hình + đích ───────────────────────────────────────────────────────
const configPath = path.resolve(
  ROOT,
  process.env.SUPERAPP_DISTRIBUTE_CONFIG || args.value('config', 'distribute.config.json'),
);
let config;
try {
  config = loadConfig(configPath);
} catch (e) {
  die(e.message);
}

if (args.flag('list')) {
  log(`\nCác đích khai trong ${path.basename(configPath)}:\n`);
  for (const [name, t] of Object.entries(config.targets)) {
    const mark = name === config.defaultTarget ? '→' : ' ';
    log(` ${mark} ${name.padEnd(14)} ${t.projectId}  ${t.description ?? ''}`);
  }
  log('\n   → = mặc định (đổi bằng --target <tên>)\n');
  process.exit(0);
}

let targetName;
let target;
try {
  ({ name: targetName, target } = pickTarget(
    config,
    args.value('target', process.env.SUPERAPP_DISTRIBUTE_TARGET),
  ));
} catch (e) {
  die(e.message);
}

const dryRun = args.flag('dry-run');
const uploadOnly = args.flag('upload-only');
const buildOnly = args.flag('build-only');
if (uploadOnly && buildOnly) die('--upload-only và --build-only loại trừ nhau.');
const willBuild = !uploadOnly;
const willUpload = !buildOnly;

// ── 2. Biến build của target ─────────────────────────────────────────────────
// Biến trong shell ĐÈ `.env` (Expo không ghi đè biến đã có) — nên bản gửi tester luôn trỏ về API của target,
// dù `.env` dev đang là `http://10.0.2.2:3000` (máy ảo; tester không với tới).
const targetEnv = { ...(target.env ?? {}) };
if (target.googleServicesFile) {
  targetEnv.GOOGLE_SERVICES_JSON = path.resolve(ROOT, target.googleServicesFile);
}
Object.assign(process.env, targetEnv);

const publicEnv = Object.fromEntries(
  Object.entries(targetEnv)
    .filter(([k]) => k.startsWith('EXPO_PUBLIC_'))
    .sort(([a], [b]) => a.localeCompare(b)),
);
const envHash = createHash('sha1').update(JSON.stringify(publicEnv)).digest('hex').slice(0, 12);
const apiHost = publicEnv.EXPO_PUBLIC_API_BASE_URL
  ? new URL(publicEnv.EXPO_PUBLIC_API_BASE_URL).host
  : undefined;

let abis;
try {
  abis = resolveAbis(args.value('abi', target.abi ?? 'arm64-v8a'));
} catch (e) {
  die(e.message);
}

const initialState = readState();
const versionCode = (() => {
  const forced = args.value('version-code');
  if (forced === undefined) return computeVersionCode(Date.now(), initialState.versionCode ?? 0);
  if (!/^\d+$/.test(forced) || Number(forced) < 1) {
    die(`--version-code phải là số nguyên dương (đang: ${forced}).`);
  }
  return Number(forced);
})();

/** Bộ nhớ Gradle daemon — target có thể đè bằng `gradleJvmArgs` (xem `gradleJvmArgs()` về lý do). */
const jvmArgs = target.gradleJvmArgs || gradleJvmArgs(os.totalmem());

const groups = args.value('groups', (target.groups ?? []).join(','));
const testers = args.value('testers', (target.testers ?? []).join(','));
const artifactPath = path.resolve(
  ROOT,
  args.value(
    'artifact',
    target.artifact ?? 'android/app/build/outputs/apk/release/app-release.apk',
  ),
);

// ── 3. Xác thực + Firebase CLI ───────────────────────────────────────────────
const auth = resolveAuth();
const hasGlobalCli =
  spawnSync(IS_WIN ? 'where' : 'which', ['firebase'], { shell: IS_WIN }).status === 0;
const cliPackage = config.cliPackage || 'firebase-tools';
const firebaseBin = hasGlobalCli ? 'firebase' : 'npx';
const withNpx = (argv) => (hasGlobalCli ? argv : ['--yes', cliPackage, ...argv]);

// ── 4. --add-testers ─────────────────────────────────────────────────────────
const addTesters = args.value('add-testers');
if (addTesters) {
  const alias = String(groups).split(',')[0];
  if (!alias)
    die('Target chưa khai group nào — dùng --groups <alias> hoặc khai "groups" trong config.');
  const emails = String(addTesters)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const cmd = [
    'appdistribution:testers:add',
    ...emails,
    '--group-alias',
    alias,
    '--project',
    target.projectId,
    ...auth.flags,
  ];
  if (dryRun) {
    log(`[dry-run] ${commandLine(firebaseBin, withNpx(cmd))}`);
    process.exit(0);
  }
  runFirebase(cmd, { inherit: true, failure: 'Thêm tester thất bại.' });
  log(`\n✔ Đã thêm ${emails.length} tester vào group "${alias}". Họ nhận mail mời từ Firebase.\n`);
  process.exit(0);
}

// ── 5. Kế hoạch (dry-run dừng ở đây) ─────────────────────────────────────────
const expoConfig = readExpoConfig();
const version = expoConfig?.version ?? '0.0.0';
if (targetEnv.GOOGLE_SERVICES_JSON) checkGoogleServices(targetEnv.GOOGLE_SERVICES_JSON);
const notesFile = path.join(os.tmpdir(), `superapp-release-notes-${process.pid}.txt`);
const distributeArgs = [
  'appdistribution:distribute',
  artifactPath,
  '--app',
  target.appId,
  '--project',
  target.projectId,
  ...(groups ? ['--groups', String(groups)] : []),
  ...(testers ? ['--testers', String(testers)] : []),
  '--release-notes-file',
  notesFile,
  ...auth.flags,
];

log(`→ Đích     : ${targetName}${target.description ? ` — ${target.description}` : ''}`);
log(`→ Project  : ${target.projectId}   App ID: ${target.appId}`);
log(`→ Nhận     : ${groups || '(chưa khai group)'}${testers ? ` + ${testers}` : ''}`);
log(`→ Xác thực : ${auth.note}`);
if (willBuild) {
  log(`→ Build    : v${version} (versionCode ${versionCode}) · ABI ${abis}`);
  log(`→ API      : ${apiHost ?? '(giữ theo .env — target không khai EXPO_PUBLIC_API_BASE_URL)'}`);
}
log(`→ File     : ${path.relative(ROOT, artifactPath)}${willBuild ? ' (sẽ tạo)' : ''}`);
log('');

if (dryRun) {
  if (willBuild) {
    log('[dry-run] expo prebuild --platform android --no-install   (chỉ khi phần native đổi)');
    log(`[dry-run] android/gradle.properties: org.gradle.jvmargs=${jvmArgs}`);
    log(`[dry-run] gradlew app:assembleRelease "-PreactNativeArchitectures=${abis}"`);
  }
  if (willUpload) log(`[dry-run] ${commandLine(firebaseBin, withNpx(distributeArgs))}`);
  process.exit(0);
}

// ── 6. Preflight — TRƯỚC build ───────────────────────────────────────────────
if (willUpload) preflightFirebase();
const sdk = willBuild ? resolveAndroidEnv() : undefined;
if (args.flag('preflight-only')) {
  log('✔ Cấu hình, Firebase và công cụ build hợp lệ. Chưa build hoặc upload.');
  process.exit(0);
}

// ── 7. Build ─────────────────────────────────────────────────────────────────
const apk = willBuild ? await buildApk(sdk) : artifactPath;
if (!fs.existsSync(apk)) {
  die(
    `Không thấy file để đẩy: ${apk}\n  Chạy \`npm run distribute\` (build + đẩy) hoặc dùng --artifact <apk>.`,
  );
}

const problems = inspectApk(apk, {
  expectHost: willBuild ? apiHost : undefined,
  expectVersionCode: willBuild ? versionCode : undefined,
});
if (problems.length)
  die(`APK không đạt kiểm tra — dừng, KHÔNG đẩy lên:\n  · ${problems.join('\n  · ')}`);

if (buildOnly) {
  log(`\n✔ Build xong (không đẩy): ${path.relative(ROOT, apk)}\n`);
  process.exit(0);
}

// ── 8. Upload ────────────────────────────────────────────────────────────────
// ⛔ Ghi chú đi qua FILE, không qua `--release-notes`: Windows gọi `firebase.cmd` qua cmd.exe, ký tự xuống
// dòng là DẤU KẾT THÚC LỆNH → Firebase chỉ nhận dòng đầu, phần còn lại biến mất mà lệnh vẫn trả 0.
fs.writeFileSync(
  notesFile,
  buildReleaseNotes({
    message: readMessage(),
    version,
    versionCode: willBuild ? versionCode : readBadging(apk)?.versionCode,
    git: readGit(),
    apiHost,
    builtAt: new Date().toLocaleString('vi-VN', { hour12: false }),
  }),
);
distributeArgs[1] = apk;

log(
  `▶ Đẩy ${path.basename(apk)} (${(fs.statSync(apk).size / 1048576).toFixed(1)} MB) lên Firebase App Distribution…\n`,
);
try {
  runFirebase(distributeArgs, {
    inherit: true,
    failure:
      'Upload thất bại. Hay gặp:\n' +
      '   • "App with ID … not found"    → App ID không thuộc project đang xác thực\n' +
      '   • HTTP 403 / Permission denied → tài khoản thiếu quyền App Distribution\n' +
      '   • "Failed to authenticate"     → chưa `firebase login`, hoặc credentialFile sai',
  });
} finally {
  fs.rmSync(notesFile, { force: true });
}

writeState({ ...readState(), lastUpload: { at: new Date().toISOString(), target: targetName } });
log(
  `\n✔ Đã đẩy lên "${targetName}". Tester trong group nhận mail/notification ngay.\n` +
    `  Console: https://console.firebase.google.com/project/${target.projectId}/appdistribution\n`,
);

// ═════════════════════════════════════════════════════════════════════════════

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(next) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(next, null, 2)}\n`);
}

/** Ba cách xác thực (chọn 1 cho mỗi target) — xem doc §"Xác thực". */
function resolveAuth() {
  const credRef = args.value(
    'credential',
    process.env[target.credentialEnv ?? ''] || target.credentialFile || '',
  );
  if (credRef) {
    const credPath = path.resolve(ROOT, credRef);
    // Sai tên = file lọt `.gitignore` (`*service-account*.json`) = khoá nằm trong git. Chặn ở đây vì phía
    // sau không còn lớp bảo vệ nào.
    if (!/service-account/.test(path.basename(credPath))) {
      die(
        `Tên file credential phải chứa chuỗi "service-account" (đang là "${path.basename(credPath)}").\n` +
          '  Rule .gitignore là "*service-account*.json" — đặt tên khác sẽ COMMIT LỘ KEY.',
      );
    }
    if (!fs.existsSync(credPath)) {
      if (dryRun)
        return {
          flags: [],
          env: {},
          mode: 'sa',
          note: `service account ${credRef} (chưa có file)`,
        };
      die(
        `Không thấy service account JSON: ${credPath}\n` +
          `  Tạo ở Google Cloud Console (project "${target.projectId}") → IAM & Admin → Service Accounts,\n` +
          '  cấp role "Firebase App Distribution Admin" → Keys → Add key (JSON).',
      );
    }
    const sa = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    if (!sa.client_email || !sa.private_key) {
      die(`${path.basename(credPath)} không phải service account key.`);
    }
    if (sa.project_id && sa.project_id !== target.projectId) {
      die(
        `Service account thuộc project "${sa.project_id}" nhưng target "${targetName}" khai "${target.projectId}". ` +
          'Đẩy nhầm project là bản build lọt sang tester của bên khác.',
      );
    }
    return {
      flags: [],
      env: { GOOGLE_APPLICATION_CREDENTIALS: credPath },
      mode: 'sa',
      note: `service account ${sa.client_email}`,
    };
  }
  if (target.account) {
    return {
      flags: ['--account', target.account],
      env: {},
      mode: 'account',
      note: `account ${target.account} (đã \`firebase login:add\`)`,
    };
  }
  return { flags: [], env: {}, mode: 'login', note: 'phiên `firebase login` mặc định' };
}

function runFirebase(argv, { inherit = false, capture = false, failure } = {}) {
  // `firebase.cmd`/`npx.cmd` phải qua shell trên Windows → MỘT chuỗi lệnh đã quote.
  const r = spawnSync(commandLine(firebaseBin, withNpx(argv)), {
    cwd: ROOT,
    env: { ...process.env, ...auth.env },
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : 'pipe',
    shell: true,
  });
  if (capture) return { ok: r.status === 0, out: stripAnsi(`${r.stdout ?? ''}${r.stderr ?? ''}`) };
  if (r.status !== 0) {
    console.error(`\n✖ ${failure ?? 'Lệnh firebase thất bại.'}\n`);
    process.exit(r.status ?? 1);
  }
  return { ok: true, out: '' };
}

/** Chạy TRƯỚC build: chưa đăng nhập / sai app thì dừng ngay, không đợi 5–10 phút Gradle. */
function preflightFirebase() {
  if (auth.mode === 'login') {
    const probe = runFirebase(['login:list'], { capture: true });
    if (/No authorized accounts/i.test(probe.out)) {
      die(
        'Firebase CLI chưa đăng nhập (CLI trả "No authorized accounts").\n' +
          '  Chạy:  firebase login\n' +
          '  Phiên đăng nhập nằm NGOÀI repo (%APPDATA%\\configstore) — cài lại máy là mất.\n' +
          '  Hoặc gắn service account cho target để khỏi phụ thuộc phiên đăng nhập (doc §Xác thực).',
      );
    }
  }
  const apps = runFirebase(
    ['apps:list', 'ANDROID', '--project', target.projectId, '--json', ...auth.flags],
    { capture: true },
  );
  if (!apps.ok) {
    if (/permission|403|does not have|denied|not found|404/i.test(apps.out)) {
      die(`Không truy cập được project "${target.projectId}":\n${apps.out.trim().slice(0, 400)}`);
    }
    die('Không kiểm được app trên Firebase. Kiểm tra mạng/phiên đăng nhập rồi chạy lại.');
  }
  let list = [];
  try {
    list = JSON.parse(apps.out.slice(apps.out.indexOf('{'))).result ?? [];
  } catch {
    if (apps.out.includes(target.appId)) return;
  }
  const app = list.find((a) => a.appId === target.appId);
  if (!app) {
    die(
      `App ID ${target.appId} không thuộc project "${target.projectId}".\n` +
        `  App Android đang có: ${list.map((a) => `${a.displayName} (${a.appId})`).join(', ') || '(không có)'}`,
    );
  }
  const pkg = readExpoConfig()?.android?.package;
  if (pkg && app.packageName && app.packageName !== pkg) {
    die(
      `App trên Firebase có package "${app.packageName}" nhưng app.config.ts khai "${pkg}" — Firebase sẽ từ chối APK.`,
    );
  }
}

function findAndroidSdk() {
  const home = os.homedir();
  const fallback = IS_WIN
    ? path.join(process.env.LOCALAPPDATA ?? path.join(home, 'AppData/Local'), 'Android/Sdk')
    : process.platform === 'darwin'
      ? path.join(home, 'Library/Android/sdk')
      : path.join(home, 'Android/Sdk');
  return [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, fallback].find(
    (d) => d && fs.existsSync(d),
  );
}

function resolveAndroidEnv() {
  const sdk = findAndroidSdk();
  if (!sdk) die('Không tìm thấy Android SDK. Cài Android Studio hoặc đặt ANDROID_HOME.');
  process.env.ANDROID_HOME = sdk;

  // ⛔ KHÔNG chạy `java` qua shell: `JAVA_HOME` thường có dấu cách (`C:\Program Files\Eclipse Adoptium\…`) và dấu
  // `\` cuối — qua cmd.exe không quote, đường dẫn bị cắt đôi và báo "không chạy được java" dù JDK cài đúng.
  // `java(.exe)` là file thực thi thật nên spawn thẳng (đường dẫn tuyệt đối, hoặc tra PATH) là đủ.
  const javaExe = IS_WIN ? 'java.exe' : 'java';
  const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', javaExe) : javaExe;
  const v = spawnSync(java, ['-version'], { encoding: 'utf8' });
  const major = Number(/version "(\d+)/.exec(`${v.stdout}${v.stderr}`)?.[1]);
  if (!major)
    die(
      'Không chạy được `java`. Cài JDK 17+ (vd `winget install EclipseAdoptium.Temurin.21.JDK`).',
    );
  if (major < 17) die(`JDK ${major} quá cũ — Gradle của dự án cần JDK 17 trở lên.`);
  return sdk;
}

/**
 * `google-services.json` (push FCM) phải khớp package của app — sai thì plugin Google Services làm Gradle chết
 * "No matching client found for package name" SAU vài phút; thiếu file thì `expo prebuild` chết ngay.
 */
function checkGoogleServices(file) {
  if (!fs.existsSync(file)) {
    die(
      `target khai googleServicesFile nhưng không thấy: ${file}\n` +
        `  Tải bằng: firebase apps:sdkconfig ANDROID ${target.appId} --project ${target.projectId}\n` +
        '  (file thuộc .gitignore — KHÔNG commit).',
    );
  }
  let json;
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    die(`${path.basename(file)} không phải JSON hợp lệ: ${e.message}`);
  }
  const packages = (json.client ?? []).map((c) => c.client_info?.android_client_info?.package_name);
  const pkg = expoConfig?.android?.package;
  if (pkg && !packages.includes(pkg)) {
    die(
      `google-services.json không có app cho package "${pkg}" (chỉ có: ${packages.join(', ') || '—'}).\n` +
        '  Tải nhầm file của app khác — Gradle sẽ từ chối.',
    );
  }
  if (json.project_info?.project_id !== target.projectId) {
    console.warn(
      `⚠ google-services.json thuộc project "${json.project_info?.project_id}" còn target phân phối là ` +
        `"${target.projectId}" — hợp lệ nếu cố ý tách push và phân phối, nhưng thường là nhầm file.\n`,
    );
  }
}

function readExpoConfig() {
  try {
    requireFromExpo('@expo/env').load(ROOT, { silent: true });
    return requireFromExpo('@expo/config').getConfig(ROOT, { skipSDKVersionRequirement: true }).exp;
  } catch {
    return undefined;
  }
}

async function buildApk(sdk) {
  const buildEnv = { ...process.env, ANDROID_HOME: sdk, EXPO_NO_GIT_STATUS: '1' };
  const expoCli = createRequire(import.meta.url).resolve('expo/bin/cli');

  // ── prebuild chỉ khi native đổi ──
  const { createFingerprintAsync, SourceSkips } = requireFromExpo('@expo/fingerprint');
  const { hash: fingerprint } = await createFingerprintAsync(ROOT, {
    platforms: ['android'],
    silent: true,
    sourceSkips: SourceSkips.PackageJsonScriptsAll,
  });
  const reason = args.flag('prebuild')
    ? 'bạn ép --prebuild'
    : !fs.existsSync(ANDROID_DIR)
      ? 'chưa có thư mục android/'
      : readState().fingerprint !== fingerprint
        ? 'phần native đã đổi từ lần build trước'
        : null;
  if (reason && args.flag('no-prebuild')) {
    log(`▶ Bỏ qua prebuild (--no-prebuild) dù ${reason} — chỉ đúng khi CHỈ sửa JS.\n`);
  } else if (reason) {
    log(`▶ expo prebuild (${reason})…\n`);
    const r = spawnSync(
      process.execPath,
      [expoCli, 'prebuild', '--platform', 'android', '--no-install'],
      { cwd: ROOT, stdio: 'inherit', env: buildEnv },
    );
    if (r.status !== 0) die('prebuild thất bại — dừng, không build bằng cấu hình cũ.');
    writeState({ ...readState(), fingerprint });
  }

  // ── Metro cache: bộ EXPO_PUBLIC_* đổi (hoặc chưa từng build release) thì xoá — không thì bundle có thể mang giá trị cũ ──
  if (readState().envHash !== envHash && fs.existsSync(METRO_CACHE)) {
    log('▶ Bộ EXPO_PUBLIC_* của target khác lần build trước → xoá cache Metro.\n');
    fs.rmSync(METRO_CACHE, { recursive: true, force: true });
  }

  // ── versionCode/versionName ──
  const gradleFile = path.join(ANDROID_DIR, 'app/build.gradle');
  fs.writeFileSync(
    gradleFile,
    patchGradleVersion(fs.readFileSync(gradleFile, 'utf8'), versionCode, version),
  );

  // ── bộ nhớ Gradle ── `gradle.properties` cũng do prebuild sinh lại (mặc định 2g/512m — không đủ cho release).
  const propsFile = path.join(ANDROID_DIR, 'gradle.properties');
  fs.writeFileSync(
    propsFile,
    setGradleProperty(fs.readFileSync(propsFile, 'utf8'), 'org.gradle.jvmargs', jvmArgs),
  );

  // ── Gradle ── đường dẫn TUYỆT ĐỐI trong ngoặc kép, MỘT chuỗi lệnh (xem `ensure-dev-build.mjs`).
  const gradlew = path.join(ANDROID_DIR, IS_WIN ? 'gradlew.bat' : 'gradlew');
  const startedAt = Date.now();
  fs.rmSync(APK_DIR, { recursive: true, force: true });
  /**
   * ⛔ XOÁ bundle JS của bản release TRƯỚC khi gọi Gradle — nếu không, `createBundleReleaseJsAndAssets` bị coi
   * là "up-to-date" và bundle CŨ được đóng gói nguyên vào APK, bất kể ta đã nạp `EXPO_PUBLIC_*` của target.
   *
   * Sự cố 2026-09-29: sau vài lần `gradlew assembleRelease` chạy tay (để thử trên máy ảo, dùng `.env` dev),
   * lần phân phối kế tiếp cho ra APK nhúng `http://10.0.2.2:3000/api/v1`. Biến môi trường KHÔNG nằm trong đầu
   * vào mà Gradle băm, nên đổi target/API cũng không làm task hết "up-to-date" — chỉ nội dung file JS mới làm.
   * Cửa kiểm ở `inspectApk` đã chặn (không đẩy bản hỏng), đây là xoá luôn nguyên nhân.
   */
  for (const dir of RELEASE_BUNDLE_DIRS) fs.rmSync(dir, { recursive: true, force: true });
  log(`▶ Gradle assembleRelease (ký debug key — CHỈ ĐỂ TEST, ABI ${abis})…\n`);
  const g = spawnSync(
    `"${gradlew}" app:assembleRelease -x lint -x test --configure-on-demand "-PreactNativeArchitectures=${abis}" --console=plain`,
    { cwd: ANDROID_DIR, stdio: 'inherit', shell: true, env: buildEnv },
  );
  if (g.status !== 0) {
    die(
      'Gradle build thất bại — dừng, không đẩy nhầm bản cũ lên.\n' +
        '  Thấy "daemon disappeared unexpectedly" = hết bộ nhớ (xem `OutOfMemoryError` trong log daemon): daemon chết\n' +
        '  vẫn có thể giữ khoá file → `android\\gradlew --stop`, kill java.exe của GradleDaemon/KotlinCompileDaemon\n' +
        '  còn sót (⚠ đừng kill Android Studio), rồi chạy lại. Chỉnh bộ nhớ bằng "gradleJvmArgs" trong target.',
    );
  }

  const fresh = (fs.existsSync(APK_DIR) ? fs.readdirSync(APK_DIR) : [])
    .filter((f) => f.endsWith('.apk'))
    .map((f) => path.join(APK_DIR, f))
    .filter((f) => fs.statSync(f).mtimeMs >= startedAt - 1000);
  if (fresh.length === 0) die(`Gradle xong nhưng không có APK mới trong ${APK_DIR}.`);
  writeState({ ...readState(), versionCode, envHash });
  return fresh.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
}

/** Trả danh sách lỗi (rỗng = đạt). */
function inspectApk(file, { expectHost, expectVersionCode } = {}) {
  if (!fs.existsSync(file)) return [`Không thấy APK: ${file}`];
  const problems = [];
  if (expectHost) {
    const bundle = readApkBundle(file);
    if (!bundle) {
      problems.push(
        'APK không có assets/index.android.bundle — đây là bản debug nạp JS từ Metro, tester không chạy được.',
      );
    } else if (!bundle.includes(Buffer.from(expectHost))) {
      problems.push(
        `JS bundle KHÔNG chứa "${expectHost}" — bản build đang trỏ API khác (nhiều khả năng cache Metro cũ ` +
          'hoặc EXPO_PUBLIC_API_BASE_URL của target không tới được Gradle). Tester sẽ không kết nối được.',
      );
    }
  }
  const badging = readBadging(file);
  if (badging) {
    const pkg = readExpoConfig()?.android?.package;
    if (pkg && badging.pkg !== pkg) {
      problems.push(`APK có package "${badging.pkg}", app.config.ts khai "${pkg}".`);
    }
    if (expectVersionCode !== undefined && badging.versionCode !== expectVersionCode) {
      problems.push(`APK có versionCode ${badging.versionCode}, dự kiến ${expectVersionCode}.`);
    }
  }
  return problems;
}

/** `aapt2 dump badging` nếu có (build-tools của SDK) — không có thì bỏ qua kiểm package/versionCode. */
function readBadging(file) {
  const sdk = findAndroidSdk();
  const tools = sdk && path.join(sdk, 'build-tools');
  if (!tools || !fs.existsSync(tools)) return null;
  const newest = fs
    .readdirSync(tools)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .pop();
  const aapt2 = newest && path.join(tools, newest, IS_WIN ? 'aapt2.exe' : 'aapt2');
  if (!aapt2 || !fs.existsSync(aapt2)) return null;
  const r = spawnSync(aapt2, ['dump', 'badging', file], { encoding: 'utf8' });
  const m = /package: name='([^']+)' versionCode='(\d+)'/.exec(r.stdout ?? '');
  return m ? { pkg: m[1], versionCode: Number(m[2]) } : null;
}

function readMessage() {
  const file = args.value('notes-file');
  if (file) {
    const p = path.resolve(ROOT, file);
    if (!fs.existsSync(p)) die(`Không thấy file ghi chú: ${p}`);
    return fs.readFileSync(p, 'utf8');
  }
  return args.value('notes', args.value('release-notes', ''));
}

function readGit() {
  const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
  const commit = git('rev-parse', '--short', 'HEAD');
  if (commit.status !== 0) return undefined;
  return {
    commit: commit.stdout.trim(),
    branch: git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim(),
    subject: git('log', '-1', '--pretty=%s').stdout.trim(),
    dirty: git('status', '--porcelain', '--', '.').stdout.trim().length > 0,
  };
}
