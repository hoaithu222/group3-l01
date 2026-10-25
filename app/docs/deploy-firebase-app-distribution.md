# Chia sẻ bản Android qua Firebase App Distribution

Build APK trên máy rồi đẩy lên Firebase để tester cài bằng link/mail — **một lệnh**:

```powershell
npm run distribute -- --notes "Sửa lỗi đăng nhập"
```

Bản iOS (EAS Build, TestFlight/ad hoc) có hướng dẫn riêng: [`build-ios-eas.md`](build-ios-eas.md).

Thiết kế theo `vci-sun-mobile` (`scripts/firebase-distribute.js` + `distribute.config.json`), chỉnh cho Super App:
Expo SDK 57 · Gradle 9 · prebuild chỉ chạy khi phần native đổi · tự tăng `versionCode` · nhúng URL backend Railway.

## Thông số

| Thứ                      | Giá trị                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Firebase project         | `super-app-be1df` (Console: <https://console.firebase.google.com/project/super-app-be1df/appdistribution>) |
| Android App ID (`--app`) | `1:567331116640:android:39b0b835944d965fdd9505`                                                            |
| Package                  | `com.mancode.vungnui` (= `ANDROID_PACKAGE`, khớp app trên Firebase)                                        |
| Group nhận bản           | `superapp-testers` (1 tester, kiểm tra ngày 27/09/2026)                                                    |
| Đích khai ở              | `distribute.config.json` (target `internal`); `--list` để xem                                              |

> Project `super-app-vci` được tạo nhầm lúc đầu (trước khi có `super-app-be1df`) và **không dùng nữa** — có thể xoá trên Console.

## Chuẩn bị 1 lần

1. **JDK 17+** (`java -version`; máy này có Temurin 21). Gradle 9.3 chạy được tới Java 25.
2. **Android SDK** (Android Studio). Script tự dò `%LOCALAPPDATA%\Android\Sdk`, không cần đặt `ANDROID_HOME`.
3. **Firebase CLI + đăng nhập**:
   ```powershell
   npm install -g firebase-tools
   firebase login
   firebase login:list        # phải thấy tài khoản có quyền trên super-app-be1df
   ```
   Phiên đăng nhập nằm ngoài repo (`%APPDATA%\configstore`) — cài lại máy là mất. Muốn khỏi phụ thuộc → service account (§Xác thực).
4. `google-services.json` ở gốc `app/` (đã khai ở target `internal`, xem §Push).

Đã đăng nhập sẵn thì **chỉ cần chạy lệnh ở trên** — script tự kiểm đăng nhập, quyền vào project, và app có thuộc project, TRƯỚC khi build.

## Mỗi lần phát hành

| Lệnh                                                  | Làm gì                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| `npm run distribute -- --notes "…"`                   | Build APK release → kiểm → đẩy lên group của target                               |
| `npm run distribute -- --notes-file ghi-chu.md`       | Ghi chú nhiều dòng (đi qua file)                                                  |
| `npm run distribute:upload`                           | Không build, đẩy APK có sẵn                                                       |
| `npm run distribute:dry`                              | In kế hoạch + lệnh, không chạy gì (không cần đăng nhập/SDK)                       |
| `npm run distribute -- --preflight-only`              | Kiểm cấu hình, quyền truy cập Firebase và SDK/JDK; không build/upload             |
| `npm run distribute:list`                             | Liệt kê các đích                                                                  |
| `npm run distribute -- --build-only`                  | Build + kiểm APK, không đẩy                                                       |
| `npm run distribute -- --target khach-hang`           | Đẩy sang project Firebase khác (mẫu trong config)                                 |
| `npm run distribute -- --testers a@x.com`             | Gửi thẳng theo email (ngoài group)                                                |
| `npm run distribute -- --add-testers a@x.com,b@x.com` | Thêm tester vào group của target                                                  |
| `npm run distribute -- --abi universal`               | APK đủ 4 ABI (mặc định `arm64-v8a` — máy thật; máy ảo x86_64 dùng `--abi x86_64`) |

Thời gian: lần đầu 5–10 phút (prebuild + Gradle); lần sau không đổi native khoảng 1–3 phút.

Cờ đầy đủ: `node scripts/distribute-android.mjs --help`.

## Ánh xạ biến môi trường: app ↔ backend Railway

Bản gửi tester **không dùng `.env` dev** (đang là `http://10.0.2.2:3000` — máy ảo, tester không với tới). Biến `EXPO_PUBLIC_*`
khai trong `env` của target được đặt vào tiến trình build và **đè lên `.env`**; app đọc chúng ở `src/core/config/env.config.ts`.

| App (`env.config.ts` → `RAW`)                                                                       | Giá trị bản phân phối                                                          | Khớp với backend Railway (`api-production-9c319.up.railway.app`)                                                          |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_API_BASE_URL`                                                                          | `https://api-production-9c319.up.railway.app/api/v1`                           | `PUBLIC_API_URL` + tiền tố `/api/v1` của `router.ts`; kiểm: `GET /api/v1/auth/nonce` → 200                                |
| `EXPO_PUBLIC_SOCKET_URL`                                                                            | `https://api-production-9c319.up.railway.app` (cùng host, KHÔNG kèm `/api/v1`) | Socket.IO chạy chung cổng với API; `SOCKET_ADAPTER=redis`; kiểm: `GET /socket.io/?EIO=4&transport=polling` → 200          |
| `EXPO_PUBLIC_SOCKET_PATH`                                                                           | `/socket.io`                                                                   | path mặc định của server                                                                                                  |
| `EXPO_PUBLIC_AUTH_ENABLED`                                                                          | `true`                                                                         | backend thật có đăng nhập (`JWT_*` đã đặt trên Railway)                                                                   |
| `EXPO_PUBLIC_ENABLE_REFRESH_TOKEN`                                                                  | `true`                                                                         | BE có `/auth/refresh` (app gửi `X-Client-Platform: ANDROID` → refresh token trong body)                                   |
| `EXPO_PUBLIC_API_TIMEOUT`                                                                           | `30000`                                                                        | Railway đang ở `us-west` — mạng VN chậm hơn, đừng hạ                                                                      |
| `EXPO_PUBLIC_ENV`                                                                                   | `staging`                                                                      | chỉ là nhãn (không nhánh logic nào đọc); backend đang dùng chung DB dev                                                   |
| `EXPO_PUBLIC_ENABLE_API_LOGGING` · `EXPO_PUBLIC_API_LOG_PAYLOAD` · `EXPO_PUBLIC_ENABLE_ERROR_TOAST` | `false` · `false` · `true`                                                     | không log body (chứa mật khẩu) trong bản gửi người khác                                                                   |
| `ANDROID_PACKAGE` (lúc build)                                                                       | `com.mancode.vungnui`                                                          | Firebase app + `google-services.json` cùng package                                                                        |
| `GOOGLE_SERVICES_JSON` (lúc build)                                                                  | `google-services.json` (target `googleServicesFile`)                           | Push FCM — xem §Push                                                                                                      |
| `APP_LINK_DOMAIN`                                                                                   | `superapp.vcijsc.com`                                                          | ⚠ BE `PUBLIC_APP_LINK_BASE` **chưa đặt** trên Railway (mặc định `localhost`) → link mời sai. Đặt khi domain thật sẵn sàng |

Đổi backend (domain riêng, môi trường khác): sửa `env` của target trong `distribute.config.json` — lần build kế tiếp
script thấy bộ `EXPO_PUBLIC_*` đổi nên tự xoá cache Metro (không thì bundle có thể mang URL cũ). Sau mỗi build script
**mở APK, đọc JS bundle và dừng nếu không thấy host API** của target.

`eas.json` (profile `preview`/`production`) còn trỏ `staging.superapp.vcijsc.com` / `superapp.vcijsc.com` — chưa tồn tại,
không dùng cho luồng này.

## Push (FCM)

`google-services.json` (project `super-app-be1df`, package `com.mancode.vungnui`) được nối vào bản phân phối qua
`googleServicesFile` của target → app đăng ký được token FCM. Script kiểm file **đúng package** trước khi build.

- **Phía backend chưa gửi được push**: Railway chưa có `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY`.
  Lấy ở Firebase Console → Project settings → Service accounts → Generate new private key (project `super-app-be1df`), đặt
  các biến đó cho service **worker** (push được gửi từ worker). Lúc đó BE và app mới cùng một project FCM.
- `GoogleService-Info.plist` (iOS) chỉ được nối khi đặt biến build `GOOGLE_SERVICES_PLIST` — dùng cho bản iOS build trên EAS
  ([`build-ios-eas.md`](build-ios-eas.md)); luồng APK này không dùng tới. Cả hai file đều thuộc `.gitignore` — không commit.
- Bản dev (`npm start`) không có push trừ khi đặt `GOOGLE_SERVICES_JSON=./google-services.json` trong `.env`.

## Đăng nhập Google (Firebase Auth)

Nút "Tiếp tục với Google" ở màn Đăng nhập (chỉ Android; iOS chưa cấu hình) → Firebase ID token → `POST /auth/firebase-login`
(chưa có tài khoản thì BE tự tạo, trùng email đã xác minh thì vào đúng tài khoản đó). Code: `src/core/auth/social/`. **Thiếu một trong
năm điều kiện là hỏng**:

| #   | Điều kiện                                                                                                                                                                                         | Kiểm                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | Provider **Google** bật trong Firebase console → Authentication → Sign-in method                                                                                                                  | Console (project `super-app-be1df`: đã bật)                                                                     |
| 2   | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` = Web client ID của provider trên (công khai) — `.env` cho bản dev, `env` của target cho bản phân phối. Trống ⇒ nút ẩn                                         | `distribute.config.json`, `.env`                                                                                |
| 3   | **SHA-1 (+ SHA-256) của keystore ký bản build** đăng ký cho app Android trong Firebase, rồi **tải lại `google-services.json`** (tệp mới mới có mục `oauth_client`)                                | `firebase apps:android:sha:list <appId> --project super-app-be1df`; `oauth_client` trong `google-services.json` |
| 4   | BE có credential Firebase (`FIREBASE_CREDENTIALS_JSON`) trên **cả `api` (xác thực token) lẫn `worker` (gửi push)**. Thiếu ⇒ `firebase-login` trả `503 SYS_503` ("tạm thời không khả dụng")        | Railway → Variables của từng service                                                                            |
| 5   | **Build lại native** (dev client / APK): `@react-native-google-signin/google-signin` + `@react-native-firebase/*` là module native. Bản cũ hiện "chưa hỗ trợ đăng nhập bằng Google" thay vì crash | `npm run start:android` (guard tự build khi dấu vân tay native đổi)                                             |

Keystore hiện tại `android/app/debug.keystore` (cũng là khoá ký bản `assembleRelease` — xem §Chữ ký):
SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` ·
SHA-256 `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`.

```bash
firebase apps:android:sha:create 1:567331116640:android:39b0b835944d965fdd9505 <SHA-1> --project super-app-be1df   # lặp cho SHA-256
firebase apps:sdkconfig ANDROID 1:567331116640:android:39b0b835944d965fdd9505 --project super-app-be1df -o google-services.json
```

⚠ Phát hành lên Google Play: thêm SHA-1/SHA-256 của **upload key** và của **App signing key** (Play Console → App integrity) —
bản cài từ Play được Google ký lại bằng khoá khác.

| Triệu chứng                                               | Nguyên nhân                                                                                         |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Hộp chọn tài khoản đóng ngay / log `DEVELOPER_ERROR` (10) | SHA-1 của bản build chưa đăng ký (đk. 3), `google-services.json` cũ, hoặc `webClientId` sai (đk. 2) |
| "Đăng nhập bằng Google tạm thời không khả dụng"           | BE trả 503: thiếu `FIREBASE_*` trên Railway (đk. 4) hoặc Firebase không với tới được                |
| "Phiên đăng nhập Google đã hết hạn" (`AUTH_022`)          | Token cũ hơn 5 phút / thuộc project Firebase khác BE (`FIREBASE_PROJECT_ID`)                        |
| "…chưa có email đã xác minh" (`AUTH_023`)                 | Tài khoản Google không có email đã xác minh                                                         |

Tài khoản tạo bằng Google **không có mật khẩu**: đổi mật khẩu/đổi email/bật sinh trắc học (đều đòi mật khẩu hiện tại) chỉ dùng được
sau khi tự đặt mật khẩu qua "Quên mật khẩu".

## Xác thực (chọn 1 cho mỗi target)

| Trường trong config                | Cơ chế                                                  | Dùng khi                                   |
| ---------------------------------- | ------------------------------------------------------- | ------------------------------------------ |
| `credentialFile` / `credentialEnv` | Service account JSON → `GOOGLE_APPLICATION_CREDENTIALS` | CI, máy dùng chung, project của người khác |
| `account`                          | `firebase --account <email>` (đã `firebase login:add`)  | Đổi qua lại giữa vài tài khoản             |
| (để trống)                         | Phiên `firebase login` mặc định                         | Máy cá nhân — cách đang dùng               |

Service account: Google Cloud Console → IAM → Service Accounts → role **Firebase App Distribution Admin** → Keys → JSON.
⛔ Tên file **bắt buộc chứa `service-account`** (vd `firebase-khachhang.service-account.json`) để dính rule `.gitignore`;
script CHẶN tên khác vì đặt sai tên là commit lộ khoá.

## Mời người khác cài

1. Thêm email vào group: `npm run distribute -- --add-testers a@x.com` (hoặc Console → App Distribution → Testers & groups).
   Mỗi bản mới, Firebase mail cho cả group; tester đã cài **Firebase App Tester** nhận thông báo "Update available".
2. Hoặc dùng **invite link** của group (Console → Testers & groups → group → Invite link) để gửi cho người chưa có email.
3. Tester mở link trên điện thoại Android → cài. Lần đầu phải bật "cài từ nguồn không rõ".

`versionCode` tự tăng theo phút (từ 2026-01-01) và luôn lớn hơn lần trước — Android chỉ cho cài đè khi số này tăng.

## ⛔ Chữ ký

APK ký bằng **debug key** của template Expo (`android/app/debug.keystore`): đủ để phân phối nội bộ, nhưng
**không upload Google Play được** và không cài đè lên bản ký bằng khoá khác (phải gỡ bản cũ trước:
`INSTALL_FAILED_UPDATE_INCOMPATIBLE` / "App not installed"). Phát hành store cần upload key thật (EAS hoặc `assembleRelease` + keystore riêng).

## Những chốt chặn script tự kiểm

1. **Trước khi build**: Firebase CLI đã đăng nhập; tài khoản vào được project; App ID thuộc project và cùng package với `app.config.ts`.
2. Target còn giá trị mẫu `DIEN_*` hoặc `appId` sai dạng Android → dừng.
3. Tên file credential không chứa `service-account`, hoặc service account thuộc project khác target → dừng.
4. `google-services.json` không có app cho package hiện tại → dừng (nếu không Gradle chết sau vài phút).
5. Prebuild chỉ khi dấu vân tay native (`@expo/fingerprint`) đổi; Gradle chết → không đẩy bản cũ.
6. Sau build: `aapt2` xác nhận package + `versionCode`; JS bundle phải chứa host API của target.
7. Ghi chú đi qua **file** (`--release-notes-file`): trên Windows, ký tự xuống dòng làm `firebase.cmd` chỉ nhận dòng đầu mà vẫn trả mã 0.

## Lỗi thường gặp

| Triệu chứng                             | Nguyên nhân                                                                                                                                                       | Cách sửa                                                                                                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Firebase CLI chưa đăng nhập`           | Máy mới / mất `%APPDATA%\configstore`                                                                                                                             | `firebase login`                                                                                                                                                    |
| `App ID … không thuộc project`          | Sai `appId` trong config                                                                                                                                          | `firebase apps:list ANDROID --project super-app-be1df`                                                                                                              |
| HTTP 403 khi upload                     | Tài khoản thiếu quyền App Distribution                                                                                                                            | Cấp role trên project, hoặc dùng service account                                                                                                                    |
| `Không chạy được java`                  | JDK chưa cài / hỏng `JAVA_HOME`                                                                                                                                   | Cài Temurin 21; `JAVA_HOME` trỏ tới thư mục JDK                                                                                                                     |
| `JS bundle KHÔNG chứa "<host>"`         | Bundle mang API cũ                                                                                                                                                | Xoá `%TEMP%\metro-cache`, chạy lại                                                                                                                                  |
| `Gradle build daemon disappeared` / OOM | Hết Metaspace (`OutOfMemoryError` trong log daemon). Template Expo mặc định 512m — script đã tự nới (4g/2g theo RAM). Còn dính: daemon chết vẫn giữ RAM/khoá file | `android\gradlew --stop`; kill `java.exe` của `GradleDaemon`/`KotlinCompileDaemon` còn sót (⚠ đừng kill Android Studio); chỉnh `gradleJvmArgs` trong target nếu cần |
| Tester: "App not installed"             | Đang có bản ký khác (Play/EAS)                                                                                                                                    | Gỡ bản cũ rồi cài                                                                                                                                                   |
| `--dry-run` chạy chậm lần đầu           | Nạp `app.config.ts`                                                                                                                                               | Bình thường (vài giây)                                                                                                                                              |

## Khác gì `vci-sun-mobile`

| `vci-sun-mobile`                                              | Ở đây                                                 | Vì sao                                                      |
| ------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| `firebase-distribute.js` (CommonJS) + `android-env.js` dò JDK | `distribute-android.mjs` + `lib/distribute.mjs` (ESM) | cùng phong cách `ensure-dev-build.mjs`                      |
| `expo prebuild` mỗi lần build                                 | Chỉ khi fingerprint native đổi                        | SDK 57 prebuild mặc định `--clean` — chạy thừa mất vài phút |
| Không đổi `versionCode`                                       | Tự tăng theo phút, ghi vào `android/app/build.gradle` | để tester nhận "Update available" và cài đè được            |
| Không kiểm nội dung APK                                       | Kiểm package/versionCode/host API trong bundle        | tránh gửi bản trỏ nhầm backend                              |
| `build-test-apk.js` truyền `PMS_UPLOAD_*`                     | Không cần                                             | template Expo SDK 57 đã ký release bằng debug key           |
| Tách project FCM và project phân phối                         | Dùng chung `super-app-be1df`                          | một project cho cả push lẫn phân phối                       |
