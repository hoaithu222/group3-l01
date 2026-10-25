/**
 * Bảo đảm mọi máy Android đang cắm có ĐÚNG bản development build của checkout
 * này, TRƯỚC khi mở Metro. Chạy trong `npm start`, `npm run start:clear` và
 * `npm run start:android[:clear]`. Muốn chỉ Metro thì `npm run start:metro[:clear]`.
 *
 * ── Vì sao cần ───────────────────────────────────────────────────────────────
 * `expo start` rồi bấm `a` chỉ MỞ app đã cài, không cài. Máy chưa có app thì:
 *   CommandError: No development build (com.mancode.vungnui) for this project is installed.
 * Bản `ensure-dev-build.sh` trước đây sinh ra đúng để chặn lỗi đó mà vẫn để lọt:
 *  1. Chỉ tìm `adb` trên PATH. Android Studio trên Windows KHÔNG thêm
 *     `platform-tools` vào PATH, còn Expo CLI tự dò `%LOCALAPPDATA%\Android\Sdk`
 *     → Expo thấy máy ảo, script thì không → "bỏ qua" → lỗi y nguyên.
 *  2. `bash scripts/…` trong npm script trên Windows đi qua cmd.exe, và `bash` có
 *     thể trúng `C:\Windows\System32\bash.exe` (WSL): không adb, không node dự án.
 *  3. Chỉ hỏi "đã cài chưa", không hỏi "cài bản NÀO". Thêm gói có phần native
 *     hay sửa plugin trong `app.config.ts` sau lần build trước thì app vẫn "đã
 *     cài" nhưng mở ra đỏ `Cannot find native module …`. ⚠️ `expo run:android`
 *     cũng KHÔNG prebuild lại khi `android/` đã có — sửa `app.config.ts` rồi
 *     `npm run android` vẫn ra native cũ.
 *
 * ── Làm gì ───────────────────────────────────────────────────────────────────
 *  1. Tìm SDK theo đúng thứ tự của Expo CLI (ANDROID_HOME → ANDROID_SDK_ROOT →
 *     chỗ cài mặc định) và gán ANDROID_HOME cho tiến trình con: Gradle cần nó.
 *  2. Đọc `android.package` từ `app.config.ts` (đã nạp `.env`), không viết cứng.
 *  3. So dấu vân tay native (`@expo/fingerprint`, chính thứ EAS dùng) với lần
 *     build gần nhất ghi ở `.expo/dev-build-android.json`. Lệch hoặc chưa có →
 *     `expo prebuild` + Gradle `assembleDebug` cho đúng ABI các máy đang cắm
 *     (vài phút; lần sau không đổi native thì bước này mất ~3 giây).
 *  4. So SHA-256 APK đã cài trên TỪNG máy với APK vừa build; khác → cài lại.
 *
 * Không có SDK hoặc không có máy nào cắm thì chỉ cảnh báo, Metro vẫn chạy tiếp
 * (vd máy thật đã cài bản EAS, quét QR).
 *
 * Chạy: node scripts/ensure-dev-build.mjs
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ANDROID_DIR = path.join(ROOT, 'android');
const APK = path.join(ANDROID_DIR, 'app/build/outputs/apk/debug/app-debug.apk');
const STATE_FILE = path.join(ROOT, '.expo/dev-build-android.json');
const IS_WIN = process.platform === 'win32';

// `@expo/config` · `@expo/env` · `@expo/fingerprint` là phụ thuộc của `expo`, lấy qua nó để khỏi khai thêm gói.
const requireFromExpo = createRequire(createRequire(import.meta.url).resolve('expo/package.json'));

const log = (msg) => console.log(`[dev-build] ${msg}`);
const fail = (msg) => {
  console.error(`[dev-build] ❌ ${msg}`);
  process.exit(1);
};

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', ...opts });
  return {
    ok: r.status === 0,
    out: `${r.stdout ?? ''}${r.stderr ?? ''}`.replace(/\r/g, '').trim(),
  };
}

function runOrFail(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', ...opts });
  if (r.status !== 0)
    fail(`Lệnh lỗi (mã ${r.status ?? r.error?.message}): ${cmd} ${args.join(' ')}`);
}

function resolveSdk() {
  const home = os.homedir();
  const fallback = IS_WIN
    ? path.join(process.env.LOCALAPPDATA ?? path.join(home, 'AppData/Local'), 'Android/Sdk')
    : process.platform === 'darwin'
      ? path.join(home, 'Library/Android/sdk')
      : path.join(home, 'Android/Sdk');
  return [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, fallback].find(
    (dir) => dir && fs.existsSync(dir),
  );
}

function resolveAdb(sdk) {
  const bundled = sdk && path.join(sdk, 'platform-tools', IS_WIN ? 'adb.exe' : 'adb');
  if (bundled && fs.existsSync(bundled)) return bundled;
  return run('adb', ['version']).ok ? 'adb' : null;
}

function listDevices(adb) {
  const devices = [];
  for (const line of run(adb, ['devices']).out.split('\n').slice(1)) {
    const [serial, state] = line.trim().split(/\s+/);
    if (!serial) continue;
    if (state !== 'device') {
      log(
        `⚠️  Bỏ qua ${serial} (${state}) — ${state === 'unauthorized' ? 'mở khoá máy và bấm "Cho phép gỡ lỗi USB"' : 'rút ra cắm lại hoặc khởi động lại máy ảo'}.`,
      );
      continue;
    }
    const abi = run(adb, ['-s', serial, 'shell', 'getprop', 'ro.product.cpu.abi']).out;
    devices.push({ serial, abi });
  }
  return devices;
}

async function readProject() {
  requireFromExpo('@expo/env').load(ROOT, { silent: true });
  const { getConfig } = requireFromExpo('@expo/config');
  const pkg = getConfig(ROOT, { skipSDKVersionRequirement: true }).exp.android?.package;
  if (!pkg) fail('app.config.ts chưa khai `android.package`.');
  const { createFingerprintAsync, SourceSkips } = requireFromExpo('@expo/fingerprint');
  // Bỏ `scripts` của package.json khỏi dấu vân tay: sửa một lệnh lint không phải lý do build lại native.
  const { hash } = await createFingerprintAsync(ROOT, {
    platforms: ['android'],
    silent: true,
    sourceSkips: SourceSkips.PackageJsonScriptsAll,
  });
  return { pkg, fingerprint: hash };
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function staleReason(state, fingerprint, abis) {
  if (!fs.existsSync(APK)) return 'chưa có APK';
  if (state?.fingerprint !== fingerprint) return 'phần native đã đổi từ lần build trước';
  const missing = abis.filter((abi) => !state.abis?.includes(abi));
  return missing.length ? `APK thiếu ABI ${missing.join(', ')}` : null;
}

function build(abis, fingerprint) {
  const expoCli = createRequire(import.meta.url).resolve('expo/bin/cli');
  // Prebuild SDK 57 mặc định `--clean` (dựng lại `android/` từ đầu) — đúng ý: plugin gỡ khỏi config không để
  // lại rác. `android/` bị gitignore nên câu hỏi "git đang bẩn, tiếp tục?" của nó vô nghĩa ở đây → tắt.
  runOrFail(process.execPath, [expoCli, 'prebuild', '--platform', 'android', '--no-install'], {
    env: { ...process.env, EXPO_NO_GIT_STATUS: '1' },
  });
  // `.bat` phải qua shell trên Windows (Node chặn spawn thẳng file .bat) → truyền MỘT chuỗi lệnh (mảng args kèm
  // `shell: true` bị Node cảnh báo DEP0190). Đường dẫn TUYỆT ĐỐI trong ngoặc kép: cmd.exe có thể không tìm file ở
  // thư mục hiện tại (`NoDefaultCurrentDirectoryInExePath`), và thư mục dự án có thể có dấu cách.
  const gradlew = path.join(ANDROID_DIR, IS_WIN ? 'gradlew.bat' : 'gradlew');
  const archs = `"-PreactNativeArchitectures=${abis.join(',')}"`;
  runOrFail(`"${gradlew}" app:assembleDebug -x lint -x test --configure-on-demand ${archs}`, [], {
    cwd: ANDROID_DIR,
    shell: true,
  });
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(
    STATE_FILE,
    `${JSON.stringify({ fingerprint, abis, builtAt: new Date().toISOString() }, null, 2)}\n`,
  );
}

/** SHA-256 của APK đang cài; `null` = chưa cài, `'unknown'` = máy không có `sha256sum` (Android < 8). */
function installedApkHash(adb, serial, pkg) {
  const line = run(adb, ['-s', serial, 'shell', 'pm', 'path', pkg])
    .out.split('\n')
    .find((l) => l.startsWith('package:'));
  if (!line) return null;
  const sum = run(adb, [
    '-s',
    serial,
    'shell',
    `sha256sum '${line.slice('package:'.length).trim()}'`,
  ]);
  return sum.ok ? sum.out.split(/\s+/)[0] : 'unknown';
}

function install(adb, serial, pkg) {
  log(`📲 Cài ${pkg} lên ${serial}…`);
  const r = run(adb, ['-s', serial, 'install', '-r', APK]);
  if (r.ok) return;
  if (r.out.includes('INSTALL_FAILED_UPDATE_INCOMPATIBLE')) {
    fail(
      `${serial} đang có bản ${pkg} ký bằng khoá KHÁC (vd bản EAS). Gỡ nó đi (mất dữ liệu app trên máy đó) rồi chạy lại:\n` +
        `    "${adb}" -s ${serial} uninstall ${pkg}`,
    );
  }
  fail(`Cài lên ${serial} thất bại:\n${r.out}`);
}

async function main() {
  const sdk = resolveSdk();
  if (sdk) process.env.ANDROID_HOME = sdk;
  const adb = resolveAdb(sdk);
  if (!adb) {
    log('⚠️  Không tìm thấy Android SDK/adb (đặt ANDROID_HOME) — bỏ qua kiểm tra dev build.');
    return;
  }
  const devices = listDevices(adb);
  if (!devices.length) {
    log('⚠️  Không có máy Android/máy ảo nào đang kết nối — bỏ qua kiểm tra dev build.');
    return;
  }

  const { pkg, fingerprint } = await readProject();
  const abis = [...new Set(devices.map((d) => d.abi))];
  const reason = staleReason(readState(), fingerprint, abis);
  if (reason) {
    log(`🔨 Build dev client (${reason}) — lần đầu mất vài phút…`);
    build(abis, fingerprint);
  }

  const localHash = createHash('sha256').update(fs.readFileSync(APK)).digest('hex');
  for (const { serial } of devices) {
    const remote = installedApkHash(adb, serial, pkg);
    if (remote === localHash || (remote === 'unknown' && !reason)) {
      log(`✅ ${serial}: đã có đúng bản dev build.`);
      continue;
    }
    install(adb, serial, pkg);
  }
}

await main();
