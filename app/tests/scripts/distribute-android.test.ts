import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';

/**
 * Test cho `scripts/distribute-android.mjs` (đẩy APK lên Firebase App Distribution).
 *
 * ── Vì sao test bằng cách CHẠY script, không import ───────────────────────────
 * Script là ESM (`.mjs`) còn Jest ở đây chạy CommonJS; và điều cần bảo vệ là hành vi của CLI: những
 * chốt chặn chạy TRƯỚC khi tốn 5–10 phút build. Nên ta chạy script thật với một file cấu hình GIẢ ở thư
 * mục tạm, dùng `--dry-run` (không mạng, không đăng nhập, không SDK) và `--check-apk`.
 *
 * ⚠️ Mỗi lần chạy tới bước "kế hoạch" phải nạp `app.config.ts` (vài giây) nên các ca dùng `--dry-run`
 * đặt timeout riêng và gom nhiều khẳng định vào một lần chạy.
 */
const ROOT = path.join(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'distribute-android.mjs');
const SLOW = 90_000;

const HOST = 'api.example.com';

function target(over: Record<string, unknown> = {}) {
  return {
    projectId: 'p-1',
    appId: '1:123456:android:abcdef01',
    groups: ['g-1'],
    env: { EXPO_PUBLIC_API_BASE_URL: `https://${HOST}/api/v1` },
    ...over,
  };
}

function run(args: string[], config?: unknown) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'distribute-test-'));
  try {
    const configFile = path.join(dir, 'distribute.config.json');
    fs.writeFileSync(
      configFile,
      JSON.stringify(config ?? { defaultTarget: 't', targets: { t: target() } }),
    );
    const env = { ...process.env };
    delete env.SUPERAPP_DISTRIBUTE_CONFIG;
    delete env.SUPERAPP_DISTRIBUTE_TARGET;
    const r = spawnSync(process.execPath, [SCRIPT, '--config', configFile, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      env,
    });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Zip tối thiểu một entry (method 0 = stored, 8 = deflate) — đủ cho `readZipEntry`. */
function zipWith(name: string, content: Buffer, method: 0 | 8): Buffer {
  const data = method === 8 ? deflateRawSync(content) : content;
  const nameBuf = Buffer.from(name);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  const localPart = Buffer.concat([local, nameBuf, data]);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  const centralPart = Buffer.concat([central, nameBuf]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralPart.length, 12);
  eocd.writeUInt32LE(localPart.length, 16);
  return Buffer.concat([localPart, centralPart, eocd]);
}

function checkApk(entryName: string, content: string, method: 0 | 8, host: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'distribute-apk-'));
  try {
    const apk = path.join(dir, 'app.apk');
    fs.writeFileSync(apk, zipWith(entryName, Buffer.from(content), method));
    return run(['--check-apk', apk, '--expect-host', host]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('distribute-android — cấu hình', () => {
  it('--list liệt kê đích và đánh dấu mặc định', () => {
    const r = run(['--list'], {
      defaultTarget: 'b',
      targets: { a: target(), b: target({ description: 'đích B' }) },
    });
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/→ b\s+p-1\s+đích B/);
  });

  it('chặn target còn giá trị mẫu DIEN_* — không gọi API với ID rác', () => {
    const r = run(['--dry-run'], {
      defaultTarget: 't',
      targets: { t: target({ projectId: 'DIEN_PROJECT_ID', appId: 'DIEN_APP_ID' }) },
    });
    expect(r.status).toBe(1);
    expect(r.out).toContain('giá trị mẫu chưa điền');
  });

  it('chặn appId sai dạng Android (vd chép nhầm App ID iOS)', () => {
    const r = run(['--dry-run'], {
      defaultTarget: 't',
      targets: { t: target({ appId: '1:123456:ios:abcdef01' }) },
    });
    expect(r.status).toBe(1);
    expect(r.out).toContain('không đúng dạng Android');
  });

  it('chặn tên file credential không chứa "service-account" (lọt .gitignore = lộ khoá)', () => {
    const r = run(['--dry-run'], {
      defaultTarget: 't',
      targets: { t: target({ credentialFile: 'creds.json' }) },
    });
    expect(r.status).toBe(1);
    expect(r.out).toContain('service-account');
  });

  it('--upload-only và --build-only loại trừ nhau', () => {
    const r = run(['--upload-only', '--build-only']);
    expect(r.status).toBe(1);
    expect(r.out).toContain('loại trừ nhau');
  });

  it('chặn ABI không hợp lệ', () => {
    const r = run(['--dry-run', '--abi', 'mips']);
    expect(r.status).toBe(1);
    expect(r.out).toContain('ABI không hợp lệ');
  });
});

describe('distribute-android --dry-run', () => {
  it(
    'in đủ kế hoạch: đích, API của target, versionCode, và lệnh firebase dùng FILE ghi chú',
    () => {
      const r = run([
        '--dry-run',
        '--notes',
        'Sửa lỗi X nhiều chữ',
        '--groups',
        'a,b',
        '--testers',
        'x@y.com',
      ]);
      expect(r.status).toBe(0);
      expect(r.out).toContain(`API      : ${HOST}`);
      expect(r.out).toMatch(/versionCode \d+/);
      expect(r.out).toContain('ABI arm64-v8a');
      expect(r.out).toContain('gradlew app:assembleRelease "-PreactNativeArchitectures=arm64-v8a"');
      // ⛔ template Expo mặc định MaxMetaspaceSize=512m làm daemon chết OOM lúc build release.
      expect(r.out).toMatch(/org\.gradle\.jvmargs=-Xmx\d+m -XX:MaxMetaspaceSize=\d+m/);
      // ⛔ ghi chú nhiều chữ/nhiều dòng KHÔNG được đi qua --release-notes trên Windows (cmd.exe cắt vụn).
      expect(r.out).toContain('--release-notes-file');
      expect(r.out).not.toMatch(/--release-notes\s/);
      expect(r.out).toContain('appdistribution:distribute');
      expect(r.out).toContain('--app 1:123456:android:abcdef01');
      expect(r.out).toContain('--project p-1');
      expect(r.out).toContain('--groups a,b');
      expect(r.out).toContain('--testers x@y.com');
    },
    SLOW,
  );

  it(
    '--abi universal ghép đủ 4 ABI; --version-code đè số tự tính; --upload-only bỏ bước build',
    () => {
      const full = run(['--dry-run', '--abi', 'universal', '--version-code', '4242']);
      expect(full.status).toBe(0);
      expect(full.out).toContain('versionCode 4242');
      expect(full.out).toContain('armeabi-v7a,arm64-v8a,x86,x86_64');

      const only = run(['--dry-run', '--upload-only']);
      expect(only.status).toBe(0);
      expect(only.out).not.toContain('gradlew');
      expect(only.out).toContain('appdistribution:distribute');
    },
    SLOW * 2,
  );

  it(
    '--add-testers in lệnh thêm vào group đầu tiên của target',
    () => {
      const r = run(['--dry-run', '--add-testers', 'a@x.com,b@x.com']);
      expect(r.status).toBe(0);
      expect(r.out).toContain('appdistribution:testers:add a@x.com b@x.com --group-alias g-1');
    },
    SLOW,
  );
});

describe('distribute-android --check-apk', () => {
  it.each([0, 8] as const)('đạt khi JS bundle chứa host API (zip method %i)', (method) => {
    const r = checkApk('assets/index.android.bundle', `x="https://${HOST}/api/v1";`, method, HOST);
    expect(r.status).toBe(0);
    expect(r.out).toContain('đạt kiểm tra');
  });

  it('KHÔNG đạt khi bundle trỏ API khác — tester sẽ không kết nối được', () => {
    const r = checkApk('assets/index.android.bundle', 'x="http://10.0.2.2:3000/api/v1";', 8, HOST);
    expect(r.status).toBe(1);
    expect(r.out).toContain(`KHÔNG chứa "${HOST}"`);
  });

  it('KHÔNG đạt khi APK không nhúng bundle (bản debug nạp JS từ Metro)', () => {
    const r = checkApk('classes.dex', 'dex', 0, HOST);
    expect(r.status).toBe(1);
    expect(r.out).toContain('không có assets/index.android.bundle');
  });
});
