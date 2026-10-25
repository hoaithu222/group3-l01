/**
 * Chạy SAU khi môi trường test đã dựng xong (`setupFilesAfterEnv`).
 *
 * `@testing-library/react-native` từ bản 12.4 đã tự đăng ký matcher
 * (`toBeOnTheScreen`, `toHaveTextContent`…) khi được import, nên chỉ cần một
 * dòng import — KHÔNG cần `@testing-library/jest-native` nữa (gói đó đã ngừng
 * phát triển và xung đột matcher nếu cài kèm).
 */
require('@testing-library/react-native');

/**
 * `react-native-gesture-handler` gọi `RNGestureHandlerModule.install()` ngay lúc
 * nạp module. Trong Node không có module native đó, nên suite chết ở dòng
 * `import` với `_RNGestureHandlerModule.default.install is not a function` —
 * lỗi chỉ vào gói, không chỉ vào component đang test.
 *
 * ⚠️ Cần từ khi `BottomSheet` bọc `GestureHandlerRootView` BÊN TRONG `<Modal>`:
 * `<Modal>` là cửa sổ native riêng nên `GestureHandlerRootView` ở gốc app không
 * với tới, cử chỉ vuốt-để-đóng chết trên Android. Hệ quả phụ là mọi test đi qua
 * `BottomSheet` (kể cả `DatePicker`, `BottomNav`) nay đều nạp gói này.
 *
 * Dùng bản mock CHÍNH THỨC của thư viện thay vì tự viết, và đặt ở đây thay vì
 * rải `jest.mock(...)` trong từng file test.
 *
 * ⚠️ Lý do rất cụ thể: mock tay phải trỏ vào `lib/commonjs/`, KHÔNG phải `src/`.
 * `jest.config.js` thay resolver mặc định bằng resolver của
 * `react-native-worklets`, nên gói được phân giải theo trường `main` (bản đã
 * biên dịch) chứ không theo trường `react-native` (`src/index.ts`). Mock nhầm
 * `src/` thì KHÔNG có tác dụng gì mà cũng KHÔNG báo lỗi — stack trace vẫn hiện
 * tên file `src/*.ts` vì có source map, nên rất dễ tưởng là đã mock đúng.
 * `jestSetup.js` của gói phủ cả ba cây (`src`, `lib/commonjs`, `lib/module`)
 * nên không dính bẫy đó.
 */
require('react-native-gesture-handler/jestSetup');

/**
 * `expo-secure-store` gọi thẳng xuống Keychain/Keystore — không có bản chạy
 * được trong Node. Mock bằng một Map trong bộ nhớ để test luồng phiên đăng nhập
 * chạy thật chứ không phải bỏ qua.
 */
jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    getItemAsync: jest.fn(async (key) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key, value) => void store.set(key, value)),
    deleteItemAsync: jest.fn(async (key) => void store.delete(key)),
    isAvailableAsync: jest.fn(async () => true),
    /**
     * p0-13: `biometric-capability.ts` đọc hàm ĐỒNG BỘ này để quyết định
     * `isUsable`. Mặc định `true` — test nào cần máy "không dùng được sinh
     * trắc học" tự `mockReturnValueOnce(false)`.
     */
    canUseBiometricAuthentication: jest.fn(() => true),
    // Hằng số `keychainAccessible` — giá trị số không quan trọng trong test
    // (không có Keychain thật để so), chỉ cần TỒN TẠI để không `undefined`
    // lọt vào object options một cách khó hiểu khi debug.
    WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 'WHEN_PASSCODE_SET_THIS_DEVICE_ONLY',
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY',
  };
});

/**
 * `expo-local-authentication` — module native (Face ID/vân tay/mã máy),
 * không chạy được trong Node. Bản mock: `__mocks__/expo-local-authentication.ts`.
 */
jest.mock('expo-local-authentication');

/**
 * `expo-notifications` (p0-06) — module native (kênh, quyền, token FCM), không chạy được trong Node.
 * Bản mock: `__mocks__/expo-notifications.ts`. Toàn cục vì `AppProviders` (nên MỌI test dựng nó) gọi
 * `initNotifications()` ngay lúc nạp module và `useNotificationsBootstrap()` khi render.
 */
jest.mock('expo-notifications');

/**
 * `expo-device` chỉ đọc thông tin máy (tên model…) — không có ý nghĩa gì
 * trong Node, và không cần hành vi tinh vi nào để test được các luồng dùng nó
 * (`useBiometricEnrollment`).
 */
jest.mock('expo-device', () => ({
  modelName: 'Test Device',
}));

/** Cùng lý do — AsyncStorage cũng là module native. */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

/**
 * `react-native-keyboard-controller` đo bàn phím ở tầng NATIVE — nạp nó trong
 * Node là ném ngay `The package doesn't seem to be linked`, và suite chết ở
 * dòng `import` chứ không phải ở chỗ dùng. Mọi màn hình có ô nhập đều đi qua
 * `KeyboardAwareScrollView` (xem `docs/rules/mobile-ux.md`), nên thiếu mock này
 * thì gần như không màn hình nào test được.
 *
 * Bản mock CHÍNH THỨC của thư viện: `KeyboardAwareScrollView` rơi về
 * `ScrollView` thường, các giá trị hoạt ảnh về 0.
 */
jest.mock('react-native-keyboard-controller', () =>
  require('react-native-keyboard-controller/jest'),
);

/**
 * `socket.client.ts` mở kết nối THẬT ngay lúc nạp module (thực thể dùng
 * chung) — không mock thì mọi test đụng tới nó (trực tiếp hoặc qua
 * `AppProviders`) sẽ cố mở WebSocket thật trong Node. Bản mock ở
 * `__mocks__/socket.io-client.ts` (gốc dự án, ngang hàng `node_modules`).
 */
jest.mock('socket.io-client');

/**
 * `@react-native-community/netinfo` gọi xuống module native để hỏi trạng thái
 * mạng — không có bản chạy được trong Node. Dùng mock CHÍNH THỨC của thư viện
 * (báo "đang online" mặc định) thay vì tự viết.
 */
jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock.js'),
);

/**
 * `expo-application` đọc thông tin build (phiên bản cài đặt…) ở tầng native —
 * không có bản chạy được trong Node. `socket.client.ts` (p0-03) đọc
 * `nativeApplicationVersion` cho `appVersion` trong handshake Socket.IO.
 */
jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.0.0-test',
  nativeBuildVersion: '1',
}));

/**
 * `expo-audio` (p0-05, `use-voice-recorder.ts`) — `AudioRecorder` là một
 * `SharedObject` native, không chạy được trong Node. Bản mock:
 * `__mocks__/expo-audio.ts` (tự poll `getStatus()` bằng `setInterval` giống
 * bản thật, để test dùng fake timer mô phỏng thời gian ghi âm trôi qua).
 *
 * ⚠️ BẮT BUỘC toàn cục (không chỉ ở test của `use-voice-recorder`):
 * `VoiceRecorderButton` được nối vào `src/shared/ui/index.ts` theo đúng luật
 * "component mới PHẢI vào barrel tổng" (`shared/ui/AGENTS.md`), nên BẤT KỲ
 * test nào `import { ... } from '@/shared/ui'` — kể cả để lấy `Button` — đều
 * nạp theo `expo-audio` qua dây chuyền import của barrel.
 */
jest.mock('expo-audio');

/**
 * `expo-haptics` — rung phản hồi lúc bắt đầu/huỷ ghi âm (`use-voice-recorder.ts`).
 * Không có bản chạy được trong Node; hành vi rung không ảnh hưởng gì tới điều
 * kiện của test nên mock rỗng là đủ. Cùng lý do toàn cục như `expo-audio` ở trên.
 */
jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  // `@/shared/utils/haptics` (`hapticSuccess`/`hapticWarning`) đọc hằng này — thiếu thì `undefined.Success` ném lỗi ĐỒNG BỘ
  // ngay trong handler của nút, và test của mọi màn gọi tới nó đỏ vì một cú rung.
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
}));

/**
 * ── Gói native/JS thêm ở đợt "W1-APP-NATIVE-CONFIG" (2026-09-26) ─────────────────────────────────────────────────────────────────────────────
 * Mỗi gói dưới đây gọi xuống module native (hoặc phát hành ES module chưa biên dịch) nên KHÔNG nạp được trong Node — suite chết ở dòng `import`,
 * không phải ở chỗ dùng. Bản mock nằm ở `__mocks__/` (gốc dự án); mô tả cách test dùng nằm ở đầu từng file. Đăng ký TOÀN CỤC ở đây vì các
 * gói này sẽ nằm sau barrel/màn hình mà nhiều test đi qua (giống `expo-audio` ở trên). Test cần hành vi khác tự `jest.mock('<gói>', factory)` —
 * factory của test thắng bản này.
 *
 * ⚠️ `yjs`/`y-protocols`/`@hocuspocus/provider` là JS thuần, KHÔNG mock — chạy thật trong Jest nhờ `moduleNameMapper` của `jest.config.js`
 * (`isomorphic-webcrypto/src/react-native` → `shims/isomorphic-webcrypto.js`). Tạo `HocuspocusProvider` thật thì test PHẢI truyền
 * `WebSocketPolyfill` giả hoặc `connect: false`, kẻo nó mở WebSocket thật.
 */
jest.mock('react-native-webview');
jest.mock('@shopify/react-native-skia');
jest.mock('@rnmapbox/maps');
jest.mock('expo-location');
jest.mock('expo-screen-orientation');
jest.mock('@react-native-firebase/messaging');
