# Base Android — React Native

Khung dự án **React Native 0.86 + Expo SDK 57 + Expo Router + NativeWind 4 +
TypeScript strict**, dựng theo đúng kiến trúc của base web
[`base-projects`](../base-projects) để hai nền tảng đọc được code của nhau.

**Trong hộp:** hệ token màu 147 × 2 theme · thang chữ 15 vai
trò có **ngưỡng chống Android cắt dấu tiếng Việt đo từ chính file font** · **bộ
component giao diện dựng theo design system BIDV SmartBanking** (25 nhóm) · **bộ
icon 303 cái xuất thẳng từ Figma**, nhuộm được theo token · tầng HTTP có làm mới
token 401 xếp hàng · phiên đăng nhập cất token đúng chỗ (Keychain/Keystore) ·
4 màn hình xác thực · module registry lo thanh tab và phân quyền · 6 lớp gác
chất lượng.

**Không có:** màn hình nghiệp vụ nào — phần đó dựng theo từng dự án. Bộ
component ở `src/shared/ui/`, đọc `src/shared/ui/AGENTS.md` trước khi thêm hay
sửa gì ở đó.

> ⚠️ Cờ `EXPO_PUBLIC_AUTH_ENABLED` mặc định **TẮT** ở tầng cơ chế
> (`env.config.ts`) để một bản sao mới của base vào thẳng được mọi màn hình khi
> chưa có backend nào. **`.env.example` của dự án này đã đặt `true`** — Super
> App có backend thật từ Phase 0 (`docs/plan/runbook-phase0-app.md`). Đặt lại
> `false` chỉ khi cố ý dựng giao diện lúc BE chưa chạy.

---

## Bắt đầu

```bash
npm install
cp .env.example .env         # sửa EXPO_PUBLIC_API_BASE_URL trỏ về backend của bạn

npm start                    # Metro; Android: tự prebuild + build + cài dev-client nếu cần
npm run start:clear          # như trên + xoá cache Metro (thay cho `npx expo start -c`)
npm run ios                  # iOS (chỉ trên macOS): dựng + cài dev-client, rồi `npm start`
```

**Luôn mở bằng `npm start` / `npm run start:clear`**, đừng gõ thẳng `npx expo start`.
Trước khi mở Metro, script `ensure-dev-build.mjs` so dấu vân tay native với lần
build trước. Chưa cài app, thêm gói có phần native hay sửa plugin trong
`app.config.ts` thì nó tự build lại rồi cài lên mọi máy đang cắm. Không đổi gì thì
bước này mất ~3 giây; không có máy Android nào đang cắm thì nó bỏ qua. Muốn tự mở
app trên Android luôn thì dùng `start:android` / `start:android:clear`.

> ⛔ `npx expo start` rồi bấm `a` chỉ **mở** app đã cài, không cài. Máy chưa có app
> → `CommandError: No development build (com.mancode.vungnui) … is installed`.
> Đây là lý do phải đi qua `npm start` thay vì gọi `expo` trực tiếp.
> ⚠️ `npm run android` (`expo run:android`) KHÔNG prebuild lại khi `android/` đã
> có — sửa `app.config.ts` rồi chạy nó vẫn ra native cũ.

> ⛔ **Base này KHÔNG chạy trên Expo Go.** Nó dùng `expo-dev-client` và font nhúng
> lúc build. Expo Go không nạp được font nhúng và không có module native của dự
> án — chữ sẽ rơi về font hệ thống và một số màn hình lỗi. `npm run start:go` có
> sẵn để thử nhanh, nhưng đừng đánh giá giao diện qua đó.

| Lệnh                          | Việc                                                                   |
| ----------------------------- | ---------------------------------------------------------------------- |
| `npm start`                   | Bảo đảm dev build đúng bản trên máy Android → Metro (dev-client)       |
| `npm run start:clear`         | Như trên + xoá cache — **bắt buộc sau khi sửa `.env`**                 |
| `npm run start:android`       | Như `npm start` + tự mở app trên Android                               |
| `npm run start:android:clear` | Như `start:clear` + tự mở app trên Android                             |
| `npm run start:metro[:clear]` | CHỈ Metro, bỏ qua bước dev build (vd máy thật đã cài bản EAS)          |
| `npm run android` / `ios`     | Dựng bản native rồi cài lên máy                                        |
| `npm run prebuild`            | Sinh lại `android/` + `ios/` từ `app.config.ts`                        |
| `npm run typecheck`           | Sinh bảng route rồi `tsc -p tsconfig.typecheck.json` (không đọc `.expo/types`) |
| `npm run lint` / `lint:fix`   | ESLint                                                                 |
| `npm test`                    | Jest                                                                   |
| `npm run check`               | Chạy hết: typecheck → lint → kiểm import → **kiểm class** → test       |
| `npm run check:imports`       | Gói import mà chưa khai trong `package.json` · **import chéo feature** |
| `npm run check:classes`       | Class Tailwind CHẾT (`text-body`, `rounded-2xl`) — xem bên dưới        |
| `npm run check:orphans`       | File không ai với tới + gói khai mà không ai import (knip)             |
| `npm run check:deps`          | Đối chiếu version gói với SDK đang dùng (`expo install --check`)       |
| `npm run doctor`              | `expo-doctor` — soát cấu hình native                                   |
| `npm run generate:styles`     | Sinh lại token màu + thang chữ + hình học (gọi cả `generate:layout`)   |

---

## Cấu trúc

```
app/                        CÂY ROUTE (Expo Router) — file MỎNG, chỉ trỏ tới màn hình
├── _layout.tsx             gốc: providers + chặn vẽ tới khi biết trạng thái phiên
├── (auth)/                 nhóm KHÁCH — đăng nhập, đăng ký, quên/đặt lại mật khẩu
├── (app)/                  nhóm ĐÃ ĐĂNG NHẬP — thanh tab đọc MODULE_REGISTRY
│   ├── index.tsx            chỉ <Redirect> sang /workspaces, KHÔNG hiện tab
│   ├── workspaces/          · activity/ · study/  — mỗi phân hệ MỘT index.tsx (placeholder Phase 0)
│   └── me/                  _layout.tsx (Stack riêng) + index.tsx + settings.tsx
├── invite/[code].tsx       deep link lời mời — NGOÀI (app)/(auth), mở được khi CHƯA đăng nhập
├── demo/                   THƯ VIỆN COMPONENT — ⛔ đồ bỏ đi khi giao dự án thật
└── +not-found.tsx

src/
├── shell/                  VỎ ỨNG DỤNG — biết về ứng dụng CỤ THỂ này
│   ├── config/             PATHS, hằng số của app
│   ├── providers/          Gesture → Keyboard → SafeArea → Query → Theme → Toast
│   ├── navigation/         MODULE_REGISTRY (bar/menu) + lọc quyền + lọc cờ + danh sách chọn phân hệ
│   ├── capabilities/       hook `useCapabilities()`/`useFeature()` (đọc store qua React Query)
│   ├── session/            khôi phục phiên lúc khởi động
│   └── store/              zustand: auth · theme
│
├── core/                   HẠ TẦNG — KHÔNG biết gì về giao diện
│   ├── api/                axios + interceptor, làm mới token, module auth
│   ├── config/             env, query-client, zod tiếng Việt, hằng số auth
│   ├── capabilities/       service `GET /capabilities` (cờ phân hệ + giới hạn nghiệp vụ)
│   ├── socket/             client Socket.IO dùng chung + `useSocketEvent`
│   └── storage/            kho khoá OS (token) + AsyncStorage (dữ liệu thường + cache capabilities)
│
├── features/               NGHIỆP VỤ — auth · workspaces · activity · study · me · invite · demo
├── shared/                 DÙNG CHUNG, không phụ thuộc feature
│   ├── ui/                 BỘ COMPONENT — 27 thư mục, 25 nhóm nối vào barrel ui/index.ts
│   │   ├── feedback/       toast (hạ tầng, KHÔNG nằm trong barrel — xem chú thích ở đó)
│   │   └── icon/           <Icon /> + tên sinh tự động (ngoài barrel, nhập từ @/shared/ui/icon)
│   ├── theme/              token màu + chữ + hình học (SINH TỰ ĐỘNG) và hook đọc màu thô
│   ├── form/               useZodForm
│   ├── utils/              format · style · jwt · toast
│   └── constants/
└── styles/                 global.css + token, MỖI NHÓM MỘT THƯ MỤC
    ├── colors/             colors.json → colors.generated.js
    ├── typography/         typography.json → typography.generated.js
    └── layout/             layout.json → layout.generated.js
```

### ⛔ Vì sao vỏ ứng dụng tên là `src/shell` chứ không phải `src/app`

Bên web, `src/app/` là vỏ ứng dụng. Ở đây **không đặt tên đó được**, và đây là
một cái bẫy đã sập một lần trong lúc dựng base:

**Expo Router tự dò thư mục route, và nó ưu tiên `src/app` HƠN `app/` ở gốc.**
Nếu `src/app/` tồn tại, Expo Router lặng lẽ coi nó là cây route:

- toàn bộ `app/` ở gốc bị **bỏ qua**, không màn hình nào còn tồn tại;
- mỗi file trong đó thành một "route", kể cả `store/types.ts`;
- **build vẫn XANH**, không cảnh báo nào, app chỉ hiện một màn trống.

Dấu hiệu duy nhất là một dòng log rất dễ trôi qua:
`Using src/app as the root directory for Expo Router`.

`tests/project-structure.test.ts` chốt cứng: `src/app/` không được phép tồn tại.

| Web (`base-projects`)                | Mobile (ở đây)                  | Ghi chú                          |
| ------------------------------------ | ------------------------------- | -------------------------------- |
| `src/app/` (vỏ + router)             | `src/shell/` + `app/`           | tách đôi vì lý do trên           |
| `src/core/`                          | `src/core/`                     | giống hệt                        |
| `src/features/`                      | `src/features/`                 | giống hệt                        |
| `src/shared/`                        | `src/shared/`                   | giống hệt                        |
| `src/styles/theme/colors-theme.json` | `src/styles/colors/colors.json` | cùng nguồn, tách theo nhóm token |

---

## Những quyết định đáng biết trước khi sửa

### Token đăng nhập cất ở đâu — và vì sao KHÔNG phải AsyncStorage

Bên web, refresh token nằm trong cookie `HttpOnly`: JavaScript không bao giờ
nhìn thấy nó. Trên di động **không có cơ chế tương đương**. Nên:

| Thứ               | Chỗ để                              | Vì sao                                            |
| ----------------- | ----------------------------------- | ------------------------------------------------- |
| Access token      | Bộ nhớ (zustand, **không** persist) | Sống ngắn; tắt app là mất                         |
| **Refresh token** | **`expo-secure-store`**             | Keychain/Keystore — mã hoá bởi OS, ràng vào máy   |
| Hồ sơ người dùng  | `AsyncStorage`                      | Không nhạy cảm; cần đọc nhanh để vẽ khung màn đầu |

⛔ **AsyncStorage KHÔNG mã hoá.** Trên Android nó là một file SQLite thường
trong thư mục app — đọc được trên máy đã root (rất phổ biến ở công trường / máy
dùng chung) hoặc qua một bản sao lưu ADB. Refresh token lộ = chiếm phiên vô thời
hạn.

Sau khi mở lại app, access token được dựng lại bằng một lượt refresh
(`useSessionBootstrap`). Kẻ đọc được `AsyncStorage` không có gì để dùng.

### Làm mới token: BA kết quả, không phải boolean

`refreshSession()` trả về một trong ba, và **không được gộp lại**:

| Kết quả                                | Xử lý                                            |
| -------------------------------------- | ------------------------------------------------ |
| `ok`                                   | Chạy lại request gốc, xả hàng đợi                |
| `unauthenticated` (400/401/403)        | Máy chủ nói thẳng phiên đã chết → dọn sạch phiên |
| `unavailable` (mất sóng, 5xx, quá hạn) | **GIỮ NGUYÊN phiên** — kể cả refresh token       |

Gộp hai nhánh cuối là bug kinh điển, và trên di động nó nặng hơn web nhiều: một
cú chập sóng khi đi qua hầm gửi xe sẽ đăng xuất người dùng và xoá mất biểu mẫu
họ đang điền dở giữa công trường — trong khi phiên thật ra vẫn còn hiệu lực.

`tests/core/session.test.ts` chốt cả ba nhánh (16 test).

### Thang chữ: ngưỡng lineHeight ĐO TỪ FILE FONT

Tiếng Việt xếp dấu **chồng hai tầng** (`Ẳ` = A + dấu á + dấu hỏi). Khi
`lineHeight` quá sát `fontSize`, **Android cắt cụt phần dấu** — người dùng thấy
"A" thay vì "Ẳ". iOS thì cho tràn ra ngoài chứ không cắt, nên lỗi **chỉ hiện
trên Android** và rất dễ lọt qua khâu review làm trên máy Mac.

`scripts/lib/font-metrics.mjs` mở file `.ttf`, tra bảng `cmap` lấy mã glyph của
từng ký tự tiếng Việt rồi đọc hộp bao của chúng trong bảng `glyf`. Số đo thật
của Plus Jakarta Sans — font của design system BIDV (đo 2026-09-08):

| Nét      | Chỉ Latin | Latin + tiếng Việt |
| -------- | --------- | ------------------ |
| Regular  | 0.98em    | 1.409em            |
| Medium   | 0.98em    | 1.436em            |
| SemiBold | 0.98em    | 1.463em            |
| **Bold** | 0.98em    | **1.495em**        |

Cao nhất là `Ẳ`, thấp nhất là `Ạ`. **Tiếng Việt cần hơn 45% chiều cao so với
cùng font chạy Latin** — đó là lý do một thang chữ chép từ dự án tiếng Anh về
gần như luôn cắt dấu.

Hai bậc ngưỡng, `generate-typography.mjs` chặn cứng khi vi phạm:

- **1.50×** cho vai trò IN HOA (`overline`) — nhãn kiểu "ĐỊA CHỈ" có cả `Ẳ` lẫn
  `Ạ` trên cùng một dòng. (Con số này = nét Bold ở bảng trên, làm tròn lên.)
- **1.30×** cho chữ thường/hỗn hợp — trên chiều cao dòng tự nhiên của font
  (1.265×), và chữ thường có dấu thấp hơn hẳn bản in hoa.

Đổi font là ngưỡng tự đo lại, không có con số cũ nào kẹt lại.

### Design token sinh từ JSON, không viết tay

**Một thư mục cho một nhóm token.** Mỗi thư mục chứa đúng hai file cùng tên: bản
NGUỒN (`.json`, sửa tay) và bản SINH RA (`.generated.js`, cho `tailwind.config.js`).
Bản sinh cho TypeScript nằm ở `src/shared/theme/` vì code app đọc qua `@/shared/theme`.

```
src/styles/
├── colors/
│   ├── colors.json                ──generate:colors──────▶ colors.generated.js
│   └── colors.generated.js                                 + shared/theme/colors.generated.ts
├── typography/
│   ├── typography.json            ──generate:typography──▶ typography.generated.js
│   └── typography.generated.js                             + shared/theme/typography.generated.ts
└── layout/
    ├── layout.json                ──generate:layout─────▶ layout.generated.js
    └── layout.generated.js                                 + shared/theme/layout.generated.ts

assets/icons/**.svg                ──generate:icons──────▶ shared/ui/icon/icons.*.generated.ts
```

`npm run generate:styles` chạy cả ba nhóm token một lượt.

⛔ **Ba nhóm này KHÔNG được gộp lại một thư mục.** Chúng đổi vì những lý do khác
nhau và theo nhịp khác nhau:

| Nhóm         | Đổi khi nào                                | Ràng buộc riêng                         |
| ------------ | ------------------------------------------ | --------------------------------------- |
| `colors`     | đổi nhận diện thương hiệu, thêm trạng thái | phải có ĐỦ cặp light/dark               |
| `typography` | chỉnh thang chữ, đổi font                  | lineHeight bị kiểm theo số đo font thật |
| `layout`     | bản thiết kế chỉnh bo góc, giãn cách       | số đo hình học, giống nhau ở mọi theme  |

Gộp chung thì mỗi lần chỉnh một con số bo góc lại phải mở file có 147 mã màu, và
`git blame` trên file đó không còn nói lên điều gì.

Đổi màu hay cỡ chữ → sửa **file JSON** rồi chạy lại script.
⛔ Đừng sửa file `*.generated.*` — lần chạy sau ghi đè sạch.

Trong code:

```tsx
<View className="bg-bg-1 border-border-1">     {/* ✅ token */}
<Text className="text-body-lg text-fg-2">     {/* ✅ vai trò chữ */}

<View className="bg-white border-gray-200">   {/* ❌ */}
<Text className="text-[17px]">                {/* ❌ ESLint chặn */}
```

Prop nhận **màu thô** (`tabBarActiveTintColor`, `<ActivityIndicator color>`,
`fill`/`stroke` của SVG) thì dùng `useThemeColors()` — xem
`src/shared/theme/use-theme-colors.ts`.

⚠️ NativeWind 4 chạy trên **Tailwind 3.4**, không phải Tailwind 4 như web. Cú
pháp `@theme`, `oklch()` và các tiện ích chỉ có ở v4 KHÔNG dùng được.

### `cn()` cần `tailwind-merge`, dù nhiều người nói NativeWind không cần

NativeWind áp style theo **độ ưu tiên CSS**, KHÔNG theo thứ tự bạn viết trong
chuỗi className. Nên chỉ nối chuỗi thì:

```tsx
<Button className={cn(base, 'bg-ink-5')} /> // base có 'bg-primary-6'
```

class nào thắng phụ thuộc thứ tự Tailwind sinh ra chúng — tức là gần như ngẫu
nhiên với người viết. Prop `className` truyền từ ngoài vào lúc đè được lúc không.

Thêm nữa, thang chữ ở đây theo **vai trò** (`text-body-lg`) và thay thế thang mặc
định. `tailwind-merge` gặp một `text-*` lạ sẽ đoán đó là **màu chữ**, nên
`cn('text-header-md', 'text-fg-2')` làm **biến mất cỡ chữ**. `twMergeConfig` trong
`cn.ts` khai các vai trò vào nhóm `font-size` để chặn ca đó — và **phải truyền
cùng config đó vào mọi recipe `tv()`**, vì `tailwind-variants` tạo thực thể
`twMerge` riêng của nó. Xem bản mẫu ở `src/shared/ui/button/button.styles.ts`.

### Biến môi trường: phải viết ĐỦ TÊN ngay tại chỗ đọc

Metro không đọc biến môi trường lúc chạy — nó **thay chuỗi vào bundle lúc build**:

```ts
process.env.EXPO_PUBLIC_API_BASE_URL; // ✅ được thay bằng giá trị thật

const key = 'EXPO_PUBLIC_API_BASE_URL';
process.env[key]; // ⛔ luôn undefined, không lỗi, không cảnh báo
```

Đó là lý do `src/core/config/env.config.ts` có một khối `RAW` liệt kê từng biến
một thay vì một hàm `getStr(key)` gọn gàng như bên web (Vite đọc
`import.meta.env` lúc chạy nên bên đó viết hàm được).

⛔ Thêm biến mới = thêm **hai** dòng: một vào `RAW`, một vào `types/env.d.ts`.
⛔ Sửa `.env` xong phải `npm run start:clear` — Metro đã cache bundle có giá trị cũ.
⛔ Mọi biến `EXPO_PUBLIC_*` nằm trong APK. `unzip` là đọc được. Không đặt secret.

### Phân hệ và tab — registry có `featureFlag`, tên file route bắt buộc trùng `name`

Thêm phân hệ = 1 (hoặc vài) file route + 1 dòng registry:

```tsx
// 1. app/(app)/reports/index.tsx  (thư mục — vì sau này còn màn con)
export default function ReportsRoute() {
  return <ReportsScreen />;
}
```

```ts
// 2. src/shell/navigation/module-registry.ts
{
  id: 'report',                    // cũng là `resource` khi kiểm quyền
  name: 'reports',                 // PHẢI trùng TÊN THƯ MỤC/FILE ở bước 1
  href: '/reports',
  title: 'Báo cáo',
  icon: 'chart-1',                 // tên THẬT trong `assets/icons/system`
  permission: { resource: 'report', action: 'view' },  // bỏ trống = ai đăng nhập cũng vào được

  // Cờ phân hệ Ở BACKEND (`capabilities.features.<flag>.enabled`, `GET /capabilities`).
  // Tắt ⇒ ẩn khỏi tab (route vẫn vào được bằng link) — khác `permission`, đây là
  // "phân hệ đã bật cho CẢ hệ thống chưa", không phải "người này có quyền không".
  featureFlag: 'reporting',

  // Chấm/số trên tab. Hiện chỉ có `'unread'` — union thay vì boolean vì sau này
  // còn thêm loại huy hiệu khác.
  badge: 'unread',
}
```

Thanh tab, thứ tự tab, việc lọc quyền VÀ lọc cờ phân hệ tự đi theo
(`useAccessibleModules()`, `src/shell/navigation/use-accessible-modules.ts`).

⛔ `name` sai một ký tự thì tab hiện ra nhưng bấm vào không có gì — không lỗi nào báo.
⛔ Lọc quyền/cờ chỉ có **một** nơi: `useAccessibleModules()`. Chỗ nào tự lọc riêng
thì sớm muộn hai bộ luật lệch nhau. Và nó là lọc để **hiển thị**, không phải hàng
rào bảo mật — hàng rào thật nằm ở backend.
⛔ Phân hệ có NHIỀU màn (như `me/`: `index.tsx` + `settings.tsx`) PHẢI có
`_layout.tsx` riêng (một `<Stack>`) bên trong thư mục đó. Thiếu nó, Expo Router
"đẩy" (hoist) từng file lên thành các tab NGANG HÀNG ở `(app)/_layout.tsx` thay
vì gộp thành một tab có màn con — xem chú thích trong `app/(app)/me/_layout.tsx`.

### Socket và capabilities — hai lớp hạ tầng mới của Phase 0

- **`src/core/socket/`** — client Socket.IO DÙNG CHUNG (singleton, `autoConnect: false`).
  `connectSocket()`/`disconnectSocket()` do `AppProviders` gọi theo `status` của
  phiên; `bindAppState()` tự ngắt sau 5 phút ở nền, nối lại khi quay lại; tên sự
  kiện tập trung ở `socket.events.ts` (`SocketEvent.XXX`, khớp `config-be.md` §7);
  `useSocketEvent(event, handler)` để lắng nghe trong component.
- **`src/core/capabilities/`** (service `GET /capabilities`) + **`src/shell/capabilities/`**
  (`useCapabilities()`/`useFeature(flag)`, React Query, cache 5 phút + bản
  `AsyncStorage` để vẽ đúng tab khi mở app lúc mất mạng).

### Khai `PATHS` thì PHẢI có file route

Bẫy này đã sập một lần ở base web: `PATHS.PROFILE` được khai và menu điều hướng
tới, nhưng không route nào mount nó — bấm vào ra màn 404. `tsc` không thấy (chuỗi
vẫn hợp lệ), lint cũng không. `tests/project-structure.test.ts` đối chiếu hai
danh sách.

---

## Sáu lớp gác chất lượng

| Lớp             | Bắt gì                                                                 |
| --------------- | ---------------------------------------------------------------------- |
| `tsc --noEmit`  | Kiểu, kèm `noUncheckedIndexedAccess` (`arr[0]` là `T \| undefined`)    |
| ESLint          | Import vòng · dependency của hook · **luật riêng bên dưới**            |
| `check:imports` | Gói import mà chưa khai trong `package.json` · import chéo feature     |
| `knip`          | File không ai với tới · gói khai mà không ai dùng                      |
| Jest            | 419 test / 38 suite — phiên, token, so khớp tiếng Việt, cấu trúc route |
| Husky           | Chạy 3 lớp đầu trước mỗi commit + commitlint                           |

### Các luật ESLint riêng — mỗi luật chặn một bug đã xảy ra thật

1. **`<Modal>` thiếu `supportedOrientations`** — trên iOS, `<Modal>` dựng một
   view controller riêng; không khai thì nó rơi về portrait và **cả app hết
   xoay** chừng nào modal còn mở. Triệu chứng: mở bộ lọc, xoay ngang, không có
   gì xảy ra; đóng bộ lọc thì xoay lại được.

2. **`x.toLowerCase().includes(y)`** — không bỏ dấu. Gõ "met khoi" không ra
   "Mét khối", gõ "da nang" không ra "Đà Nẵng". Dùng `includesSearch` /
   `matchesSearch`.

3. **Ô tìm kiếm controlled** (`<TextInput value={search}>`) — state đi qua một
   nhịp bất đồng bộ sẽ ghi đè ô nhập giữa lúc bộ gõ đang ghép dấu. Trên Android
   - Telex là mất dấu hoặc nhảy con trỏ.

4. **Cỡ chữ số cứng** (`text-[17px]`, `leading-[20px]`) — đi vòng qua khâu kiểm
   lineHeight cho dấu tiếng Việt.

5. **Global chỉ có ở Node** (`Buffer`, `__dirname`, `global`, `setImmediate`)
   trong `app/` và `src/` — `tsconfig` nạp `@types/node` cho toàn dự án (test và
   script cần), mà TypeScript không phân vùng theo thư mục được. Không có luật
   này thì `Buffer.from(...)` trong một màn hình vẫn qua được `tsc` và chỉ nổ
   trên máy thật, sau khi đã phát hành.

6. **`<Screen footer={<View|Button …/>}>`** — `Screen` KHÔNG đệm vùng an toàn cho khe
   `footer`, nên nút/khối trần nằm đè lên vạch gạt ngang (hệ điều hành nuốt cú chạm).
   Dùng `BottomActionBar`. Ca đi qua biến/component riêng thì component đó phải tự bọc.

7. **`onRefresh` trần trên `FlatList`/`FlashList`/`SectionList`** — React Native dựng vòng
   quay MẶC ĐỊNH không theo token, ở chế độ tối gần như biến mất. Dùng
   `useListRefreshControl` (`@/shared/ui/screen`).

8. **Control có nhãn tích hợp mà không có nhãn** (`Toggle`, `Checkbox`, `Radio`, `Stepper`,
   `Select`, `DatePicker`, `Input`, `FormInput`, `FormSelect` thiếu cả `label` lẫn
   `accessibilityLabel`) — trình đọc màn hình chỉ xướng "công tắc, bật" mà không nói bật
   CÁI GÌ. `placeholder` không phải nhãn (biến mất khi gõ). Luật 6–8 chỉ áp cho mã nguồn,
   không áp cho file test (test của chính `Screen`/`Toggle` dựng chúng trần có chủ ý).

9. **`toLocaleString()` / `toLocaleDateString()` / `Intl.NumberFormat`** — Hermes cắt ICU nên
   cùng một số/ngày ra hai kiểu trên Android và iOS, không lỗi nào báo. Dùng `formatNumber`/
   `formatCurrency`/`formatFileSize`/`formatDate` (`@/shared/utils/format/*`).
   `Intl.DateTimeFormat` (đọc múi giờ của máy) không bị chặn.

10. **`<ActivityIndicator>` trần ngoài `src/shared/ui/**`** — nhận màu THÔ (không nhận `className`): không
    truyền `color` thì Android lấy màu nhấn của hệ điều hành, gần như biến mất trên nền tối; và không có
    nhãn nên trình đọc màn hình im lặng. Tải thêm ở chân danh sách dùng `<LoadingMore />`
    (`@/shared/ui/progress`), tải lần đầu dùng `Skeleton*`, trong nút dùng `Button loading`.
    Áp cho mã nguồn (không áp cho test); bộ component chung được dựng vòng quay.

⛔ Đừng tắt bằng `eslint-disable`. Cần ngoại lệ thì sửa rule kèm lý do trong PR.

---

## Khác gì so với `vci-sun-mobile`

Dự án đó là bản tham chiếu tốt cho nhiều thứ và base này học lại khá nhiều từ nó
(bẫy Metro trên Windows, thang chữ theo vai trò, luật `<Modal>`). Những chỗ base
này làm khác — kèm lý do:

| Chỗ                | `vci-sun-mobile`                                                            | Ở đây                                                                        |
| ------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Refresh token**  | AsyncStorage — **văn bản trần**                                             | `expo-secure-store` (Keychain/Keystore)                                      |
| Điều hướng         | React Navigation khai bằng code, `ParamList` tự đồng bộ tay                 | Expo Router — typed routes, deep link tự động                                |
| Biến môi trường    | `app.json` → `extra`, tiền tố `VITE_` (di sản của web)                      | `.env` + `EXPO_PUBLIC_*`, có kiểu                                            |
| Thư viện UI        | gluestack-ui v5 — kéo ~30 gói `@react-aria`/`@react-stately` (thư viện web) | NativeWind + `tv()`, code nằm trong repo                                     |
| `cn()`             | Chỉ nối chuỗi — "NativeWind tự xử lý xung đột"                              | `clsx` + `tailwind-merge` (xem mục trên)                                     |
| Ngưỡng lineHeight  | Con số 1.3 viết cứng trong tài liệu                                         | **Đo từ file font**, chặn cứng lúc sinh                                      |
| Prettier           | Không có; CLAUDE.md dặn "⛔ đừng chạy prettier"                             | Có, cấu hình sẵn, chạy trong pre-commit                                      |
| Test               | Không có                                                                    | Jest + RNTL, 419 test                                                        |
| Husky / commitlint | Không có                                                                    | Có                                                                           |
| Thang chữ          | 3 thang chồng nhau (`text-xs`, `d-*`, vai trò)                              | 1 thang duy nhất theo vai trò                                                |
| `borderRadius`     | Ép về 0 toàn app (yêu cầu riêng của dự án đó)                               | **GHI ĐÈ** thang Tailwind — `rounded-sm` = 16dp, `rounded-2xl` là class chết |

---

## Nợ kỹ thuật đã biết

Ghi ra để người sau khỏi tưởng là cố ý:

- **Bộ component chưa có bản bọc `react-native-webview`.** `docs/rules/webview.md`
  mô tả đủ quy định hiển thị cho màn webview, nhưng repo chưa cài gói đó (nó là
  native module: thêm vào là phải `prebuild` và dựng lại dev client). Dự án nào
  cần webview thật thì cài rồi dựng bản bọc theo tài liệu đó.

- **Style của NativeWind KHÔNG có trong test.** Biên dịch Tailwind là việc của
  Metro, mà Jest không chạy Metro — element render ra có `style` rỗng. ⛔ Đừng
  viết `expect(el).toHaveStyle({ padding: 16 })`, nó luôn đỏ và người viết sẽ
  tưởng component sai. Test **hành vi** thay vì hình thức; hệ token đã được kiểm
  riêng ở `tests/theme/tokens.test.ts`. (`nativewind/test` có `render` tự biên
  dịch Tailwind, nhưng bản phát hành chứa JSX chưa biên dịch nên Jest không nạp
  được — đã thử 2026-09-08.)

- **Bộ icon đã xong** — 303 tên xuất từ Figma, dùng qua `<Icon name="…" />`
  (`npm run generate:icons`). `@expo/vector-icons` đã được gỡ khỏi dự án.

- **Ba gói native cài sẵn nhưng chưa dùng**: `expo-image`, `@shopify/flash-list`,
  `react-native-svg` (đã khai trong `knip.json` để không bị báo thừa). Cố ý: cả
  ba gần như chắc chắn dùng tới ở đợt giao diện, và thêm gói native SAU thì phải
  `prebuild` + dựng lại bản dev-client. Gộp vào một lượt build ngay từ đầu.

- **`expo-crypto` cài sẵn từ Phase 0 nhưng chưa dùng** (`ignoreDependencies` ở
  `knip.json`) — dành cho `clientMessageId = uuid()` (`Idempotency-Key` khi tạo
  workspace/task/expense, `docs/plan/config-app.md` §6), bắt đầu dùng từ Phase 1.
  `@react-native-community/netinfo` cũng cài sẵn cùng đợt (mock Jest đã có ở
  `jest.setup.js`) cho banner mất mạng ở Phase 1.

- **Icon và màn hình chờ vẫn là ảnh mẫu của Expo.** Thay `assets/images/` trước
  khi phát hành.

- **NativeWind 5 (hỗ trợ Tailwind 4) vẫn là bản `preview`.** Bản `5.0.0-preview.4`
  ra 2026-05-15 và chưa có bản preview mới, trong khi nhánh 4.x vẫn ra bản vá
  (4.2.6 — 2026-06-22). Giữ 4.x cho tới khi v5 lên `latest`; nâng xong thì
  `tailwind-merge`/`tailwind-variants` mới thật sự khớp phiên bản Tailwind.

- **Chưa có E2E.** Chỉ có Jest. Thêm Maestro hoặc Detox khi có luồng thật để chạy.

- **`eas.json` có ba profile (`development`/`preview`/`production`) nhưng
  `EAS_PROJECT_ID` còn trống.** Cần tạo project dưới tổ chức EAS của VCI rồi
  điền vào `.env` trước khi `eas build`/OTA (`expo-updates`) có tác dụng.

---

## Ghi chú vận hành

- **Chạy với backend (Phase 0).** BE mặc định lắng nghe cổng `3000`
  (`be/.env`). Ba trường hợp, tương ứng `EXPO_PUBLIC_API_BASE_URL` trong `.env`:
  - Máy ảo Android (Android Studio) — `http://10.0.2.2:3000/api/v1` (mặc định
    của `.env.example`). **Máy ảo Android không hiểu `localhost`** — đó là
    chính máy ảo, `10.0.2.2` mới là địa chỉ loopback về máy dev.
  - Máy thật cùng Wi-Fi với máy dev — `http://<IP LAN của máy bạn>:3000/api/v1`
    (lấy IP bằng `ipconfig` trên Windows, mục "IPv4 Address").
  - Máy ảo iOS (Simulator) — `http://localhost:3000/api/v1` (chạy chung máy nên được).

  `EXPO_PUBLIC_SOCKET_URL` đi CÙNG host/cổng, không kèm `/api/v1` (mặc định tự
  suy từ `EXPO_PUBLIC_API_BASE_URL` nếu bỏ trống — xem `env.config.ts`).

- **Chia sẻ bản Android cho người khác:** `npm run distribute -- --notes "…"` build APK và đẩy lên Firebase
  App Distribution (đích khai ở `distribute.config.json`, bản build trỏ về backend Railway). Chi tiết, ánh xạ
  biến môi trường và xử lý lỗi: `docs/deploy-firebase-app-distribution.md`.
- **Sửa `.env` → `npm run start:clear`.** Reload thôi là chạy giá trị cũ.
- **Windows:** `metro.config.js` chặn `node_modules/*/android/build/` khỏi tầm
  Metro. Không phải để chạy nhanh hơn — để Metro **khỏi chết**. Không có
  watchman, `metro-file-map` dùng `FallbackWatcher` và nó `lstat` phải những tên
  thư mục Gradle sinh ra mà Windows không xử lý được (có cả ký tự `?` giữa đường
  dẫn). Trước khi chết hẳn, watcher đã hỏng nên sửa file không còn ăn — triệu
  chứng giống hệt "quên reload".

---

## Quy tắc code

`docs/rules/` — đọc trước khi sửa mảng tương ứng:

| Sắp sửa gì                 | Đọc                                      |
| -------------------------- | ---------------------------------------- |
| Bất kỳ JSX nào             | `styling-nativewind.md` · `mobile-ux.md` |
| Cấu trúc thư mục, đặt tên  | `feature-structure.md` · `code-style.md` |
| Gọi API                    | `api-patterns.md`                        |
| Route, guard, thanh tab    | `navigation.md`                          |
| Form, kiểm dữ liệu         | `form-validation.md`                     |
| Viết test                  | `testing.md`                             |
| Component dùng chung       | `ui-components.md`                       |
| Bố cục, tablet, xoay ngang | `responsive.md`                          |
| Màn hình webview           | `webview.md`                             |

`AGENTS.md` là bản rút gọn cho AI agent (`CLAUDE.md` trỏ tới đó).

---

## Đợt tiếp theo

Base này đã xong phần **nền, cấu hình chung, hệ token, bộ component và bộ icon**.
Việc còn lại, theo thứ tự đề nghị:

~~1. Bộ component giao diện~~ · ~~2. Bộ icon~~ · ~~3. Màn hình mẫu ghép sẵn~~ —
đã xong: 25 nhóm component trong `src/shared/ui/` (danh mục: barrel `index.ts` +
`tests/ui/`) và 303 icon sinh từ Figma. Trang `/demo` (thư viện component chạy
trong app) đã được gỡ ở p0-12.

Còn lại:

1. **Điền `EAS_PROJECT_ID`** rồi build thật lần đầu (`eas build --profile development`).
2. **Bản bọc webview** khi dự án đầu tiên cần tới (xem mục nợ kỹ thuật).
3. **Thay icon và màn hình chờ** bằng bộ nhận diện của dự án.

# super-app
