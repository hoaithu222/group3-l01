/**
 * distribute.mjs — các hàm THUẦN cho `scripts/distribute-android.mjs` (đọc cấu hình, tính số phiên bản,
 * ghép ghi chú phát hành, quote lệnh cho shell, đọc file trong APK). Không gọi mạng, không chạy tiến
 * trình con — nên kiểm được bằng cách chạy CLI với `--dry-run` / `--check-apk` (xem
 * `tests/scripts/distribute-android.test.ts`).
 *
 * Tham chiếu thiết kế: `vci-sun-mobile/scripts/firebase-distribute.js` (đích khai trong file cấu hình,
 * không hardcode trong package.json).
 */
import fs from 'node:fs';
import { inflateRawSync } from 'node:zlib';

export const IS_WIN = process.platform === 'win32';

/** Cờ KHÔNG nhận giá trị — nếu không khai, `--dry-run "ghi chú"` sẽ bị nuốt làm giá trị của `--dry-run`. */
export const BOOLEAN_FLAGS = new Set([
  'help',
  'list',
  'dry-run',
  'preflight-only',
  'upload-only',
  'build-only',
  'prebuild',
  'no-prebuild',
]);

/** ABI hợp lệ của React Native + preset thường dùng. */
const ALL_ABIS = ['armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64'];
const ABI_PRESETS = { universal: ALL_ABIS.join(',') };

/** Gốc tính số phiên bản: phút kể từ 2026-01-01 UTC. */
const VERSION_CODE_EPOCH = Date.UTC(2026, 0, 1);
/** Giới hạn của Android: versionCode ≤ 2.100.000.000. */
const VERSION_CODE_MAX = 2_100_000_000;
/** Firebase App Distribution cắt ghi chú ở 5000 ký tự. */
const NOTES_MAX = 4900;

/** `--name value` · `--name=value` · `--flag`. Không dấu `--` là đối số vị trí. */
export function parseArgs(argv, booleans = BOOLEAN_FLAGS) {
  const values = new Map();
  const flags = new Set();
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const eq = token.indexOf('=');
    if (eq !== -1) {
      values.set(token.slice(2, eq), token.slice(eq + 1));
      continue;
    }
    const name = token.slice(2);
    const next = argv[i + 1];
    if (booleans.has(name) || next === undefined || next.startsWith('--')) {
      flags.add(name);
    } else {
      values.set(name, next);
      i += 1;
    }
  }
  return {
    positional,
    flag: (name) => flags.has(name),
    value: (name, fallback) => values.get(name) ?? fallback,
  };
}

export function loadConfig(file) {
  if (!fs.existsSync(file)) throw new Error(`Không thấy file cấu hình: ${file}`);
  let config;
  try {
    config = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`${file} không phải JSON hợp lệ: ${e.message}`);
  }
  if (!config.targets || Object.keys(config.targets).length === 0) {
    throw new Error(`${file} chưa khai target nào.`);
  }
  return config;
}

/** Chọn + kiểm một target; ném lỗi kèm cách sửa. */
export function pickTarget(config, requested) {
  const names = Object.keys(config.targets);
  const name = requested || config.defaultTarget;
  if (!name) throw new Error('Chưa chọn đích. Dùng --target <tên>, hoặc khai "defaultTarget".');
  const target = config.targets[name];
  if (!target) throw new Error(`Không có target "${name}". Đang khai: ${names.join(', ')}`);

  for (const field of ['projectId', 'appId']) {
    if (!target[field]) throw new Error(`Target "${name}" thiếu trường bắt buộc "${field}".`);
  }
  if (/^DIEN_/.test(target.projectId) || /^DIEN_/.test(target.appId)) {
    throw new Error(
      `Target "${name}" còn giá trị mẫu chưa điền (${target.projectId} / ${target.appId}).\n` +
        '  Lấy ở Firebase Console → Project settings → Your apps → Android.',
    );
  }
  // Sai dạng App ID là lỗi "App with ID … not found" sau 5–10 phút build — chặn sớm ở đây.
  if (!/^\d+:\d+:android:[0-9a-f]+$/.test(target.appId)) {
    throw new Error(
      `Target "${name}": appId "${target.appId}" không đúng dạng Android ` +
        '(1:<số>:android:<mã hex>). Chép nhầm App ID của iOS/Web?',
    );
  }
  return { name, target };
}

/** `arm64-v8a` · `x86_64` · `universal` · danh sách phân cách dấu phẩy → chuỗi cho `-PreactNativeArchitectures`. */
export function resolveAbis(value) {
  const raw = ABI_PRESETS[value] ?? value;
  const list = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const bad = list.filter((abi) => !ALL_ABIS.includes(abi));
  if (list.length === 0 || bad.length) {
    throw new Error(
      `ABI không hợp lệ: ${bad.join(', ') || '(rỗng)'}. Hợp lệ: ${ALL_ABIS.join(', ')} hoặc universal.`,
    );
  }
  return list.join(',');
}

/**
 * Số phiên bản (`versionCode`) tăng dần theo thời gian, luôn > `last`.
 *
 * ⚠️ Android KHÔNG cho cài đè bản có versionCode thấp hơn hoặc bằng bản đã cài (báo "App not
 * installed"), và Firebase App Tester dựa vào nó để hiện "Update available". Đếm theo phút nên hai lần
 * build cùng phút vẫn khác nhau nhờ `last + 1`.
 */
export function computeVersionCode(now = Date.now(), last = 0) {
  const code = Math.max(Math.floor((now - VERSION_CODE_EPOCH) / 60_000), last + 1);
  if (code > VERSION_CODE_MAX) throw new Error(`versionCode ${code} vượt giới hạn của Android.`);
  return code;
}

/** Ghi `versionCode`/`versionName` vào `android/app/build.gradle` (file SINH RA bởi prebuild, gitignore). */
export function patchGradleVersion(text, versionCode, versionName) {
  const code = /(\bversionCode\s+)\d+/;
  const name = /(\bversionName\s+)(["'])[^"'\r\n]*\2/;
  if (!code.test(text) || !name.test(text)) {
    throw new Error(
      'Không thấy versionCode/versionName trong android/app/build.gradle — template prebuild đã đổi? ' +
        'Sửa `patchGradleVersion` trong scripts/lib/distribute.mjs cho khớp.',
    );
  }
  return text.replace(code, `$1${versionCode}`).replace(name, `$1"${versionName}"`);
}

/** Đặt (hoặc thêm) dòng `key=value` trong `gradle.properties`. */
export function setGradleProperty(text, key, value) {
  const line = `${key}=${value}`;
  const existing = new RegExp(`^${key.replace(/\./g, '\\.')}=.*$`, 'm');
  return existing.test(text)
    ? text.replace(existing, line)
    : `${text.replace(/\s*$/, '')}\n${line}\n`;
}

/**
 * Bộ nhớ cho Gradle daemon khi build release.
 *
 * ⛔ Template Expo đặt `-Xmx2048m -XX:MaxMetaspaceSize=512m` — build release (nhiều module Kotlin + Hermes)
 * làm daemon hết Metaspace và chết với thông báo không nhắc tới bộ nhớ: "Gradle build daemon disappeared
 * unexpectedly" (nguyên nhân thật nằm ở `OutOfMemoryError: Metaspace` trong log daemon). Tăng theo RAM máy.
 */
export function gradleJvmArgs(totalMemBytes) {
  const gb = totalMemBytes / 1024 ** 3;
  if (gb >= 12) return '-Xmx4096m -XX:MaxMetaspaceSize=2048m';
  if (gb >= 7) return '-Xmx3072m -XX:MaxMetaspaceSize=1536m';
  return '-Xmx2048m -XX:MaxMetaspaceSize=1024m';
}

/** Ghi chú phát hành nhiều dòng: lời nhắn của người chạy + dòng nhận diện bản build. */
export function buildReleaseNotes({ message, version, versionCode, git, apiHost, builtAt }) {
  const lines = [];
  if (message) lines.push(message.trim(), '');
  lines.push(`Super App v${version} (build ${versionCode})`);
  if (git?.commit) {
    const dirty = git.dirty ? ' · có thay đổi chưa commit' : '';
    lines.push(
      `${git.branch ?? '?'} @ ${git.commit}${git.subject ? ` — ${git.subject}` : ''}${dirty}`,
    );
  }
  if (apiHost) lines.push(`API: ${apiHost}`);
  lines.push(`Build: ${builtAt}`);
  return lines.join('\n').slice(0, NOTES_MAX);
}

/** Quote MỘT đối số cho shell (`cmd.exe` trên Windows, `sh` nơi khác). */
export function quoteArg(value, win = IS_WIN) {
  const s = String(value);
  if (win) {
    if (s !== '' && !/[\s"&|<>^()%!]/.test(s)) return s;
    return `"${s.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
  }
  return /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Chuỗi lệnh đã quote — dùng với `spawnSync(chuỗi, { shell: true })` (mảng args + shell bị Node cảnh báo DEP0190). */
export function commandLine(cmd, args, win = IS_WIN) {
  return [cmd, ...args].map((part) => quoteArg(part, win)).join(' ');
}

/** Bỏ mã màu ANSI khỏi output của CLI. */
export const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, ''); // eslint-disable-line no-control-regex

/**
 * Đọc MỘT file trong APK/zip (không cần gói ngoài). `null` nếu không có.
 * Chỉ hỗ trợ zip thường (stored/deflate) — đủ cho APK dưới 4 GB.
 */
export function readZipEntry(zipPath, entryName) {
  const buf = fs.readFileSync(zipPath);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error(`${zipPath} không phải file zip/APK hợp lệ.`);

  const total = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < total && buf.readUInt32LE(offset) === 0x02014b50; n += 1) {
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    if (buf.toString('utf8', offset + 46, offset + 46 + nameLen) === entryName) {
      const start =
        localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
      const data = buf.subarray(start, start + compressedSize);
      return method === 0 ? Buffer.from(data) : inflateRawSync(data);
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/** JS bundle nhúng trong APK. Trả `null` nếu APK không có (vd bản debug nạp JS từ Metro). */
export function readApkBundle(apkPath) {
  return readZipEntry(apkPath, 'assets/index.android.bundle');
}
