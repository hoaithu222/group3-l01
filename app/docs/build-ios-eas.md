# Build và phân phối bản iOS (EAS Build)

Windows không build được iOS (cần macOS và Xcode). Dự án build iOS trên **EAS Build** (máy macOS của Expo), rồi đưa bản cho người thử
qua **TestFlight** hoặc **ad hoc**. Mọi lệnh chạy trong PowerShell tại `D:\work\super-app\app`. Bản Android xem
[`deploy-firebase-app-distribution.md`](deploy-firebase-app-distribution.md).

> Trạng thái 27/09/2026: dự án **chưa từng build iOS**. Cấu hình iOS mới được kiểm bằng `expo config --type introspect` (§5.1). Các lỗi ở
> §9 là dự đoán từ mã nguồn và tài liệu thư viện, chưa gặp thật.

## 1. Đường đi ngắn nhất

1. Đăng ký Apple Developer Program (trả phí): §3.1.
2. Tạo project EAS, lấy `EAS_PROJECT_ID`: §4.1.
3. Đưa `GoogleService-Info.plist` lên EAS: §4.2.
4. Thêm profile iOS vào `eas.json`: §4.3.
5. Kiểm cấu hình ngay trên Windows, build thử bản Simulator (chưa cần tài khoản Apple): §5.1.
6. Build và gửi lên TestFlight: §5.2.
7. Mời tester: §6.

Không muốn qua App Store Connect thì dùng bản ad hoc (§5.3), đổi lại phải đăng ký UDID của từng iPhone.

## 2. Thông số hiện có

| Thứ                        | Giá trị                                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Bundle ID                  | `com.mancode.vungnui` (mặc định của `IOS_BUNDLE_ID` trong `app.config.ts`)                                                                   |
| Tên dưới icon              | `Super App` (`CFBundleDisplayName` lấy từ `APP_NAME`)                                                                                        |
| Phiên bản                  | `0.1.0`; số build do EAS giữ (`appVersionSource: "remote"` trong `eas.json`)                                                                 |
| iOS tối thiểu              | 16.4 (Expo SDK 57). iPhone chỉ dọc; iPad được hỗ trợ (`supportsTablet: true`)                                                                |
| Firebase iOS app           | `1:567331116640:ios:c9654071adbbaeb2dd9505`, project `super-app-be1df` (tên trong console đang là `supper-app`)                              |
| `GoogleService-Info.plist` | `app/GoogleService-Info.plist`: đúng bundle ID và project, thuộc `.gitignore`, **chưa có** `CLIENT_ID` (chưa có OAuth client iOS)            |
| Backend                    | `https://api-production-9c319.up.railway.app/api/v1`, giống bản Android (`distribute.config.json`, target `internal`)                        |
| Expo                       | Tài khoản `thu.2222`, `eas-cli` 23.0.0 đã đăng nhập trên máy này. **Chưa có project EAS** (`EAS_PROJECT_ID` trống)                           |
| Capability Apple           | Push Notifications (`aps-environment`, do `expo-notifications`) và Associated Domains (`applinks:superapp.vcijsc.com`). EAS tự bật lúc build |

## 3. Chuẩn bị tài khoản (một lần)

### 3.1 Apple Developer Program

Phí 99 USD/năm (Apple có thể tính theo giá địa phương). Chưa có tài khoản trả phí thì chỉ build được bản Simulator.

|                              | Cá nhân                       | Tổ chức (nên dùng cho app của công ty)                                             |
| ---------------------------- | ----------------------------- | ---------------------------------------------------------------------------------- |
| Tên người bán trên App Store | Họ tên người đăng ký          | Tên pháp nhân                                                                      |
| Cần có                       | Apple ID bật xác thực hai lớp | Số D-U-N-S, tư cách pháp nhân, website, người đăng ký có thẩm quyền ký cho công ty |
| Thời gian duyệt              | Thường nhanh                  | Có thể vài ngày tới vài tuần (xin D-U-N-S rồi Apple xác minh)                      |

- ⚠ Chọn đúng loại từ đầu. Bundle ID thuộc về team đã đăng ký nó; chuyển app sang tài khoản khác về sau phải qua thủ tục App Transfer của Apple.
- Apple ID dùng cho `eas build` lần đầu nên có vai trò **Account Holder** hoặc **Admin** (được tạo Distribution Certificate và provisioning
  profile).
- Ghi lại **Team ID** (developer.apple.com → Membership, 10 ký tự): dùng cho `appleTeamId` (§4.3) và `APPLE_TEAM_ID` của file AASA (§8).

### 3.2 App Store Connect (chỉ cho TestFlight)

`eas submit` tự tạo app nếu chưa có (lấy thông tin từ `submit.testflight.ios`, §4.3). Muốn tạo tay: App Store Connect → Apps → **+** → New App.

- **Name**: tên trên App Store, tối đa 30 ký tự, không trùng app khác. "Super App" nhiều khả năng đã có người dùng; tên này được phép khác tên
  dưới icon (`APP_NAME`).
- **Primary Language**: Vietnamese. **Bundle ID**: `com.mancode.vungnui`, chỉ hiện sau khi đã được đăng ký (EAS đăng ký ở lần build đầu).
  **SKU**: tự đặt, ví dụ `superapp-ios`.
- Sau khi tạo: App Information → **Apple ID** (dãy số) chính là `ascAppId`.

### 3.3 Expo (EAS)

| Gói                    | Build iOS                           | Ghi chú                                                                                   |
| ---------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------- |
| Free                   | 15 bản/tháng, hàng đợi ưu tiên thấp | Thời gian tối đa mỗi build thấp hơn gói trả phí. Build lỗi trong 3 phút đầu không bị tính |
| Starter (19 USD/tháng) | Trừ vào 45 USD tín dụng build       | Hàng đợi ưu tiên, có máy lớn (`"resourceClass": "large"`)                                 |

Giá cập nhật ở <https://expo.dev/pricing>. App có nhiều module native (Skia, Mapbox, WebRTC, Firebase) nên thời gian build iOS chưa đo được;
ước chừng 20–45 phút, chưa kể thời gian chờ hàng đợi.

Nên tạo **Expo organization** cho công ty (expo.dev → Create organization) rồi tạo project dưới đó (`eas init --account <org>`), để project,
chứng chỉ ký và lịch sử build không gắn vào tài khoản cá nhân.

## 4. Cấu hình (một lần)

> ⛔ **EAS CLI không đọc `app/.env`.** Nó dựng cấu hình bằng `expo config` với `EXPO_NO_DOTENV=1`, và `.env` cũng không được upload vì thuộc
> `.gitignore`. Biến cho bản iOS phải nằm trong `env` của profile (`eas.json`) hoặc trong biến môi trường EAS. `app/.env` chỉ phục vụ
> `expo start` và build Android cục bộ. Các giá trị mặc định trong `app.config.ts` (tên app, slug, bundle ID) đang trùng với `.env`, nên hai
> nơi ra cùng cấu hình.

### 4.1 Tạo project EAS

```powershell
cd D:\work\super-app\app
eas init                  # hoặc: eas init --account <tên-organization>
```

EAS hỏi `Would you like to create a project for @<tài-khoản>/super-app?` → Yes. Vì `app.config.ts` là cấu hình động, tạo project xong lệnh sẽ
**báo lỗi** không tự ghi được `extra.eas.projectId` và in đoạn JSON chứa `projectId`. Đó là bình thường. Chép ID đó (cũng xem được trên trang
project ở expo.dev), rồi:

1. Điền vào `EAS_PROJECT_ID` của profile `railway` (§4.3). `eas build` lấy ID từ đây.
2. Trước các lệnh `eas` khác (`env:set`, `device:create`, `submit`, `credentials`, `build:resign`…), đặt biến trong phiên terminal:

   ```powershell
   $env:EAS_PROJECT_ID = "<projectId>"
   eas project:info          # phải in @<tài-khoản>/super-app và đúng ID
   ```

   Không dùng `setx`: biến toàn máy sẽ lọt sang dự án khác cũng đọc `EAS_PROJECT_ID` (ví dụ `D:\work\base-android`).

### 4.2 Đưa `GoogleService-Info.plist` lên EAS

```powershell
eas env:set --name GOOGLE_SERVICES_PLIST --type file --value ./GoogleService-Info.plist `
  --visibility secret --environment development --environment preview --environment production
eas env:list --environment production
```

- Lúc build, EAS tạo file ngoài thư mục dự án và gán **đường dẫn** của nó vào `GOOGLE_SERVICES_PLIST`. Có biến này thì `app.config.ts` mới
  khai `ios.googleServicesFile` và bật khối Firebase iOS (`@react-native-firebase/app` với `disableSPM`, `expo-build-properties` với
  `useFrameworks: 'static'`).
- ⛔ Build iOS **thiếu** biến này nhiều khả năng lỗi ở `pod install` hoặc bước link: các gói `@react-native-firebase/*` vẫn được autolink, nhưng
  ở chế độ Swift Package mặc định, mà chế độ đó cần `use_frameworks! :linkage => :dynamic`
  (`node_modules/@react-native-firebase/app/firebase_spm.rb`).
- Khi tải lại plist (ví dụ sau khi tạo OAuth client iOS), chạy lại đúng lệnh trên; `env:set` vừa tạo vừa cập nhật.

### 4.3 Thêm profile vào `eas.json`

Gộp các khoá dưới đây vào `app/eas.json`. **Giữ nguyên** `development`, `preview`, `production`: các profile đó trỏ `*.superapp.vcijsc.com`
(domain chưa chạy) và chưa từng được dùng để build.

```json
{
  "build": {
    "railway": {
      "env": {
        "EAS_PROJECT_ID": "<projectId ở §4.1>",
        "APS_ENVIRONMENT": "production",
        "UPDATES_ENABLED": "false",
        "EXPO_PUBLIC_ENV": "staging",
        "EXPO_PUBLIC_API_BASE_URL": "https://api-production-9c319.up.railway.app/api/v1",
        "EXPO_PUBLIC_SOCKET_URL": "https://api-production-9c319.up.railway.app",
        "EXPO_PUBLIC_SOCKET_PATH": "/socket.io",
        "EXPO_PUBLIC_API_TIMEOUT": "30000",
        "EXPO_PUBLIC_ENABLE_ERROR_TOAST": "true",
        "EXPO_PUBLIC_ENABLE_API_LOGGING": "false",
        "EXPO_PUBLIC_API_LOG_PAYLOAD": "false",
        "EXPO_PUBLIC_ENABLE_REFRESH_TOKEN": "true",
        "EXPO_PUBLIC_AUTH_ENABLED": "true"
      }
    },
    "ios-simulator": {
      "extends": "railway",
      "environment": "preview",
      "distribution": "internal",
      "ios": { "simulator": true }
    },
    "ios-adhoc": {
      "extends": "railway",
      "environment": "preview",
      "distribution": "internal",
      "autoIncrement": true
    },
    "testflight": {
      "extends": "railway",
      "environment": "production",
      "distribution": "store",
      "autoIncrement": true
    }
  },
  "submit": {
    "testflight": {
      "ios": {
        "appName": "<tên trên App Store>",
        "language": "vi",
        "sku": "superapp-ios"
      }
    }
  }
}
```

| Khoá                               | Vì sao                                                                                                                                                                                                                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `railway`                          | Profile gốc cho các profile iOS kế thừa (`extends`), không build trực tiếp. Các `EXPO_PUBLIC_*` chép từ target `internal` của `distribute.config.json` để bản iOS dùng cùng backend Railway với bản Android. Chúng nằm trong bundle nên là giá trị công khai; không đặt secret vào đây |
| `EAS_PROJECT_ID`                   | `app.config.ts` đọc biến này để ghi `extra.eas.projectId`. Thiếu thì `eas build` báo `EAS project not configured`. Project ID không phải secret                                                                                                                                        |
| `APS_ENVIRONMENT: "production"`    | Provisioning profile của bản ad hoc và App Store mang `aps-environment = production`. Để mặc định (`development`) thì Xcode báo profile không khớp entitlement `aps-environment` và dừng. Chỉ dev client dùng `development`                                                            |
| `UPDATES_ENABLED: "false"`         | Tắt OTA ở bản đầu (profile cũng không có `channel`). Bật lại cùng `channel` khi dùng EAS Update                                                                                                                                                                                        |
| `EXPO_PUBLIC_AUTH_ENABLED: "true"` | Mặc định trong `env.config.ts` là `false`, tức guard đăng nhập không chặn                                                                                                                                                                                                              |
| `environment`                      | Chọn bộ biến EAS có `GOOGLE_SERVICES_PLIST`: `preview` cho Simulator và ad hoc, `production` cho TestFlight                                                                                                                                                                            |
| `autoIncrement`                    | EAS tự tăng số build mỗi lần; App Store Connect từ chối số build trùng                                                                                                                                                                                                                 |
| `submit.testflight.ios`            | Dùng khi `eas submit` tự tạo app trên App Store Connect; `appName` tối đa 30 ký tự, chưa ai dùng. Sau lần gửi đầu, thêm `ascAppId` (§3.2) và `appleTeamId` (§3.1) để EAS khỏi tra cứu lại                                                                                              |

Lệnh `npx testflight` của Expo gói build và submit làm một, nhưng luôn dùng profile `production`, mà profile đó đang trỏ domain chưa chạy nên
chưa dùng được.

### 4.4 Mã hoá và `.easignore`

- **Khai báo mã hoá (export compliance).** Mỗi bản TestFlight đứng ở trạng thái _Missing Compliance_ cho tới khi trả lời câu hỏi mã hoá trong
  App Store Connect, và `eas build` cũng hỏi `iOS app only uses standard/exempt encryption?` mỗi lần. App dùng HTTPS và WebRTC (DTLS-SRTP qua
  thư viện mã hoá đi kèm WebRTC). Người phụ trách pháp lý chốt câu trả lời theo
  [hướng dẫn của Apple](https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations), rồi khai một lần
  trong `app.config.ts`: `ios: { config: { usesNonExemptEncryption: false } }` (hoặc `true`).
- **Chưa tạo `.easignore`.** EAS đọc file này ở **gốc repo** (`D:\work\super-app`), và khi có nó thì bỏ qua **mọi** `.gitignore`. Quên một dòng
  là `app/.env`, `be/.env`, `be/*-firebase-adminsdk-*.json` bị upload lên server EAS. Upload hiện khoảng 90 MB (file đã commit của cả repo),
  chấp nhận được.

## 5. Build

Các bước đăng nhập Apple cần nhập mã 2FA, nên chạy trong terminal của bạn.

### 5.1 Kiểm trước trên Windows, rồi build bản Simulator

Xem entitlement và Info.plist cuối cùng, không tốn lượt build:

```powershell
# Dùng cửa sổ PowerShell RIÊNG: để lại hai biến này thì lần `npm run distribute` Android kế tiếp phải prebuild lại.
$env:GOOGLE_SERVICES_PLIST = "./GoogleService-Info.plist"
$env:APS_ENVIRONMENT = "production"
$c = (npx expo config --type introspect --json) -join "`n" | ConvertFrom-Json
$c.ios.entitlements                  # applinks:superapp.vcijsc.com, aps-environment: production
$c.ios.infoPlist.UIBackgroundModes   # audio (do expo-audio)
```

Kết quả đo ngày 27/09/2026 khớp chú thích, đủ câu xin quyền (camera, micro, thư viện ảnh, vị trí khi đang dùng, Face ID, Bluetooth), plugin
Firebase iOS được bật. Sau khi có project EAS, `eas config -p ios -e testflight` in cấu hình mà EAS sẽ dùng (kiểm `extra.eas.projectId`,
`ios.bundleIdentifier`). Biến `secret` không đọc được ở máy bạn nên cấu hình in ra chưa có khối Firebase; đó là bình thường.

Build bản Simulator để bắt lỗi `pod install`, biên dịch, link trước khi có tài khoản Apple:

```powershell
eas build -p ios --profile ios-simulator
```

Kết quả là file `.tar.gz` chứa `.app`, chỉ chạy trên iOS Simulator của macOS. Link trang build (log từng bước) in ra terminal. Mỗi lần build
tốn một lượt của gói.

### 5.2 TestFlight

```powershell
eas build -p ios --profile testflight --auto-submit --what-to-test "Nội dung cần thử"
```

| Câu hỏi lần đầu                                                      | Trả lời                                                                                                                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Do you want to log in to your Apple account?`                       | Yes → Apple ID, mật khẩu, mã 2FA → chọn team của công ty                                                                                                      |
| Tạo mới hoặc dùng lại Distribution Certificate, Provisioning Profile | Để EAS tạo. EAS giữ trên server, lần sau tự dùng lại                                                                                                          |
| `Would you like to set up Push Notifications for your project?`      | **No** (hoặc _No, don't ask again_, EAS ghi `cli.promptToConfigurePushNotifications: false` vào `eas.json`). Dự án gửi push qua FCM; khoá APNs tạo riêng ở §8 |
| `iOS app only uses standard/exempt encryption?`                      | Theo §4.4. Cấu hình động nên EAS chỉ in hướng dẫn, lần sau vẫn hỏi                                                                                            |
| App Store Connect API Key (bước submit)                              | Để EAS tạo                                                                                                                                                    |

- EAS tự đăng ký bundle ID và bật Push Notifications, Associated Domains trên Apple Developer theo entitlement.
- `--auto-submit` dùng submit profile cùng tên (`testflight`) và đẩy lên App Store Connect ngay khi build xong. Gửi riêng sau đó:
  `eas submit -p ios --profile testflight --latest` (đặt `$env:EAS_PROJECT_ID` trước).
- App Store Connect thường xử lý thêm 5–30 phút rồi bản build mới hiện trong TestFlight.
- Lần sau chỉ cần chạy lại lệnh build; số build tự tăng.
- ⚠ `eas credentials` có mục tải chứng chỉ về máy: nó tạo `credentials.json` (chứa mật khẩu file `.p12`) trong thư mục dự án, mà
  `app/.gitignore` không chặn file này. Đừng commit.

### 5.3 Ad hoc (không qua TestFlight)

1. **Đăng ký máy** (mỗi iPhone một lần): `eas device:create` → chọn _Website_ → gửi link/QR cho tester. Tester mở bằng Safari trên iPhone,
   cài hồ sơ cấu hình (Cài đặt → Đã tải về hồ sơ → Cài đặt); UDID được thêm vào team Apple. Chưa đăng ký máy nào thì `eas build` ở bước 2
   cũng hỏi `Would you like to register them now?`.
2. **Build**: `eas build -p ios --profile ios-adhoc` → EAS hỏi `Select devices for the ad hoc build:` → chọn máy.
3. **Phát bản**, chọn một trong hai:
   - Gửi link trang build: tester mở bằng Safari trên iPhone → Install.
   - Firebase App Distribution, cùng group `superapp-testers` với Android. Tải `.ipa` ra **ngoài repo** vì `app/.gitignore` không chặn `*.ipa`:

     ```powershell
     $ipa = "$env:TEMP\superapp.ipa"
     $build = (eas build:view <BUILD_ID> --json) -join "`n" | ConvertFrom-Json   # BUILD_ID: đoạn cuối URL trang build
     $ProgressPreference = 'SilentlyContinue'                                    # PowerShell 5.1 tải rất chậm khi vẽ tiến trình
     Invoke-WebRequest $build.artifacts.buildUrl -OutFile $ipa
     firebase appdistribution:distribute $ipa --app 1:567331116640:ios:c9654071adbbaeb2dd9505 `
       --project super-app-be1df --groups superapp-testers --release-notes "Bản iOS thử nghiệm"
     ```

     `scripts/distribute-android.mjs` chỉ nhận App ID Android nên bước này chạy tay.

4. **Thêm máy về sau**: đăng ký UDID (Firebase gom sẵn: App Distribution → Testers & Groups → _Export Apple UDIDs_ → Apple Developer → Devices
   → _Register Multiple Devices_ → `eas device:create` chọn _Developer Portal_), rồi ký lại bản cũ bằng `eas build:resign`, hoặc build mới bằng
   `eas build -p ios --profile ios-adhoc --refresh-ad-hoc-provisioning-profile`.

Mỗi năm thành viên đăng ký được tối đa 100 iPhone; xoá máy không trả lại lượt cho tới kỳ gia hạn.

### 5.4 Dev client iOS (tuỳ chọn, cho lập trình viên)

- Thêm `EAS_PROJECT_ID` vào `env` của profile `development` (giữ `APS_ENVIRONMENT` mặc định `development`), đăng ký máy như §5.3, rồi
  `eas build -p ios --profile development`.
- Chạy JS từ Windows bằng `npm run start:metro` (bỏ qua guard Android của `npm start`). iPhone và máy tính cùng Wi-Fi; cho phép Node.js qua
  tường lửa Windows (cổng 8081).
- JS lúc này đọc `app/.env` của máy bạn. `http://10.0.2.2:3000` chỉ chạy trên máy ảo Android: đổi `EXPO_PUBLIC_API_BASE_URL` và
  `EXPO_PUBLIC_SOCKET_URL` sang Railway (HTTPS) rồi `npm run start:metro:clear`. API HTTP thường trong mạng LAN có thể bị App Transport
  Security chặn.
- Cần bật Developer Mode (§6).

## 6. Tester cài app

**TestFlight**

- Nội bộ, tối đa 100 người và phải là thành viên App Store Connect: Users and Access → mời (vai trò nào cũng được) → TestFlight → Internal
  Testing → tạo group (ví dụ `superapp-testers`), thêm người, bật tự phát bản. Muốn `eas submit` tự gắn bản vào group thì thêm
  `"groups": ["superapp-testers"]` vào `submit.testflight.ios` sau khi group đã có.
- Bên ngoài, tối đa 10.000 người: TestFlight → External Testing → tạo group → thêm build → gửi **Beta App Review** (bắt buộc với bản đầu của
  mỗi phiên bản). Điền Test Information, có **tài khoản demo** vì app bắt đăng nhập. Mời qua email hoặc public link.
- Tester cài app **TestFlight** từ App Store, đăng nhập đúng Apple ID được mời → Install. Mỗi bản TestFlight dùng được 90 ngày.

**Ad hoc** (link EAS hoặc Firebase)

- iOS 16 trở lên phải bật **Developer Mode**: mở app lần đầu (iOS sẽ nhắc) → Cài đặt → Quyền riêng tư & Bảo mật → Chế độ nhà phát triển → bật
  → khởi động lại → Bật.
- Máy chưa có UDID trong provisioning profile thì không cài được (§5.3, bước 4).

## 7. Bản iOS đầu tiên chưa có gì

| Tính năng                                      | Trên iOS                                    | Vì sao                                                                                                                   | Muốn có thì                                                                                                   |
| ---------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Thông báo đẩy                                  | Không có                                    | `src/core/notifications/device-registration.ts` trả `unsupported-platform` trên iOS; Railway chưa có credential Firebase | §8                                                                                                            |
| Đăng nhập Google                               | Ẩn nút, dùng email và mật khẩu              | `isGoogleSignInAvailable()` (`src/core/auth/social/google-sign-in.ts`) chỉ bật trên Android                              | OAuth client iOS, URL scheme (`REVERSED_CLIENT_ID`), plist mới; lên App Store thì kèm Sign in with Apple (§8) |
| Gọi, họp                                       | Chỉ khi app đang mở; không chia sẻ màn hình | Chưa có CallKit/PushKit (p2-02); `livekit-meeting-devices.ts` trả `null` cho chia sẻ màn hình trên iOS                   | p2-02, p2-04                                                                                                  |
| Universal link `https://superapp.vcijsc.com/…` | Mở Safari                                   | Domain chưa phục vụ file AASA                                                                                            | §8. Link `superapp://…` vẫn mở app                                                                            |
| Bản đồ                                         | Chế độ danh sách                            | `EXPO_PUBLIC_MAPBOX_TOKEN` trống                                                                                         | Thêm token `pk.…` vào `env` của profile                                                                       |
| Báo lỗi (Sentry)                               | Tắt                                         | `EXPO_PUBLIC_SENTRY_DSN` và `SENTRY_ORG` trống                                                                           | DSN, `SENTRY_ORG` và secret EAS `SENTRY_AUTH_TOKEN`                                                           |
| Cập nhật OTA                                   | Tắt                                         | `UPDATES_ENABLED: "false"`                                                                                               | Bật, thêm `channel`, phát bằng `eas update --environment …`                                                   |
| Chặn chụp màn hình ví                          | Không                                       | `src/features/wallet/hooks/useSecureScreen.ts` chỉ chạy trên Android                                                     | —                                                                                                             |

## 8. Làm sau

**Push iOS**

1. Apple Developer → Keys → **+** → _Apple Push Notifications service (APNs)_ → tải file `.p8`. Chỉ tải được một lần; `.gitignore` đã chặn
   `*.p8`.
2. Firebase console → Project settings → Cloud Messaging → Apple app configuration → tải khoá APNs lên (kèm Key ID và Team ID).
3. App: lấy token FCM iOS bằng `@react-native-firebase/messaging` (chỉ có API modular, xem [`native-libraries.md`](native-libraries.md)) và
   gửi `platform: 'IOS'` trong `device-registration.ts`.
4. Backend: đặt `FIREBASE_CREDENTIALS_JSON` cho `api` và `worker` trên Railway. `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY_P8` chỉ dùng cho
   cuộc gọi VoIP (p2-02).

**Universal link**: domain `APP_LINK_DOMAIN` (`superapp.vcijsc.com`) phải trả `/.well-known/apple-app-site-association`. Mẫu nằm ở
`deploy/nginx/well-known/apple-app-site-association.template`, điền `APPLE_TEAM_ID` qua `deploy/scripts/render-config.sh`. API Railway hiện
không phục vụ file này.

**Trước khi nộp App Store**

- Hiện nút Google trên iOS thì phải có Sign in with Apple (guideline 4.8). Backend hiện chỉ nhận `google.com`
  (`be/src/modules/auth/services/social-login.service.ts`).
- Xoá tài khoản trong app: đã có (Cài đặt → Xoá tài khoản, `DeleteAccountScreen.tsx`).
- Ảnh chụp màn hình iPhone **và iPad** (vì `supportsTablet: true`), App Privacy, URL chính sách quyền riêng tư, tài khoản demo cho App Review.
- `expo-audio` tự thêm `UIBackgroundModes: audio` (tuỳ chọn `enableBackgroundPlayback` mặc định `true`). App không phát âm thanh nền thì tắt
  tuỳ chọn này, tránh bị hỏi theo guideline 2.5.4.
- Backend production thật (domain riêng, không dùng chung DB với dev).

## 9. Lỗi thường gặp

| Triệu chứng                                                                                   | Nguyên nhân                                                                            | Cách xử lý                                                                                                                                                              |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EAS project not configured`, lệnh đòi `eas init` dù đã tạo project                           | EAS CLI không đọc `.env`; phiên terminal hoặc `env` của profile thiếu `EAS_PROJECT_ID` | `$env:EAS_PROJECT_ID = "<id>"`; kiểm `build.railway.env`                                                                                                                |
| `Slug for project identified by "extra.eas.projectId" (…) does not match the "slug" field`    | Project EAS có slug khác `super-app`                                                   | Dùng project slug `super-app`, hoặc đặt `APP_SLUG` trong `env` của profile cho khớp                                                                                     |
| `pod install` hoặc bước link lỗi quanh Firebase (`RNFBApp`, `FirebaseCore`, duplicate symbol) | Environment của profile thiếu `GOOGLE_SERVICES_PLIST`, khối Firebase iOS không bật     | `eas env:list --environment <env>`; tạo lại biến (§4.2)                                                                                                                 |
| `… doesn't match the entitlements file's value for the aps-environment entitlement`           | Bản ad hoc/TestFlight build với `APS_ENVIRONMENT` khác `production`                    | Kiểm `env` của profile                                                                                                                                                  |
| Tải `MapboxCommon`/`MapboxCoreMaps` bị 401 hoặc 403                                           | Cần token tải SDK Mapbox                                                               | Token `sk.…` scope `DOWNLOADS:READ`: `eas env:set --name RNMAPBOX_MAPS_DOWNLOAD_TOKEN --value <sk…> --visibility secret --environment preview --environment production` |
| Pod `react-native-skia` lỗi vì thiếu `libs/ios`                                               | Script `postinstall` của Skia không chạy                                               | Mục Skia trong [`native-libraries.md`](native-libraries.md)                                                                                                             |
| Build phase Sentry đòi `SENTRY_AUTH_TOKEN`                                                    | Profile có đặt `SENTRY_ORG`                                                            | Bỏ `SENTRY_ORG` ở bản đầu, hoặc thêm secret `SENTRY_AUTH_TOKEN`                                                                                                         |
| `An App ID with Identifier 'com.mancode.vungnui' is not available`                            | Bundle ID đã thuộc team khác                                                           | Đăng nhập đúng team. Không lấy lại được thì đổi `IOS_BUNDLE_ID`, tạo app iOS mới trên Firebase và tải plist mới                                                         |
| Build bị huỷ vì quá thời gian                                                                 | Giới hạn thời gian của gói Free                                                        | Gói trả phí, `"resourceClass": "large"`                                                                                                                                 |
| App báo lỗi mạng khi đăng nhập                                                                | Bundle mang URL API sai                                                                | Kiểm `EXPO_PUBLIC_API_BASE_URL` trong `env` của profile (không phải `.env`), build lại                                                                                  |
| TestFlight: _Missing Compliance_                                                              | Chưa khai mã hoá                                                                       | Trả lời trong App Store Connect, hoặc khai `usesNonExemptEncryption` (§4.4)                                                                                             |
| Email ITMS-91053 (Missing API declaration)                                                    | Privacy manifest thiếu lý do dùng API                                                  | Thêm `ios.privacyManifests.NSPrivacyAccessedAPITypes` đúng loại API trong email                                                                                         |
| Email ITMS-90683 (Missing purpose string)                                                     | Binary gọi API cần câu xin quyền mà Info.plist thiếu                                   | Thêm câu qua tuỳ chọn của plugin hoặc `ios.infoPlist`. Khoá đang cố ý đặt `false` (vị trí "luôn luôn", motion) thì bàn với lane p6-05 trước                             |
| `The bundle version must be higher than the previously uploaded version`                      | Trùng số build                                                                         | Giữ `autoIncrement`; chỉnh bằng `eas build:version:set -p ios`                                                                                                          |
| Ad hoc: không cài được lên máy                                                                | Máy chưa có trong provisioning profile                                                 | Đăng ký UDID, rồi `eas build:resign` hoặc `--refresh-ad-hoc-provisioning-profile`                                                                                       |
| `eas submit` báo tên app đã có người dùng                                                     | `appName` trùng trên App Store                                                         | Đổi `appName` trong `submit.testflight.ios`                                                                                                                             |

## 10. Tham khảo

- Expo: [Biến môi trường EAS](https://docs.expo.dev/eas/environment-variables/) và
  [FAQ](https://docs.expo.dev/eas/environment-variables/faq/) (EAS CLI không nạp `.env`),
  [Internal distribution](https://docs.expo.dev/build/internal-distribution/),
  [iOS Developer Mode](https://docs.expo.dev/guides/ios-developer-mode/),
  [iOS capabilities](https://docs.expo.dev/build-reference/ios-capabilities/), [eas.json](https://docs.expo.dev/eas/json/),
  [.easignore](https://docs.expo.dev/build-reference/easignore/), [npx testflight](https://docs.expo.dev/build-reference/npx-testflight/),
  [Bảng giá](https://expo.dev/pricing).
- Apple: [Upcoming requirements](https://developer.apple.com/news/upcoming-requirements/): từ 28/04/2026 bản upload phải build bằng Xcode 26
  (SDK iOS 26). Theo [Expo](https://expo.dev/blog/app-store-connect-minimum-sdk-26), image EAS mặc định từ SDK 54 đã dùng Xcode 26 nên không
  cần đặt `image`. [Mã hoá và quy định xuất khẩu](https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations).
- Firebase: [Đăng ký thêm thiết bị iOS cho App Distribution](https://firebase.google.com/docs/app-distribution/register-additional-devices).
- Trong repo: [`native-libraries.md`](native-libraries.md), [`deploy-firebase-app-distribution.md`](deploy-firebase-app-distribution.md),
  [`docs/deploy-firebase-railway.md`](../../docs/deploy-firebase-railway.md).

## Đã kiểm chứng (27/09/2026)

- Lệnh và cờ `eas` dùng trong tài liệu có trong `eas-cli` 23.0.0 (`--help` và mã nguồn). EAS CLI dựng cấu hình bằng `expo config` với
  `EXPO_NO_DOTENV=1`; `env:set --type file` đọc nội dung file từ đường dẫn truyền vào.
- Firebase có app iOS đúng bundle ID; plist cục bộ đúng bundle ID và project.
- `expo config --type introspect` (có plist và `APS_ENVIRONMENT=production`) ra entitlement và Info.plist như §5.1.
- Chưa chạy `eas init`, `eas build`, `eas submit`; chưa có tài khoản Apple Developer lúc viết.
