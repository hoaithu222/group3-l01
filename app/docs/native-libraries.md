# Thư viện native thêm ở đợt "W1-APP-NATIVE-CONFIG" (2026-09-26)

Cài bằng `npx expo install` (bảng phiên bản SDK 57 / RN 0.86 / New Architecture). Chưa có màn hình nào dùng — các lane sau (docs, whiteboard, o2o,
portfolio, live quiz, push iOS, gọi/họp) dựa vào cấu hình này. **Bản dev client đã cài trước ngày này KHÔNG có các module native dưới đây ⇒ phải build lại.**

| Gói (phiên bản)                                          | Dùng cho                                | `app.config.ts`                                                                          | Mock Jest (`__mocks__/`)              |
| -------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------- |
| `react-native-webview` 13.16.1                           | p6-01 editor docs, p6-07 xem trước      | không cần plugin (autolink)                                                              | `react-native-webview.tsx`            |
| `@shopify/react-native-skia` 2.6.2                       | p6-02 bảng trắng (canvas)               | không cần plugin                                                                         | `@shopify/react-native-skia.tsx`      |
| `@rnmapbox/maps` ^10.3.5                                 | p6-05 bản đồ địa điểm                   | `['@rnmapbox/maps', { RNMapboxMapsImpl: 'mapbox' }]`                                     | `@rnmapbox/maps.tsx`                  |
| `expo-location` ~57.0.20                                 | p6-05 "Gần tôi"                         | chuỗi tiếng Việt, CHỈ khi đang dùng                                                      | `expo-location.ts`                    |
| `expo-screen-orientation` ~57.0.2                        | p5-01 Live Quiz (tablet xoay ngang)     | `initialOrientation: 'PORTRAIT_UP'`                                                      | `expo-screen-orientation.ts`          |
| `yjs` ^13.6.33 · `y-protocols` ^1.0.7                    | p6-02 (app tự nói chuyện Yjs)           | —                                                                                        | không mock (chạy thật)                |
| `@hocuspocus/provider` **3.4.4** (đúng, khớp `collab/`)  | p6-02 provider WebSocket                | —                                                                                        | không mock (chạy thật)                |
| `@react-native-firebase/messaging` 26.4.0                | p0-06 token FCM iOS/Android             | plugin messaging; iOS Firebase chỉ khi có `GOOGLE_SERVICES_PLIST` (xem dưới)            | `@react-native-firebase/messaging.ts` |
| `@livekit/react-native-expo-plugin` ^1.0.3               | p0-08 gọi/họp (khởi tạo âm thanh)       | `audioType: 'communication'`                                                             | —                                     |
| `@config-plugins/react-native-webrtc` ^15.0.2            | p0-08 quyền camera/mic/WebRTC           | dùng chung hằng `CAMERA_PERMISSION`/`MICROPHONE_PERMISSION`                              | —                                     |
| `expo-asset` · `expo-build-properties`                   | nạp HTML editor · `useFrameworks` iOS   | `expo-build-properties` chỉ khi có `GOOGLE_SERVICES_PLIST`                               | —                                     |

## Việc người dùng PHẢI làm

1. **Build lại dev client Android.** `npm run start:android` tự làm (dấu vân tay native đổi ⇒ `expo prebuild --clean` + Gradle, vài phút). Chưa ai build thử sau đợt này:
   nếu Gradle lỗi (Mapbox/Skia/Firebase), gửi log — đừng gỡ plugin để "cho xanh".
2. **Mapbox** (p6-05):
   - `EXPO_PUBLIC_MAPBOX_TOKEN` = token công khai `pk.…` (account.mapbox.com → Tokens). CHƯA có trong `env.config.ts`/`types/env.d.ts`/`.env.example` (vùng của phiên đăng nhập Google) —
     lane p6-05 thêm sau khi vùng đó được nhả. Không có token thì bản đồ trắng.
   - `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` = token bí mật `sk.…` (scope `DOWNLOADS:READ`) — **TUỲ CHỌN**: Mapbox đã bỏ yêu cầu xác thực kho Maven, plugin chỉ dùng nếu có. Đặt bằng biến môi trường
     LÚC BUILD (EAS: `eas env:create`, kiểu secret). ⛔ Không ghi vào `app.config.ts`/Podfile/`gradle.properties`, không commit.
3. **Firebase iOS** (p0-06): tải `GoogleService-Info.plist` (Firebase console → app iOS `com.mancode.vungnui`), đặt biến build `GOOGLE_SERVICES_PLIST=./GoogleService-Info.plist` (EAS: env kiểu FILE, cạnh
   `GOOGLE_SERVICES_JSON`). Thiếu biến này thì plugin `@react-native-firebase/app` + `useFrameworks: 'static'` KHÔNG được bật và iOS chưa có token FCM (đúng hiện trạng: iOS bỏ qua đăng ký push).
4. **Apple Developer** (p0-06/p2-02): App ID bật *Push Notifications*; tạo khoá APNs `.p8` → tải lên Firebase (Cloud Messaging → APNs) và điền BE `APNS_KEY_ID`/`APNS_TEAM_ID`/`APNS_KEY_P8`. iOS chỉ build được
   bằng EAS Build (Windows không build iOS) — mọi cấu hình iOS ở đây mới được kiểm ở mức đánh giá cấu hình (`expo config --type introspect`) và bundle JS, **chưa build thật**.
5. **Google Play**: Data safety khai "vị trí gần đúng/chính xác — chỉ khi đang dùng". ⚠️ Từ p2-02 `app.config.ts` ĐÃ khai `FOREGROUND_SERVICE_*`
   (`PHONE_CALL`/`MICROPHONE`/`CAMERA`), `USE_FULL_SCREEN_INTENT`, `MANAGE_OWN_CALLS` ⇒ Play Console đòi biểu mẫu khai báo foreground service +
   full-screen intent trước khi phát hành.

## Biến môi trường

| Biến                             | Loại                   | Ghi chú                                                                              |
| -------------------------------- | ---------------------- | ------------------------------------------------------------------------------------ |
| `RNMAPBOX_MAPS_DOWNLOAD_TOKEN`   | build, secret, tuỳ chọn | Xem trên. Plugin Mapbox đọc qua `System.getenv` / hook Podfile.                      |
| `GOOGLE_SERVICES_PLIST`          | build, file secret     | Đối xứng `GOOGLE_SERVICES_JSON`. Bật khối Firebase iOS trong `app.config.ts`.        |
| `EXPO_PUBLIC_MAPBOX_TOKEN`       | runtime, công khai     | `pk.…`. Lane p6-05 thêm vào `RAW` (`env.config.ts`) + `types/env.d.ts`.               |

## Điều lane dùng gói cần biết

- **Nạp lười module native** (mẫu `tests/expo-camera-lazy.test.ts`): Expo Router nạp mọi file route lúc khởi động; module native mà bản dev client chưa có sẽ NÉM LỖI ngay lúc `import` tĩnh ⇒ app đỏ màn khi mở,
  kể cả người không vào màn đó. Nên `import()` động ở chỗ dùng, bắt lỗi, rơi về "bản cài đặt này chưa hỗ trợ". Đặc biệt `react-native-webview`, `@rnmapbox/maps`, `@shopify/react-native-skia`.
- **`yjs` cần shim** — `lib0/webcrypto` (điều kiện export `react-native`) đòi `isomorphic-webcrypto/src/react-native`, gói không cài kèm ⇒ Metro/Jest hỏng cả bundle. Đã xử lý: `shims/isomorphic-webcrypto.js` +
  `metro.config.js` (`resolver.resolveRequest`) + `jest.config.js` (`moduleNameMapper`). Đã kiểm `expo export` Android + iOS: một bản `yjs` duy nhất trong bundle. ⛔ Đừng thêm `isomorphic-webcrypto` thật.
- **Tạo `HocuspocusProvider` trong test** phải truyền `WebSocketPolyfill` giả hoặc `connect: false` (không, nó mở WebSocket thật). Trên máy provider dùng `WebSocket` toàn cục của RN — không cần `ws`.
- **RNFB 26 chỉ có API modular**: `getMessaging()`, `getToken(m)`, `onTokenRefresh(m, cb)`, `deleteToken(m)`… — `messaging().getToken()` (viết trong `p0-06/app.md`) không còn, `tsc` báo TS1192.
- **Xoay màn hình** (p5-01): `orientation: 'portrait'` toàn app giữ nguyên. Màn cần ngang trên tablet: `ScreenOrientation.lockAsync(OrientationLock.DEFAULT)` khi `useBreakpoint() >= tablet`, và
  `lockAsync(OrientationLock.PORTRAIT_UP)` khi rời màn. Điện thoại không bao giờ ngang được (Info.plist iPhone chỉ dọc).
- **HTML editor trong WebView** (p6-01, đã chốt 2026-09-27): `html` ĐÃ có sẵn trong `assetExts` mặc định của Metro (`metro-config/defaults`) nên `metro.config.js` KHÔNG đổi. Bản dựng `collab/editor-web/dist/editor.html` được chép vào `app/assets/collab/editor.html` bằng `cd collab/editor-web && npm run copy:app` (đổi bundle/CSP/schema thì build lại rồi chép lại). File này PHẢI được commit cùng mã — thiếu nó là Metro đỏ cả bundle. Nạp qua `expo-asset` → đọc thành chuỗi → `source={{ html }}` (không dùng `file://`). Chưa kiểm trên dev client/bản release Android thật.
- **Skia có `postinstall`** (`scripts/install-libs.js` chép nhị phân dựng sẵn vào `node_modules/@shopify/react-native-skia/libs`). npm 11 in cảnh báo `allow-scripts` cho script này (cùng đợt với `@sentry/cli`,
  `protobufjs`…) nhưng vẫn chạy — `libs/{android,ios,…}` đã có. Nếu sau này npm chặn script mặc định thì `libs/` rỗng và Gradle/Pod lỗi: khi đó `npm approve-scripts @shopify/react-native-skia`.
- **Test**: cách dùng từng mock ghi ở đầu file mock; `tests/native-libs-mocks.test.tsx` là ví dụ chạy được. Mock `react-native-webview`/`@rnmapbox/maps` giữ nguyên prop trên `View` (`fireEvent(…, 'message', …)` chạy).

## Cố ý CHƯA làm

- ~~Không cài CallKeep…~~ — ĐÃ ĐỔI ở p2-02 (đối chiếu `package.json`/`app.config.ts`, 2026-10-01): `react-native-callkeep` /
  `react-native-voip-push-notification` / `react-native-incall-manager` ĐÃ cài nhưng bị loại khỏi autolinking (`package.json` →
  `expo.autolinking.exclude`, lý do: callkeep chết trên RN 0.86) và plugin của chúng đang comment; `FOREGROUND_SERVICE_MICROPHONE|CAMERA|PHONE_CALL`,
  `USE_FULL_SCREEN_INTENT`, `MANAGE_OWN_CALLS`, iOS `UIBackgroundModes` `voip`/`audio`/`remote-notification` ĐÃ khai. Chưa có foreground service nào
  thật sự chạy trong lúc họp ⇒ ra nền giữa cuộc họp (về màn chính) thì Android (9+) cắt micro/camera của app (CHƯA XÁC MINH trên máy thật).
- Không bật `enableScreenShareService` (LiveKit) và `enableMultitaskingCameraAccess` (iOS 18+ cần `voip`). ⚠️ Hệ quả: chia sẻ màn hình
  trong phòng họp (nút có trên Android) sẽ LỖI trên Android 14+ — `MediaProjection` đòi foreground service kiểu `mediaProjection` đang chạy +
  quyền `FOREGROUND_SERVICE_MEDIA_PROJECTION` (chưa khai). Bật: `['@livekit/react-native-expo-plugin', { android: { audioType: 'communication',
  enableScreenShareService: true } }]` + thêm quyền đó, rồi build lại dev client.
- Gói LiveKit thật (không nằm trong bảng trên vì cài từ p0-08): `livekit-client` 2.22.3, `@livekit/react-native` 3.0.0, `@livekit/react-native-webrtc`
  144.2.0. `registerGlobals()` gọi LƯỜI một lần trong `src/core/media/livekit-loader.ts` (`loadLiveKit`, lần nối/xem trước đầu tiên), không ở `index.js`.
- Không sửa `app/.env.example`, `env.config.ts`, `types/env.d.ts` (đang thuộc phiên đăng nhập Google).
- `react-native-maps` (phương án dự phòng của p6-05 nếu Mapbox lỗi với New Architecture) chưa cài — chỉ cài khi spike Mapbox thật sự hỏng.

## Cổng `npm run typecheck` (không phụ thuộc Metro)

Trên Windows, Metro đang chạy ghi rác `/../src/**` vào `.expo/types/router.d.ts` (bộ theo dõi Expo kiểm `startsWith('../')` nhưng `path.relative` trả `..\src`) ⇒ union route phình ⇒ TS2590 giả.
`scripts/typed-routes.mjs` dựng bảng route thẳng từ `app/app/` vào `.typecheck/` (git-ignored, Metro không ghi được), `tsconfig.typecheck.json` đọc thư mục đó thay `.expo/types`.
`tsconfig.json` (editor/Metro) giữ nguyên `.expo/types` — gợi ý route trong IDE có thể còn dính rác, cổng kiểm thì không.
