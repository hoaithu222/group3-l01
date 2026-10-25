const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod, withMainApplication } = require('expo/config-plugins');

/**
 * Config plugin — chuông CUỘC GỌI ĐẾN dựng bằng **native**, không qua JavaScript.
 *
 * ## Vì sao tồn tại (p2-02)
 *
 * Đường đã chốt trong README p2-02 là `react-native-callkeep` (self-managed
 * `ConnectionService`). Nó CHẾT trên RN 0.86 — lý do đầy đủ ở `app.config.ts`, chỗ hai
 * plugin CallKeep bị comment. Hệ quả: từ 29/09/2026 app **không có đường nào** đổ chuông
 * khi máy khoá / app bị tắt; push vẫn tới máy, chỉ là không ai dựng thông báo.
 *
 * Plugin này thay bằng đúng kiến trúc đang chạy ổn ở dự án `vci-sun-mobile`:
 *
 * ```
 * FCM data-only ─► CallPushReceiver (native, chạy cả khi app tắt hẳn)
 *    ├─ call.incoming ─► notification kênh `superapp-call-ring-v1` (nhạc chuông hệ thống)
 *    │                     └─ fullScreenIntent ─► IncomingCallActivity : ReactActivity
 *    │                           showWhenLocked · turnScreenOn · task riêng
 *    │                           root RN "IncomingCall" (CÙNG JS runtime với app)
 *    └─ call.cancelled | call.answered-elsewhere | call.missed
 *                   ├─ huỷ notification
 *                   ├─ emit sự kiện sang JS (DeviceEventEmitter)
 *                   └─ finish activity CHỈ KHI JS chưa nhận cuộc (cờ holdActive)
 * ```
 *
 * ## Receiver thứ hai, không phải thay thế
 *
 * `com.google.android.c2dm.intent.RECEIVE` phát tới MỌI receiver khớp trong app. Ta thêm
 * một cái nữa bên cạnh của `@react-native-firebase/messaging` — chat và push thường vẫn đi
 * đường cũ. `priority=1` chỉ để chạy sớm; receiver KHÔNG abort broadcast.
 *
 * ⛔ `android/` là CNG (gitignored, `expo prebuild` sinh lại sạch) — mọi thứ phải đi qua
 * plugin này, đừng sửa tay trong `android/`.
 */
const RECEIVER_NAME = '.CallPushReceiver';
const ACTIVITY_NAME = '.IncomingCallActivity';

/** ⚠️ Thêm file Kotlin mới thì phải khai ở đây, nếu không nó không được chép sang. */
const SOURCE_FILES = [
  'CallPushReceiver.kt',
  'IncomingCallActivity.kt',
  'CallForegroundService.kt',
  'LockScreenCallState.kt',
  'LockScreenCallModule.kt',
  'LockScreenCallPackage.kt',
];
const SERVICE_NAME = '.CallForegroundService';
const PACKAGE_CLASS = 'LockScreenCallPackage';
const FCM_RECEIVE_ACTION = 'com.google.android.c2dm.intent.RECEIVE';

/** Chỉ app được GmsCore ký mới bắn được broadcast này — chặn app khác giả cuộc gọi đến. */
const C2DM_PERMISSION = 'com.google.android.c2dm.permission.SEND';

/** Chép file Kotlin vào đúng package của app (theo `android.package` + `scheme` của app config). */
const withReceiverSource = (config) =>
  withDangerousMod(config, [
    'android',
    async (cfg) => {
      const pkg = cfg.android?.package;
      if (!pkg) throw new Error('[call-notification] thiếu `android.package` trong app config');
      const scheme = Array.isArray(cfg.scheme) ? cfg.scheme[0] : cfg.scheme;
      if (!scheme) throw new Error('[call-notification] thiếu `scheme` trong app config');

      const target = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/java', ...pkg.split('.'));
      fs.mkdirSync(target, { recursive: true });

      for (const file of SOURCE_FILES) {
        const source = fs.readFileSync(
          path.join(cfg.modRequest.projectRoot, 'plugins/call-notification', file),
          'utf8',
        );
        // Package + scheme viết cứng trong file nguồn cho dễ đọc; ghi đè theo cấu hình THẬT để
        // đổi `ANDROID_PACKAGE`/`APP_SCHEME` trong `.env` không làm hỏng build một cách khó hiểu.
        const patched = source
          .replace(/^package .+$/m, `package ${pkg}`)
          .replace(/^(\s*const val SCHEME = ").*(")$/m, `$1${scheme}$2`);
        fs.writeFileSync(path.join(target, file), patched, 'utf8');
      }
      return cfg;
    },
  ]);

const withReceiverManifest = (config) =>
  withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) throw new Error('[call-notification] không tìm thấy <application> trong manifest');

    /**
     * GỠ bản cũ rồi khai lại, thay vì "đã có thì thôi".
     *
     * ⛔ Đừng đổi về kiểu bỏ-qua-nếu-tồn-tại: `expo prebuild` KHÔNG `--clean` chạy trên manifest
     * đã sinh lần trước, nên mọi sửa đổi ở plugin sẽ không bao giờ áp — và cái sai đó im lặng.
     */
    app.receiver = (app.receiver ?? []).filter((r) => r.$?.['android:name'] !== RECEIVER_NAME);
    app.receiver.push({
      $: {
        'android:name': RECEIVER_NAME,
        // Bắt buộc `exported` để nhận broadcast từ GmsCore (tiến trình khác).
        'android:exported': 'true',
        'android:permission': C2DM_PERMISSION,
      },
      'intent-filter': [
        { $: { 'android:priority': '1' }, action: [{ $: { 'android:name': FCM_RECEIVE_ACTION } }] },
      ],
    });

    // Cùng lối gỡ-rồi-khai-lại như receiver ở trên.
    app.activity = (app.activity ?? []).filter((a) => a.$?.['android:name'] !== ACTIVITY_NAME);
    app.activity.push({
      $: {
        'android:name': ACTIVITY_NAME,
        // Không ai ngoài app được mở màn gọi — nó chỉ tới từ full-screen intent của chính
        // `CallPushReceiver`.
        'android:exported': 'false',
        // ⛔ Hai dòng này LÀ lý do plugin tồn tại: thiếu chúng thì full-screen intent vẫn kích
        // hoạt nhưng keyguard che mất, người dùng chỉ thấy thông báo.
        'android:showWhenLocked': 'true',
        'android:turnScreenOn': 'true',
        'android:excludeFromRecents': 'true',
        'android:launchMode': 'singleTask',
        // Task RIÊNG: màn gọi bung ra không được xáo trộn back-stack của app.
        'android:taskAffinity': `${cfg.android?.package ?? ''}.call`,
        'android:screenOrientation': 'portrait',
        'android:configChanges': 'keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode',
        // KHÔNG dùng theme splash — màn gọi mà nháy splash thì kỳ.
        'android:theme': '@style/AppTheme',
      },
    });

    /**
     * Foreground service giữ micro/camera sống khi app ra nền giữa cuộc gọi.
     *
     * ⛔ `foregroundServiceType` phải khai TRONG MANIFEST, không chỉ truyền lúc `startForeground`:
     * thiếu ở đây là `MissingForegroundServiceTypeException` ngay lần bật đầu trên Android 14.
     * Quyền `FOREGROUND_SERVICE_MICROPHONE`/`FOREGROUND_SERVICE_CAMERA` đã khai ở
     * `app.config.ts` → `android.permissions`.
     */
    app.service = (app.service ?? []).filter((s) => s.$?.['android:name'] !== SERVICE_NAME);
    app.service.push({
      $: {
        'android:name': SERVICE_NAME,
        'android:exported': 'false',
        'android:foregroundServiceType': 'microphone|camera',
      },
    });
    return cfg;
  });

/**
 * Đăng ký `LockScreenCallPackage` vào danh sách package của `MainApplication`.
 *
 * Chèn vào khối `PackageList(this).packages.apply { … }` mà template Expo sinh sẵn (nó vốn
 * có comment "Packages that cannot be autolinked yet").
 */
const withLockScreenPackage = (config) =>
  withMainApplication(config, (cfg) => {
    let src = cfg.modResults.contents;
    const call = `add(${PACKAGE_CLASS}())`;
    if (!src.includes(call)) {
      src = src.replace(/(PackageList\(this\)\.packages\.apply \{\n)/, `$1          ${call}\n`);
      if (!src.includes(call)) {
        throw new Error(
          '[call-notification] không chèn được LockScreenCallPackage vào MainApplication — ' +
            'template Expo đã đổi, xem lại regex',
        );
      }
    }
    cfg.modResults.contents = src;
    return cfg;
  });

module.exports = (config) => withLockScreenPackage(withReceiverManifest(withReceiverSource(config)));
