/**
 * Metro bundler — cấu hình mặc định của Expo, bọc thêm NativeWind.
 *
 * `inlineRem: 16` cho Metro biết `1rem = 16px`, vì React Native không có khái
 * niệm rem. Thiếu nó thì mọi giá trị theo rem của Tailwind (spacing, bo góc,
 * cỡ chữ) ra 0 và bố cục sập thành một cột dính nhau.
 */
const path = require('path');

const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withNativeWind } = require('nativewind/metro');

/**
 * `getSentryExpoConfig` (p0-11) = `getDefaultConfig` của Expo + bộ tuần tự hoá Metro gắn Debug ID vào bundle/source map, để Sentry khớp stack với source map
 * mà KHÔNG phụ thuộc release/dist (kể cả bản OTA). Không đổi gì khác trong hành vi Metro; không cần DSN/token để chạy.
 */
const config = getSentryExpoConfig(__dirname);

/**
 * ⛔ Loại KẾT QUẢ BUILD GRADLE (`node_modules/<gói>/android/build/`) khỏi tầm Metro.
 *
 * ⚠️ Không phải để chạy nhanh hơn — để Metro KHỎI CHẾT trên Windows.
 *
 * Windows không có `watchman`, nên `metro-file-map` rơi về `FallbackWatcher`;
 * nó gọi `lstat` lên mọi đường dẫn có biến động. Gradle sinh trong thư mục đó
 * những tên mà Windows không `lstat` nổi (có cả ký tự `?` giữa đường dẫn). Chạm
 * phải là watcher bắn `error` và tiến trình Metro thoát với mã 7:
 *
 *   Error: UNKNOWN: unknown error, lstat
 *   '…/expo-constants/android/build/generated/assets/expo-constants/?/D:/…'
 *       at FallbackWatcher._processChange (metro-file-map/…/FallbackWatcher.js:205)
 *
 * Kiểu hỏng khó lần nhất: TRƯỚC khi chết hẳn thì watcher đã hỏng, nên sửa file
 * không còn ăn — máy ảo cứ hiện bản cũ mà không báo gì. Triệu chứng giống hệt
 * "quên reload", nên rất dễ đi tìm bug nhầm chỗ.
 *
 * Metro KHÔNG cần đọc một byte nào trong đó (toàn .jar/.class/asset của bản
 * native, không phải nguồn JS).
 *
 * ⛔ Đừng "dọn" bằng cách xoá tay các thư mục đó: Gradle sinh lại ở mỗi lần build
 * native nên hôm sau lỗi quay lại y nguyên. Chặn ở đây mới là chặn một lần.
 */
const GRADLE_BUILD_OUTPUT = /[\\/]node_modules[\\/][^\\/]+[\\/]android[\\/]build[\\/].*/;

config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : [config.resolver.blockList].filter(Boolean)),
  GRADLE_BUILD_OUTPUT,
];

/**
 * ⛔ `yjs` (Whiteboard p6-02, `@hocuspocus/provider`) KHÔNG bundle được trên React Native nếu thiếu chỗ này.
 *
 * `yjs` → `lib0/random` → `lib0/webcrypto`, mà điều kiện export `"react-native"` của `lib0/webcrypto` trỏ tới file
 * `require('isomorphic-webcrypto/src/react-native')` — gói không được cài kèm ⇒ Metro báo
 * `Unable to resolve module isomorphic-webcrypto/src/react-native` và CẢ BUNDLE hỏng (kể cả màn không dính tới Yjs, vì Metro giải mọi
 * import tĩnh). Ta chuyển hướng đúng specifier đó sang `shims/isomorphic-webcrypto.js` (dựa trên `expo-crypto`); chi tiết: chú thích đầu tệp đó.
 * Jest có cùng điều kiện `react-native` nên `jest.config.js` có `moduleNameMapper` tương ứng.
 *
 * Chỉ chuyển hướng ĐÚNG specifier này — mọi import khác đi tiếp bộ phân giải sẵn có (kể cả bộ NativeWind bọc bên dưới).
 */
const WEBCRYPTO_SPECIFIER = 'isomorphic-webcrypto/src/react-native';
const WEBCRYPTO_SHIM = path.resolve(__dirname, 'shims/isomorphic-webcrypto.js');
const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === WEBCRYPTO_SPECIFIER) {
    return { type: 'sourceFile', filePath: WEBCRYPTO_SHIM };
  }
  return (upstreamResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = withNativeWind(config, {
  input: './src/styles/global.css',
  inlineRem: 16,
});
