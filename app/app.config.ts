import type { ConfigContext, ExpoConfig } from 'expo/config';
import {
  AndroidConfig,
  withAndroidManifest,
  withProjectBuildGradle,
  type ConfigPlugin,
} from 'expo/config-plugins';


/**
 * Cấu hình Expo — thay cho `app.json`.
 *
 * Dùng file `.ts` chứ không phải JSON vì mọi giá trị đổi theo môi trường (tên
 * app, package id, URL API, project EAS) phải đọc được từ `.env`. Với `app.json`
 * thì chúng bị đóng cứng trong repo, và mỗi lần build cho môi trường khác lại
 * phải sửa file rồi nhớ hoàn nguyên — chỗ này đã sinh ra vô số bản build nhầm
 * môi trường ở các dự án khác.
 *
 * ── Hai lớp biến môi trường, ĐỪNG nhầm ───────────────────────────────────────
 *
 *  · **Biến LÚC BUILD** (`APP_NAME`, `ANDROID_PACKAGE`, `EAS_PROJECT_ID`…)
 *    — chỉ file này đọc. Chạy trong Node lúc dựng cấu hình nên đọc được TOÀN BỘ
 *    `process.env`. KHÔNG vào bundle.
 *
 *  · **Biến LÚC CHẠY** (`EXPO_PUBLIC_*`) — code trong `src/` đọc qua
 *    `process.env.EXPO_PUBLIC_…`. Metro thay THẲNG chuỗi vào bundle lúc build.
 *
 *    ⛔ Vì là thay chuỗi tĩnh nên **bắt buộc viết đủ tên biến ngay tại chỗ đọc**.
 *       `process.env[key]` với `key` là biến sẽ ra `undefined` — xem cách viết
 *       đúng ở `src/core/config/env.config.ts`.
 *    ⛔ Và vì nằm trong bundle nên bất kỳ ai giải nén APK cũng đọc được.
 *       KHÔNG đặt secret (khoá ký, chuỗi kết nối, private key) vào `EXPO_PUBLIC_*`.
 *
 * Expo CLI tự nạp `.env` vào `process.env` TRƯỚC khi chạy file này, nên không
 * cần `dotenv`.
 */

/** Đọc biến build-time, có giá trị mặc định. */
const env = (key: string, fallback: string): string => process.env[key]?.trim() || fallback;

const APP_NAME = env('APP_NAME', 'Super App');
const APP_SLUG = env('APP_SLUG', 'super-app');
const APP_SCHEME = env('APP_SCHEME', 'superapp');
const ANDROID_PACKAGE = env('ANDROID_PACKAGE', 'com.mancode.vungnui');
const IOS_BUNDLE_ID = env('IOS_BUNDLE_ID', 'com.mancode.vungnui');
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID?.trim();

/**
 * Push (p0-06) — hai biến LÚC BUILD, cả hai tuỳ chọn:
 *
 *  · `GOOGLE_SERVICES_JSON` — đường dẫn tới `google-services.json` của Firebase. Trên EAS đặt là biến
 *    môi trường kiểu FILE (EAS chép file tạm rồi gán ĐƯỜNG DẪN vào biến). Thiếu thì KHÔNG khai
 *    `android.googleServicesFile` (khai đường dẫn không tồn tại làm `expo prebuild` chết): app vẫn build
 *    và chạy, chỉ là `getDevicePushTokenAsync()` ném "FirebaseApp is not initialized" → không đăng ký
 *    được token, không nhận push. Tệp là secret của dự án — ⛔ không commit.
 *  · `APS_ENVIRONMENT` — `development` | `production`, quyết định entitlement `aps-environment` iOS.
 *    Profile EAS quyết định (bản store/TestFlight = `production`).
 */
const GOOGLE_SERVICES_FILE = process.env.GOOGLE_SERVICES_JSON?.trim();
const APS_ENVIRONMENT: 'development' | 'production' =
  process.env.APS_ENVIRONMENT?.trim() === 'production' ? 'production' : 'development';

/**
 * Firebase trên iOS (p0-06: token FCM iOS qua `@react-native-firebase/messaging`) — biến LÚC BUILD tuỳ chọn, đối xứng với
 * `GOOGLE_SERVICES_JSON` của Android:
 *
 *  · `GOOGLE_SERVICES_PLIST` — đường dẫn tới `GoogleService-Info.plist` (EAS: biến môi trường kiểu FILE). Tệp là secret của
 *    dự án — ⛔ không commit (đã `.gitignore`).
 *
 * ⛔ Vì sao plugin `@react-native-firebase/app` chỉ được khai KHI CÓ tệp này (xem `FIREBASE_IOS_PLUGINS` bên dưới): plugin ném lỗi
 * "Path to GoogleService-Info.plist is not defined" ngay lúc `expo prebuild` iOS nếu thiếu tệp — khai vô điều kiện thì mọi máy/CI
 * không có tệp đều không prebuild được. Android KHÔNG cần plugin đó: Expo tự áp `google-services` khi có `android.googleServicesFile`.
 */
const GOOGLE_SERVICES_PLIST = process.env.GOOGLE_SERVICES_PLIST?.trim();

/** Domain công khai cho app links/universal links — quyết định D-14. */
const APP_LINK_DOMAIN = env('APP_LINK_DOMAIN', 'superapp.vcijsc.com');

/**
 * Bật `expo-updates` (OTA JS) — chỉ có ý nghĩa khi CÓ project EAS. Thiếu
 * `EAS_PROJECT_ID` mà vẫn bật thì app khởi động sẽ cố hỏi một server cập nhật
 * không tồn tại; `&& Boolean(EAS_PROJECT_ID)` chặn ca đó ngay tại nguồn.
 */
const UPDATES_ENABLED = process.env.UPDATES_ENABLED === 'true' && Boolean(EAS_PROJECT_ID);

/**
 * Sentry (p0-11 app.md §6) — config plugin `@sentry/react-native/expo` (upload source map/debug symbols lúc build) CHỈ được bật khi có `SENTRY_ORG`
 * (profile EAS `preview`/`production` đặt; máy dev để trống). Lý do: plugin sửa native project (build phase iOS, Gradle Android) nên bật vô điều kiện thì mọi lần
 * build local đều đổi dấu vân tay native và có thể chết vì thiếu `SENTRY_AUTH_TOKEN`. Gói `@sentry/react-native` vẫn được autolink dù plugin tắt; DSN quyết định
 * việc có gửi lỗi hay không (`EXPO_PUBLIC_SENTRY_DSN`, xem `src/core/monitoring/`). `SENTRY_AUTH_TOKEN` là secret EAS — ⛔ không đặt ở đây.
 */
const SENTRY_ORG = process.env.SENTRY_ORG?.trim();
const SENTRY_PLUGINS: [string, Record<string, string>][] = SENTRY_ORG
  ? [
      [
        '@sentry/react-native/expo',
        { organization: SENTRY_ORG, project: env('SENTRY_PROJECT', 'superapp-app'), url: env('SENTRY_URL', 'https://sentry.io/') },
      ],
    ]
  : [];

/**
 * Firebase iOS (p0-06) — CHỈ khi có `GOOGLE_SERVICES_PLIST` (lý do: chú thích ở hằng đó).
 *
 *  · `@react-native-firebase/app` `ios.disableSPM: true` — RNFB 26 mặc định kéo Firebase iOS SDK bằng Swift Package Manager và
 *    chế độ đó ĐÒI `use_frameworks! :linkage => :dynamic`; ta chọn đường CocoaPods (hỗ trợ cả static) để đi cùng
 *    `useFrameworks: 'static'` bên dưới — cấu hình RNFB+Expo đã được dùng nhiều nhất.
 *  · `expo-build-properties` `ios.useFrameworks: 'static'` — bắt buộc cho pod Swift của Firebase (`GoogleUtilities` không khai module).
 *    ⚠️ Ảnh hưởng MỌI pod iOS (Skia, Mapbox, WebRTC…) — CHƯA build iOS thật (Windows không build được, cần EAS Build + macOS) nên chưa
 *    biết có xung đột hay không; đó là lý do khối này nằm sau công tắc env thay vì bật mặc định.
 *  · Không khai `UIBackgroundModes: remote-notification|voip` ở đây — thuộc p2-02 (cuộc gọi); bật sớm mà chưa dùng là lý do Apple từ chối.
 */
const FIREBASE_IOS_PLUGINS: [string, Record<string, unknown>][] = GOOGLE_SERVICES_PLIST
  ? [
      ['@react-native-firebase/app', { ios: { disableSPM: true } }],
      ['expo-build-properties', { ios: { useFrameworks: 'static' } }],
    ]
  : [];

/**
 * Nền màn hình chờ — lấy từ token `bg-1` của `colors.json`.
 *
 * ⚠️ Phải viết cứng ở đây: file này chạy trong Node LÚC BUILD, còn token màu chỉ
 * thành biến CSS khi Metro đã đóng gói xong. Đổi `bg-1` thì nhớ đổi cả hai chỗ —
 * lệch nhau thì màn chờ nháy một khung hình sai màu trước khi app lên.
 */
const SPLASH_BG_LIGHT = '#FFFFFF';
const SPLASH_BG_DARK = '#1E2826';

/**
 * Chuỗi xin quyền camera (iOS `NSCameraUsageDescription`) — nguồn DUY NHẤT, đưa cho CẢ HAI plugin
 * `expo-image-picker` (chụp ảnh đính kèm) và `expo-camera` (quét QR link mời nhóm).
 *
 * ⛔ Vì sao một hằng chứ không mỗi plugin một câu: cả hai cùng ghi khoá `NSCameraUsageDescription`, và
 * plugin nào chạy SAU thì thắng (`applyPermissions` của `@expo/config-plugins`: chuỗi truyền vào ||
 * chuỗi đã có || chuỗi mặc định tiếng Anh). Mod chạy NGƯỢC thứ tự khai trong `plugins` — plugin khai
 * TRƯỚC chạy CUỐI (đã đo bằng `expo config --type introspect`: `expo-camera` khai trước
 * `expo-image-picker` thì câu của `expo-camera` lên máy, khai sau thì câu của `expo-image-picker`).
 * Hai câu khác nhau ⇒ câu nào lên máy tuỳ thứ tự mảng, dời một dòng là đổi lời xin quyền mà không ai
 * hay. Cùng một hằng thì thứ tự nào cũng ra đúng một câu.
 *
 * ⚠️ Câu này phải NÓI ĐỦ mọi mục đích (chụp ảnh + quét QR + bật video cuộc gọi/họp): bản duyệt App Store đối chiếu lời xin
 * quyền với việc app thật sự làm với camera. Nay còn đưa cho `@config-plugins/react-native-webrtc` (video LiveKit) — plugin đó
 * cũng ghi `NSCameraUsageDescription`, cùng luật thứ tự như trên ⇒ BA plugin, MỘT hằng.
 */
const CAMERA_PERMISSION =
  'Cho phép $(PRODUCT_NAME) dùng máy ảnh để chụp ảnh đính kèm, quét mã QR mời vào nhóm và bật video trong cuộc gọi, cuộc họp.';

/**
 * Chuỗi xin quyền micro (iOS `NSMicrophoneUsageDescription`) — nguồn DUY NHẤT, đưa cho `expo-audio` (tin nhắn thoại) VÀ
 * `expo-image-picker`.
 *
 * ⛔ TUYỆT ĐỐI KHÔNG đặt `microphonePermission: false` cho `expo-image-picker`. Trên Android `false` KHÔNG có nghĩa "đừng thêm":
 * plugin gọi `AndroidConfig.Permissions.withBlockedPermissions(['android.permission.RECORD_AUDIO'])` ("block the permissions to
 * ensure no package can add them") ⇒ manifest cuối có `<uses-permission android:name="android.permission.RECORD_AUDIO"
 * tools:node="remove"/>` và `RECORD_AUDIO` bị GỠ khỏi APK dù `expo-audio`/LiveKit có khai: ứng dụng không thể xin/được cấp
 * quyền micro (ghi tin thoại, cuộc gọi, họp đều hỏng, Cài đặt hệ thống còn không liệt kê "Micrô" cho app). Trên iOS, plugin khai
 * TRƯỚC chạy CUỐI nên `false` của `expo-image-picker` còn XOÁ luôn `NSMicrophoneUsageDescription` mà `expo-audio` vừa ghi.
 * Khai cùng một chuỗi ở cả hai thì `RECORD_AUDIO` chỉ được thêm (không trùng lời xin quyền lúc chạy — hệ điều hành chỉ hỏi khi
 * code gọi `requestRecordingPermissionsAsync`) và thứ tự plugin nào cũng ra đúng một câu.
 *
 * ⚠️ Câu này phải NÓI ĐỦ mọi mục đích dùng micro (tin thoại + cuộc gọi/họp): bản duyệt App Store đối chiếu lời xin quyền với việc
 * app thật sự làm với micro.
 */
const MICROPHONE_PERMISSION =
  'Cho phép $(PRODUCT_NAME) dùng micro để ghi tin nhắn thoại và trò chuyện trong cuộc gọi, cuộc họp.';

/**
 * Chuỗi xin quyền vị trí (iOS `NSLocationWhenInUseUsageDescription`) — p6-05 (bản đồ quán cà phê/thư viện/tiệm in gần bạn). CHỈ khi đang dùng
 * app; ⛔ không xin "luôn luôn" (xem plugin `expo-location` bên dưới). Chuỗi phải nói đúng việc app làm với vị trí (App Store đối chiếu).
 */
const LOCATION_PERMISSION =
  'Cho phép $(PRODUCT_NAME) dùng vị trí của bạn để tìm quán cà phê, thư viện và tiệm in gần bạn.';

/**
 * Chuỗi xin quyền Bluetooth (iOS `NSBluetoothAlwaysUsageDescription`) — WebRTC/LiveKit dò tai nghe Bluetooth để định tuyến âm thanh cuộc gọi
 * (p0-08). Không plugin nào ghi khoá này nên khai thẳng ở `ios.infoPlist`. Thiếu khoá mà binary tham chiếu CoreBluetooth ⇒ App Store từ chối.
 */
const BLUETOOTH_PERMISSION =
  'Cho phép $(PRODUCT_NAME) kết nối tai nghe Bluetooth trong cuộc gọi, cuộc họp.';

/**
 * FCM `default_notification_channel_id` (Android) — sửa lỗi gộp manifest làm chết `:app:processReleaseMainManifest`.
 *
 * `expo-notifications` (`defaultChannel: 'default'`) ghi giá trị `default` vào manifest của app, còn manifest của thư viện
 * `@react-native-firebase/messaging` khai cùng khoá đó với giá trị RỖNG ⇒ "Manifest merger failed: Attribute
 * meta-data#…default_notification_channel_id@value … is also present". Plugin RNFB chỉ thêm `tools:replace` cho
 * `default_notification_color`, không cho khoá này. Thêm `tools:replace="android:value"` để giá trị của app thắng — push FCM
 * không kèm `channelId` vẫn rơi vào kênh `default` do `core/notifications/android-channels.ts` tạo.
 *
 * Bọc quanh cả cấu hình (không nằm trong `plugins`): mod đăng ký trước thì chạy SAU, nên nó thấy meta-data mà
 * `expo-notifications` vừa ghi. Không tìm thấy meta-data ⇒ không làm gì.
 */
const withFcmDefaultChannelOverride: ConfigPlugin = (cfg) =>
  withAndroidManifest(cfg, (mod) => {
    AndroidConfig.Manifest.ensureToolsAvailable(mod.modResults);
    const metaData = AndroidConfig.Manifest.getMainApplication(mod.modResults)?.['meta-data']?.find(
      (item) =>
        item.$['android:name'] === 'com.google.firebase.messaging.default_notification_channel_id',
    );
    if (metaData) Object.assign(metaData.$, { 'tools:replace': 'android:value' });
    return mod;
  });

/**
 * NDK version alignment (fix CXX1101 missing source.properties).
 *
 * Một số thư viện native như `expo-updates` bật CMake/externalNativeBuild nhưng không
 * gán `ndkVersion rootProject.ext.ndkVersion` trong `android {}`. Khi đó AGP (Android Gradle Plugin)
 * sẽ dùng NDK mặc định của AGP (27.0.12077973) thay vì NDK đã cài đặt trong SDK (27.1.12297006)
 * do `expo-root-project` chỉ định, dẫn đến lỗi CXX1101:
 * "NDK at .../ndk/27.0.12077973 did not have a source.properties file".
 *
 * Plugin này ép mọi subproject Android library dùng chung `rootProject.ext.ndkVersion`.
 */
const withSubprojectsNdkVersion: ConfigPlugin = (cfg) =>
  withProjectBuildGradle(cfg, (mod) => {
    if (mod.modResults.language === 'groovy') {
      const contents = mod.modResults.contents;
      const ndkBlock = `
subprojects { subproject ->
  subproject.plugins.withId('com.android.library') {
    subproject.android {
      if (rootProject.hasProperty('ndkVersion')) {
        ndkVersion rootProject.ext.ndkVersion
      }
    }
  }
}
`;
      if (!contents.includes("subproject.plugins.withId('com.android.library')")) {
        mod.modResults.contents = `${contents}\n${ndkBlock}\n`;
      }
    }
    return mod;
  });


const buildConfig = ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_NAME,
  slug: APP_SLUG,
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: APP_SCHEME,

  /**
   * `automatic` = đi theo cài đặt sáng/tối của hệ điều hành.
   *
   * BẮT BUỘC phải là `automatic` (không phải `light`) thì `useColorScheme()` của
   * React Native mới báo đúng theme hệ thống. Để `light` là hệ điều hành luôn
   * trả `'light'`, và lựa chọn "Theo hệ thống" trong màn Cài đặt thành vô nghĩa.
   */
  userInterfaceStyle: 'automatic',

  /**
   * Chính sách cập nhật OTA (`expo-updates`).
   *
   * `policy: 'appVersion'` khoá một bản cập nhật JS vào ĐÚNG bản native đã phát
   * hành nó — đổi native (thêm plugin, đổi phiên bản SDK) bắt buộc build lại,
   * OTA không "leo" qua được ranh giới đó. Thiếu khoá này thì một bản cập nhật
   * JS viết cho SDK mới có thể bị đẩy nhầm xuống máy còn chạy binary SDK cũ.
   */
  runtimeVersion: { policy: 'appVersion' },
  /**
   * `checkAutomatically: 'ON_LOAD'` + `fallbackToCacheTimeout: 0` = kiểm/tải bản OTA MỚI lúc mở app nhưng KHÔNG chờ: app chạy ngay bằng bản đã có, bản mới áp dụng
   * ở LẦN MỞ SAU (p0-11 app.md §4 — không reload giữa phiên; cuộc gọi/họp đang chạy không bị ngắt). Kênh (`channel`) do profile EAS quyết định (`eas.json`).
   * ⚠️ OTA chỉ đổi JS/asset; đổi native (thêm plugin/gói native, nâng SDK) ⇒ tăng `version` + build mới — xem `docs/plans/.../p0-11` và `deploy/runbooks/release-mobile.md`.
   */
  updates: UPDATES_ENABLED
    ? { enabled: true, url: `https://u.expo.dev/${EAS_PROJECT_ID}`, checkAutomatically: 'ON_LOAD', fallbackToCacheTimeout: 0 }
    : { enabled: false },

  ios: {
    bundleIdentifier: IOS_BUNDLE_ID,
    supportsTablet: true,
    /**
     * Universal link `https://${APP_LINK_DOMAIN}/…` mở thẳng vào app thay vì
     * Safari. Cần file `/.well-known/apple-app-site-association` trên chính
     * domain đó (BE phục vụ, xem `config-be.md` §12) — thiếu file này thì khai
     * associatedDomains không có tác dụng gì, iOS âm thầm mở Safari.
     */
    associatedDomains: [`applinks:${APP_LINK_DOMAIN}`],
    // Chỉ khi có `GOOGLE_SERVICES_PLIST` — xem chú thích ở hằng đó (Firebase iOS, p0-06).
    ...(GOOGLE_SERVICES_PLIST ? { googleServicesFile: GOOGLE_SERVICES_PLIST } : {}),
    infoPlist: {
      // Tiếng Việt có dấu trong tên app hiển thị dưới icon.
      CFBundleDisplayName: APP_NAME,
      // p0-08: tai nghe Bluetooth trong cuộc gọi/họp. ⚠️ CHỈ khoá này — `NSCameraUsageDescription`/`NSMicrophoneUsageDescription`
      // do plugin nắm (cùng hằng ở đầu file).
      NSBluetoothAlwaysUsageDescription: BLUETOOTH_PERMISSION,
      /**
       * p2-02 — đổ chuông khi app nền/bị tắt (CallKit qua PushKit) + tiếp tục có tiếng khi ra nền giữa cuộc gọi:
       *  · `voip` — bắt buộc để `PKPushRegistry` đánh thức app khi có VoIP push lúc app bị kill (`@config-plugins/react-native-callkeep`
       *    cũng tự thêm giá trị này nếu thiếu — khai tường minh ở đây để không phụ thuộc hành vi ngầm của plugin đó).
       *  · `audio` — giữ phiên audio LiveKit sống khi cuộc gọi thoại ra nền (màn hình tắt/chuyển app khác).
       *  · `remote-notification` — cho phép xử lý push `content-available: 1` (cancel/answered-elsewhere) khi app ở nền.
       */
      UIBackgroundModes: ['voip', 'audio', 'remote-notification'],
      /**
       * ⛔ KHÔNG khai `NSFaceIDUsageDescription` ở đây, dù đây có vẻ là chỗ
       * "tự nhiên" để khai mọi chuỗi xin quyền iOS khác.
       *
       * Nguồn DUY NHẤT của chuỗi đó là `faceIDPermission` của plugin
       * `expo-local-authentication` bên dưới (`app.md` §6). Khai cả hai chỗ
       * không lỗi ngay lúc build, nhưng plugin CNG (Continuous Native
       * Generation) hợp nhất `infoPlist` với đầu ra của plugin — một bản dựng
       * có thể giữ chuỗi CŨ ở đây trong khi plugin đã đổi câu mới, và không có
       * cảnh báo nào cho biết hai nguồn đang lệch nhau.
       */
    },
  },

  android: {
    package: ANDROID_PACKAGE,
    ...(GOOGLE_SERVICES_FILE ? { googleServicesFile: GOOGLE_SERVICES_FILE } : {}),
    /**
     * Quyền Android KHÔNG do plugin nào khai (mảng này CỘNG THÊM vào quyền plugin/thư viện tự thêm — đã đo bằng `expo config --type
     * introspect` trên bản sao sạch, không thay thế):
     *  · `BLUETOOTH_CONNECT` — Android 12+: dò/định tuyến tai nghe Bluetooth trong cuộc gọi/họp (p0-08; quyền RUNTIME, xin ở
     *    `core/media/permissions`). `@config-plugins/react-native-webrtc` chỉ thêm `BLUETOOTH` cũ (≤ Android 11).
     *  · p2-02 (cuộc gọi native, đổ chuông khi app nền/khoá máy) — `react-native-callkeep` self-managed `ConnectionService`
     *    cần `MANAGE_OWN_CALLS`/`FOREGROUND_SERVICE_PHONE_CALL` để Telecom framework coi app là "ứng dụng gọi điện" thật
     *    (tự lo chuông hệ thống + full-screen, không chỉ gửi thông báo thường); `USE_FULL_SCREEN_INTENT` bật màn hình/hiện
     *    cuộc gọi trên màn khoá (Android 14 còn cần người dùng tự bật trong Cài đặt — README §6, mã CL-23);
     *    `FOREGROUND_SERVICE_MICROPHONE`/`FOREGROUND_SERVICE_CAMERA` giữ mic/camera khi cuộc gọi ra nền; `WAKE_LOCK`
     *    đánh thức máy khi có cuộc gọi tới lúc màn hình tắt.
     */
    permissions: [
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.USE_FULL_SCREEN_INTENT',
      'android.permission.MANAGE_OWN_CALLS',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_PHONE_CALL',
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
      'android.permission.FOREGROUND_SERVICE_CAMERA',
      'android.permission.WAKE_LOCK',
    ],
    adaptiveIcon: {
      backgroundColor: SPLASH_BG_LIGHT,
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    /**
     * Cử chỉ "vuốt lùi có xem trước" của Android 13+.
     *
     * ⛔ Để `false` CÓ CHỦ Ý. Bật lên thì Android tự vẽ hoạt ảnh lùi, nhưng
     * React Navigation vẫn giữ màn hình trong ngăn xếp của nó — hai bên bất
     * đồng bộ và người dùng thấy màn hình nháy về rồi lại hiện ra. Chỉ bật khi
     * đã kiểm tra tay trên máy thật với đúng phiên bản react-native-screens
     * đang dùng.
     */
    predictiveBackGestureEnabled: false,
    /**
     * App link Android: `https://${APP_LINK_DOMAIN}/invite/…` mở thẳng app.
     * `autoVerify: true` bắt Android kiểm `/.well-known/assetlinks.json` trên
     * domain (BE phục vụ) trước khi coi app là chủ sở hữu đường dẫn — thiếu
     * file đó thì Android âm thầm rơi về mở trình duyệt thay vì app.
     *
     * `/m/<id>` (p1-05 app.md §1) — hội thoại, `app/m/[id].tsx` (ngoài nhóm
     * `(app)`) chỉ `<Redirect>` sang `/messages/[conversationId]`; hàng rào
     * đăng nhập của chính `(app)/_layout.tsx` vẫn áp dụng bình thường sau khi
     * chuyển tiếp.
     *
     * `/w/` (p1-01 app.md §6, p1-03 app.md §1) — `/w/{wsId}` mở tổng quan nhóm,
     * `/w/{wsId}/c/{chId}?m=` mở kênh; `app/w/**` cũng chỉ `<Redirect>`.
     * ⚠️ CÓ dấu `/` cuối, KHÁC `/m` ở trên: `pathPrefix` của Android là so khớp
     * CHUỖI, `/w` không dấu sẽ nuốt cả `/workspaces…`, `/whatever` — link nào
     * không phải của app cũng bị bắt vào app rồi rơi vào màn 404. (`/m` giữ
     * nguyên, không đụng: p0-12/p2-04 sẽ giải xung đột mã họp `/m/<code>` sau.)
     * `/s/{setId}` (p4-01, bộ học — `app/s/[setId].tsx`) và `/live/{pin}` (p5-01, vào phiên Live Quiz —
     * `app/live/[pin].tsx`) cũng chỉ `<Redirect>`; cùng luật dấu `/` cuối như `/w/`. ⚠️ iOS: AASA phía BE phải phủ
     * `/s/*` và `/live/*`; scheme `superapp://live/{pin}` chạy ngay không cần AASA.
     * `/invite/e/{token}` (p3-04 app.md §1, lời mời email đích danh) KHÔNG cần dòng
     * riêng: `pathPrefix: '/invite'` ở trên đã khớp nó (so khớp CHUỖI tiền tố), thêm
     * `'/invite/e'` chỉ sinh một `<data>` thừa. iOS: AASA phía BE phải phủ `/invite/*`.
     * `/mentor/{postId}` (p6-03, bài tìm cố vấn) — KHÔNG có `app/mentor/[postId].tsx` chuyển tiếp như `/live/`: route thật
     * `app/(app)/mentor/[postId].tsx` đã có đúng URL đó (nhóm `(app)` không nằm trong đường dẫn), tạo thêm một file cùng URL
     * ngoài nhóm sẽ trùng route. Dấu `/` cuối như `/w/` (không dấu thì nuốt cả `/mentors…`). iOS: AASA phía BE phải phủ `/mentor/*`.
     * Mở link lúc CHƯA đăng nhập thì rơi về đăng nhập (hàng rào của `(app)/_layout.tsx`) và chưa nhớ đích để quay lại sau đăng nhập.
     * Thêm pathPrefix mới (task, portfolio…) theo `config-app.md` §8 khi tới
     * phase đó.
     */
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        category: ['BROWSABLE', 'DEFAULT'],
        data: [
          { scheme: 'https', host: APP_LINK_DOMAIN, pathPrefix: '/invite' },
          { scheme: 'https', host: APP_LINK_DOMAIN, pathPrefix: '/m' },
          { scheme: 'https', host: APP_LINK_DOMAIN, pathPrefix: '/w/' },
          // p0-12: `/c/{conversationId}?m={messageId}` (`app/c/[conversationId].tsx`) — dấu `/` cuối như `/w/`. iOS: AASA phía BE phải phủ `/c/*`.
          { scheme: 'https', host: APP_LINK_DOMAIN, pathPrefix: '/c/' },
          { scheme: 'https', host: APP_LINK_DOMAIN, pathPrefix: '/s/' },
          { scheme: 'https', host: APP_LINK_DOMAIN, pathPrefix: '/live/' },
          { scheme: 'https', host: APP_LINK_DOMAIN, pathPrefix: '/mentor/' },
        ],
      },
    ],
  },

  plugins: [
    'expo-router',
    'expo-image',
    'expo-secure-store',

    // Sentry (p0-11): chỉ khi có `SENTRY_ORG` — xem `SENTRY_PLUGINS` ở đầu file.
    ...SENTRY_PLUGINS,

    /**
     * Đăng nhập sinh trắc học + khoá ứng dụng (p0-13).
     *
     * `faceIDPermission` là nguồn DUY NHẤT của `NSFaceIDUsageDescription` —
     * ⛔ không khai tay trong `ios.infoPlist` (xem chú thích ở đó), ⛔ không
     * khai lần hai ở plugin `expo-secure-store` (plugin đó không có tuỳ chọn
     * này; nhắc lại vì `app.md` §6 đặc biệt cảnh báo bẫy "khai hai lần").
     *
     * Không cần khai quyền Android riêng: plugin tự thêm `USE_BIOMETRIC` vào
     * `AndroidManifest.xml`, và app KHÔNG cần `USE_FINGERPRINT` (quyền cũ, chỉ
     * còn ý nghĩa trên Android < 9).
     */
    [
      'expo-local-authentication',
      {
        faceIDPermission:
          'Cho phép $(PRODUCT_NAME) dùng Face ID để đăng nhập nhanh và mở khoá ứng dụng.',
      },
    ],

    /**
     * Thông báo đẩy (p0-06 `app.md` §6).
     *
     * · `defaultChannel: 'default'` — push FCM KHÔNG kèm `channelId` rơi vào kênh `default` do
     *   `core/notifications/android-channels.ts` tạo, thay vì kênh `fallback` do thư viện tự sinh
     *   (người dùng sẽ thấy hai kênh trùng nghĩa trong Cài đặt hệ thống).
     * · `icon` — biểu tượng nhỏ trên thanh trạng thái. Android chỉ đọc kênh ALPHA của ảnh (nền trong
     *   suốt, nét trắng). ⚠️ TẠM dùng lớp `monochrome` của icon thích ứng vì `app.md` §6 hẹn
     *   `notification-icon.png` (96×96 trắng/trong suốt) mà tài sản đó chưa có; nét chevron nhỏ hơn
     *   khung — thay bằng ảnh chuẩn khi thiết kế bàn giao. CHƯA XÁC MINH hiển thị trên máy thật.
     * · `color` — nền tối `bg-1` (cùng `SPLASH_BG_DARK`; viết cứng vì file này chạy lúc build).
     * · `sounds` — ⛔ CHƯA khai: `mention.wav` của `app.md` §6 chưa có trong `assets/`. Kênh `mentions`
     *   dùng âm mặc định — xem chú thích trong `android-channels.ts` (âm kênh không đổi được sau khi tạo).
     * · Không khai `android.permissions`: `expo-notifications` đã tự thêm `POST_NOTIFICATIONS` vào manifest,
     *   còn khai mảng `permissions` ở đây sẽ GIẢM các quyền mặc định mà những plugin khác đang dựa vào.
     * · Không bật `enableBackgroundRemoteNotifications` / `UIBackgroundModes: voip|audio` — thuộc p2-02
     *   (cuộc gọi); bật sớm mà chưa dùng là lý do Apple từ chối bản duyệt.
     */
    [
      'expo-notifications',
      {
        color: SPLASH_BG_DARK,
        // ⚠️ Phải khớp `ANDROID_CHANNEL_IDS.default` (`core/notifications/android-channels.ts`) và bảng ánh xạ ở
        // BE `firebase-push.sender.ts`. Hậu tố `-v2`: kênh `default` của bản trước bị tạo IM LẶNG và Android KHOÁ
        // cấu hình kênh đã tạo, đổi id là cách duy nhất để sửa.
        defaultChannel: 'default-v2',
        icon: './assets/images/android-icon-monochrome.png',
        mode: APS_ENVIRONMENT,
      },
    ],

    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 160,
        resizeMode: 'contain',
        backgroundColor: SPLASH_BG_LIGHT,
        dark: { backgroundColor: SPLASH_BG_DARK },
      },
    ],

    /**
     * Đính kèm/media (p0-05) — hạ tầng upload dùng chung, CHƯA có màn hình
     * thật nào gọi tới (`core/uploads/`, `shared/ui/attachment/`).
     *
     * ⛔ `microphonePermission` PHẢI là chuỗi (cùng hằng `MICROPHONE_PERMISSION` với `expo-audio`), KHÔNG được là `false`:
     * `false` = CHẶN `RECORD_AUDIO` cho cả ứng dụng (xem chú thích ở hằng đó) — từng làm mic hỏng hoàn toàn trên Android.
     * Khai hai plugin cùng một quyền KHÔNG làm Android xin hai lần: hộp thoại quyền chỉ hiện khi code gọi xin quyền.
     */
    [
      'expo-image-picker',
      {
        photosPermission: 'Cho phép $(PRODUCT_NAME) truy cập thư viện ảnh để đính kèm tệp.',
        // ⛔ Cùng hằng với `expo-camera` bên dưới — xem chú thích ở `CAMERA_PERMISSION`.
        cameraPermission: CAMERA_PERMISSION,
        microphonePermission: MICROPHONE_PERMISSION,
      },
    ],
    'expo-document-picker',

    /**
     * Lưu ảnh/video về máy từ `MediaViewerScreen` (p1-04 app.md §3/§6).
     * `savePhotosPermission` là quyền "CHỈ THÊM" của iOS 14+
     * (`NSPhotoLibraryAddUsageDescription`) — khác `photosPermission` (đọc/chọn
     * ảnh) của `expo-image-picker` ở trên; không khai plugin này thì bản build
     * dùng câu tiếng Anh mặc định của thư viện.
     */
    [
      'expo-media-library',
      {
        photosPermission: 'Cho phép $(PRODUCT_NAME) truy cập thư viện ảnh.',
        savePhotosPermission: 'Cho phép $(PRODUCT_NAME) lưu ảnh/video về máy.',
        isAccessMediaLocationEnabled: false,
      },
    ],

    /**
     * Ghi âm voice note (p0-05 §6) — preset tuỳ chỉnh `.m4a`/AAC/mono/64kbps
     * khai ở `core/media/use-voice-recorder.ts`, KHÔNG khai lại số đo ở đây.
     */
    [
      'expo-audio',
      { microphonePermission: MICROPHONE_PERMISSION },
    ],

    /**
     * Quét mã QR của link mời nhóm (`features/members` — `ScanInviteScreen`).
     *
     * ⚠️ Thêm module NATIVE `ExpoCamera` ⇒ PHẢI build lại dev client (`npm start` có guard
     * tự build khi dấu vân tay native đổi). Bản đã cài từ trước không có `ExpoCamera`: màn quét nạp
     * `expo-camera` động và rơi về "bản cài đặt này chưa hỗ trợ quét mã" thay vì đỏ màn lúc khởi động.
     *
     * · `cameraPermission` — ⛔ CÙNG hằng `CAMERA_PERMISSION` với `expo-image-picker` (chú thích ở hằng đó).
     * · `microphonePermission: false` + `recordAudioAndroid: false` — màn này chỉ ĐỌC MÃ, không quay
     *   video/âm thanh. Micro là việc của `expo-audio` (voice note) ở trên: không để plugin này ghi thêm
     *   chuỗi xin quyền micro mặc định (tiếng Anh) hay `RECORD_AUDIO` lần nữa — cùng bẫy "khai hai lần"
     *   của `expo-image-picker`.
     *   ⚠️ Với iOS, `false` là XOÁ khoá `NSMicrophoneUsageDescription` chứ không phải "bỏ qua"
     *   (`applyPermissions`), và mod chạy NGƯỢC thứ tự khai — nên plugin này đứng SAU `expo-audio` để lượt
     *   xoá của nó chạy TRƯỚC lượt ghi chuỗi của `expo-audio`, không xoá mất chuỗi đó.
     * · `barcodeScannerEnabled: true` (mặc định của plugin, viết ra cho thấy CỐ Ý) — ⛔ đừng tắt để "giảm
     *   dung lượng": tắt là bỏ ML Kit và `onBarcodeScanned` không bao giờ bắn.
     */
    [
      'expo-camera',
      {
        barcodeScannerEnabled: true,
        cameraPermission: CAMERA_PERMISSION,
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],

    /**
     * Nhúng font vào bản native LÚC BUILD, không tải lúc chạy.
     *
     * Vì sao không dùng `useFonts()` ở tầng React: hook đó tải font sau khi app
     * đã lên, nên có một khoảng khung hình đầu chữ hiện bằng font hệ thống rồi
     * mới nhảy sang Plus Jakarta Sans — chớp một cái, thấy rõ trên máy chậm. Nhúng
     * lúc build thì font có sẵn từ khung hình ĐẦU TIÊN.
     *
     * ⚠️ Android khai dạng OBJECT (`fontFamily` + `fontDefinitions`) chứ không
     * phải danh sách đường dẫn. Chỉ dạng object mới sinh ra file XML
     * `font-family` — thứ khiến `font-medium` / `font-bold` chọn ĐÚNG file nét
     * đậm. Khai dạng danh sách thì Android chỉ thấy 4 font rời không liên quan,
     * `fontWeight` bị bỏ qua và mọi thứ ra nét Regular, hoặc tệ hơn là Android
     * tự "bôi đậm" nét Regular (fake bold) trông rất bẩn.
     *
     * iOS thì ngược lại: chỉ cần danh sách đường dẫn, tên họ font lấy từ bảng
     * `name` bên trong file .ttf — cũng đúng bằng chuỗi 'Plus Jakarta Sans' (nameID 16).
     */
    [
      'expo-font',
      {
        android: {
          fonts: [
            {
              fontFamily: 'Plus Jakarta Sans',
              fontDefinitions: [
                { path: './assets/fonts/PlusJakartaSans-Regular.ttf', weight: 400 },
                { path: './assets/fonts/PlusJakartaSans-Medium.ttf', weight: 500 },
                { path: './assets/fonts/PlusJakartaSans-SemiBold.ttf', weight: 600 },
                { path: './assets/fonts/PlusJakartaSans-Bold.ttf', weight: 700 },
              ],
            },
          ],
        },
        ios: {
          fonts: [
            './assets/fonts/PlusJakartaSans-Regular.ttf',
            './assets/fonts/PlusJakartaSans-Medium.ttf',
            './assets/fonts/PlusJakartaSans-SemiBold.ttf',
            './assets/fonts/PlusJakartaSans-Bold.ttf',
          ],
        },
      },
    ],

    // ── Gói native thêm ở đợt "W1-APP-NATIVE-CONFIG" (2026-09-26) — ⚠️ MỌI khối dưới đây đổi dấu vân tay native ⇒ BUILD LẠI dev client
    //    (`npm run start:android` tự làm). Danh sách gói + bước người dùng phải làm: `docs/native-libraries.md`. ────────────────────────

    /**
     * Vị trí (p6-05 — bản đồ địa điểm gần bạn; hook `useUserLocation` xin quyền LÚC BẤM "Gần tôi", không xin lúc mở app).
     *
     * ⛔ Chỉ quyền "khi đang dùng": `locationAlwaysPermission`/`locationAlwaysAndWhenInUsePermission` = `false` XOÁ hẳn khoá tương ứng khỏi
     * Info.plist (mặc định plugin vẫn ghi chuỗi tiếng Anh cho cả hai) — app không định vị nền, khai "luôn luôn" là lý do Apple soi kỹ/từ chối.
     * `motionUsagePermission: false` — cùng lý do (không dùng cảm biến chuyển động). Android: không bật
     * `isAndroidBackgroundLocationEnabled` ⇒ không có `ACCESS_BACKGROUND_LOCATION` / foreground service vị trí.
     */
    [
      'expo-location',
      {
        locationWhenInUsePermission: LOCATION_PERMISSION,
        locationAlwaysPermission: false,
        locationAlwaysAndWhenInUsePermission: false,
        motionUsagePermission: false,
      },
    ],

    /**
     * Khoá xoay màn hình (p5-01 — phiên Live Quiz: điện thoại dọc, tablet được xoay ngang).
     *
     * `orientation: 'portrait'` (đầu file) GIỮ NGUYÊN toàn app: mọi màn khác chỉ thiết kế cho dọc, đổi sang `default` không phải lựa chọn.
     * Plugin này thêm `initialOrientation: 'PORTRAIT_UP'` để iOS iPad cũng khởi động ở dọc — Info.plist `UISupportedInterfaceOrientations~ipad`
     * luôn cho cả 4 hướng nên KHÔNG có nó iPad xoay tự do ở mọi màn. Màn cần ngang (tablet) tự gọi
     * `ScreenOrientation.lockAsync(...)` LÚC CHẠY khi `useBreakpoint() >= tablet` và trả lại `PORTRAIT_UP` khi rời màn (Android: lời gọi runtime
     * ghi đè `screenOrientation` của manifest; iPhone: Info.plist chỉ cho dọc nên không bao giờ ngang được).
     */
    ['expo-screen-orientation', { initialOrientation: 'PORTRAIT_UP' }],

    /**
     * Bản đồ (p6-05) — `@rnmapbox/maps` 10.x, `RNMapboxMapsImpl: 'mapbox'` (Mapbox Maps SDK v11).
     *
     * ⛔ KHÔNG khai `RNMapboxMapsDownloadToken` ở đây: tuỳ chọn đó ghi token THẲNG vào Podfile/`gradle.properties` (thư viện đã đánh dấu
     * deprecated). Token TẢI SDK nay là TUỲ CHỌN (Mapbox bỏ yêu cầu xác thực kho Maven) — nếu cần, đặt biến môi trường LÚC BUILD
     * `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` (secret, EAS env); plugin đọc nó qua `System.getenv` (Android) / hook Podfile (iOS). Token HIỂN THỊ bản đồ
     * (`pk.…`, công khai) là `EXPO_PUBLIC_MAPBOX_TOKEN` — thêm vào `env.config.ts`/`types/env.d.ts` khi làm p6-05. Xem `docs/native-libraries.md`.
     */
    ['@rnmapbox/maps', { RNMapboxMapsImpl: 'mapbox' }],

    /**
     * Cuộc gọi/họp WebRTC (p0-08) — HAI plugin đi cùng nhau (hướng dẫn của LiveKit cho Expo):
     *
     *  · `@livekit/react-native-expo-plugin` — KHÔNG chỉ là config plugin: nó còn là module native (Android
     *    `ApplicationLifecycleListener` gọi `LiveKitReactNative.setup(application, audioType)`, iOS `AppDelegate` subscriber). Thiếu nó thì
     *    thư viện âm thanh của LiveKit chưa được khởi tạo trong `Application.onCreate` ⇒ tiếng cuộc gọi sai luồng/không có. `audioType:
     *    'communication'` = luồng thoại (AEC, định tuyến tai nghe) — ĐÚNG cho gọi/họp; `media` chỉ hợp nghe nhạc.
     *  · `@config-plugins/react-native-webrtc` — quyền Android (CAMERA, RECORD_AUDIO, MODIFY_AUDIO_SETTINGS, WAKE_LOCK, ACCESS_NETWORK_STATE,
     *    BLUETOOTH…), tắt bitcode iOS và ghi chuỗi camera/micro. ⛔ Truyền ĐÚNG hai hằng `CAMERA_PERMISSION`/`MICROPHONE_PERMISSION` như các
     *    plugin khác (luật thứ tự mod ở chú thích hằng đó) — không tự viết câu riêng.
     *
     * ⛔ Chưa bật `enableScreenShareService` (chia sẻ màn hình Android cần foreground service kiểu `mediaProjection`) và
     * `enableMultitaskingCameraAccess` (iOS 18+, đòi `voip` background mode) — thuộc p2-02/p2-04.
     */
    ['@livekit/react-native-expo-plugin', { android: { audioType: 'communication' } }],
    [
      '@config-plugins/react-native-webrtc',
      { cameraPermission: CAMERA_PERMISSION, microphonePermission: MICROPHONE_PERMISSION },
    ],

    /**
     * FCM trên Android/iOS qua `@react-native-firebase/messaging` (p0-06). Plugin này chỉ ghi meta-data `default_notification_icon/color`
     * của Android (tự lấy icon/màu từ plugin `expo-notifications` ở trên). Phần iOS (AppDelegate, `GoogleService-Info.plist`,
     * `useFrameworks`) nằm ở `FIREBASE_IOS_PLUGINS` — chỉ khi có `GOOGLE_SERVICES_PLIST`.
     */
    '@react-native-firebase/messaging',
    ...FIREBASE_IOS_PLUGINS,

    /**
     * ⭐ ĐƯỜNG CHÍNH của chuông cuộc gọi ANDROID (p2-02) — thay cho `react-native-callkeep` đã chết trên RN 0.86
     * (xem khối bị comment ngay dưới). Plugin thêm:
     *  · `CallPushReceiver` — BroadcastReceiver đọc thẳng FCM data-only và dựng notification kênh
     *    `superapp-call-ring-v1` (NHẠC CHUÔNG hệ thống, không phải tiếng "ting") NGAY trong `onReceive`,
     *    chạy cả khi app bị vuốt tắt và KHÔNG cần boot runtime JS;
     *  · `IncomingCallActivity` — `ReactActivity` khai `showWhenLocked`/`turnScreenOn`, đích của full-screen
     *    intent ⇒ màn gọi TỰ BUNG trên màn khoá, Nghe/Từ chối không phải mở khoá;
     *  · `LockScreenCallModule` — cầu JS ↔ native (hạ chuông, cờ `holdActive`, dò quyền toàn màn hình, chuông
     *    trong app khi đang mở máy).
     *
     * ⛔ Mọi thứ đi qua `plugins/call-notification/*.kt` — `android/` là CNG, sửa tay sẽ bay sau `expo prebuild`.
     * ⚠️ Android 14+: `USE_FULL_SCREEN_INTENT` (khai ở `android.permissions`) mặc định BỊ TỪ CHỐI, người dùng phải
     * tự bật trong Cài đặt — app dò bằng `LockScreenCall.canUseFullScreenIntent()` và mời (`full-screen-intent.ts`).
     * Chưa bật thì chuông vẫn kêu, chỉ là hiện heads-up thay vì bung toàn màn hình.
     */
    './plugins/with-android-call-notification',

    /**
     * Cuộc gọi native (p2-02 — đổ chuông như cuộc gọi hệ thống kể cả khi app bị tắt/nền, trả lời từ màn khoá):
     *  · `@config-plugins/react-native-callkeep` — CallKit (iOS) / self-managed `ConnectionService` (Android); tự thêm
     *    `UIBackgroundModes: voip`, quyền `BIND_TELECOM_CONNECTION_SERVICE`/`READ_PHONE_STATE`/`CALL_PHONE`/…, và đăng ký
     *    `VoiceConnectionService` trong manifest. ⚠️ README của gói này (bản đã cài, 14.0.2) mới xác nhận tới Expo SDK 56 —
     *    dự án đang ở SDK 57 (CHƯA có bản ghi tương thích chính thức, xem "Spike S-CK" ở
     *    `docs/plans/phase-2-calls-meetings/p2-02-call-native-app/README.md` §6.2/§10): việc ĐẦU TIÊN khi build thử là xác
     *    nhận `expo prebuild` không lỗi và app vẫn mở được trên cả hai nền tảng.
     *  · `./plugins/with-voip-push` — nối PushKit (`react-native-voip-push-notification`) với CallKit ở AppDelegate; gói
     *    kia không có config plugin riêng (thư viện chỉ hướng dẫn sửa tay AppDelegate.m) — xem chú thích đầu file plugin.
     *    CHƯA build/chạy thật được (Windows không `prebuild --platform ios`) — xem chú thích trong chính file plugin.
     *
     * ⛔ TẮT 2026-09-29 — "Spike S-CK" ĐÃ CÓ KẾT QUẢ, và là kết quả ÂM: `react-native-callkeep@4.3.16` KHÔNG chạy được
     * trên RN 0.86. `RNCallKeepModule.java` khai HAI `@ReactMethod` TRÙNG TÊN `displayIncomingCall` (dòng 438 và 443 —
     * nạp chồng 3 và 4 tham số); bridge cũ chấp nhận, lớp TurboModule interop của kiến trúc mới thì từ chối:
     * `TurboModuleInteropUtils$ParsingException: Module exports two methods to JavaScript with the same name`.
     * `index.js` của gói đọc `NativeModules.RNCallKeep` ở TẦM MODULE nên CHỈ CẦN import là ném → `AppRegistry
     * .registerComponent` không chạy → `"main" has not been registered` → app kẹt VĨNH VIỄN ở màn hình chờ native.
     * Bắt tận tay bằng logcat trên máy ảo 29/09 (prebuild + `assembleRelease` đều THÀNH CÔNG — lỗi chỉ lộ lúc chạy).
     *
     * Hai plugin này chỉ thêm manifest/quyền; thứ làm app chết là NATIVE MODULE, nên còn phải loại khỏi autolinking
     * (`package.json` → `expo.autolinking.exclude`). Tắt cả hai chỗ mới đủ.
     *
     * Mở lại khi lane p2-02 làm được MỘT trong hai: vá thư viện (dự án CHƯA có `patch-package` — bỏ `@ReactMethod` ở
     * 2 overload thừa, giữ bản 5 tham số), hoặc đổi sang thư viện có hỗ trợ kiến trúc mới.
     *
     * ⚠️ CẬP NHẬT (2026-10-01): ANDROID KHÔNG CÒN CẦN hai plugin này — `./plugins/with-android-call-notification`
     * ở trên đã lo chuông + màn khoá bằng native, đúng kiến trúc đang chạy ổn ở `vci-sun-mobile`. Giữ khối này
     * cho iOS: CallKit + PushKit vẫn phải đi qua `react-native-callkeep`, và chừng nào chưa xác minh được patch
     * `patches/react-native-callkeep+4.3.16.patch` trên máy thật thì vẫn TẮT (bật lên là app kẹt màn chờ trên CẢ
     * hai nền tảng, vì native module hỏng ở tầng JS lúc import). Người dùng chốt: Android trước, iOS sau.
     */
    // '@config-plugins/react-native-callkeep',
    // './plugins/with-voip-push',
  ],

  experiments: {
    /**
     * Sinh kiểu cho mọi đường dẫn trong `app/`. Nhờ nó `router.push('/setting')`
     * (thiếu chữ `s`) là lỗi TypeScript chứ không phải màn hình trắng lúc chạy.
     * Kiểu nằm ở `.expo/types` — chạy `npx expo start` một lần để sinh.
     */
    typedRoutes: true,
    /** React Compiler — tự memo hoá, bớt phải rải `useMemo`/`useCallback`. */
    reactCompiler: true,
  },

  extra: {
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },
});

export default (context: ConfigContext): ExpoConfig =>
  withSubprojectsNdkVersion(withFcmDefaultChannelOverride(buildConfig(context)));
