# Điều hướng — Expo Router

## Cây route

```
app/
├── _layout.tsx        gốc: providers + chặn vẽ tới khi biết trạng thái phiên
├── (auth)/            nhóm KHÁCH   — guard: đã đăng nhập thì đá về trang chủ
├── (app)/             nhóm ĐÃ VÀO  — guard + thanh tab đọc MODULE_REGISTRY
├── invite/ m/ c/ w/   link ngắn — chỉ chuyển tiếp sang màn thật trong (app)
└── +not-found.tsx
```

Dấu ngoặc đơn là **nhóm route**: gom file để dùng chung một layout, nhưng KHÔNG
xuất hiện trong đường dẫn. `app/(auth)/login.tsx` là `/login`, không phải
`/auth/login`. Nhờ vậy đổi cách nhóm về sau không làm gãy deep link đã phát hành.

## ⛔ KHÔNG được tạo `src/app/`

Expo Router ưu tiên `src/app` HƠN `app/` ở gốc. Tạo ra là toàn bộ `app/` bị bỏ
qua, build vẫn xanh, app hiện màn trống. Vỏ ứng dụng ở đây tên là `src/shell`
chính vì lý do đó. `tests/project-structure.test.ts` chốt cứng.

## File route giữ MỎNG

```tsx
import { LoginScreen } from '@/features/auth/screens/LoginScreen';

export default function LoginRoute() {
  return <LoginScreen />;
}
```

`app/` là **bản đồ đường dẫn** — đọc lướt là biết app có những màn nào. Nhét nội
dung vào thì bản đồ dài hàng nghìn dòng và mất tác dụng. Ngoài ra màn hình nằm
trong `features/` thì test được mà không cần dựng cả bộ điều hướng.

## Guard = `<Redirect>` trong layout của nhóm

```tsx
if (appConfig.authEnabled && status !== 'authenticated') {
  return <Redirect href={PATHS.LOGIN} />;
}
```

⛔ Guard chỉ được kết luận khi trạng thái phiên đã CHẮC CHẮN. `app/_layout.tsx`
không vẽ gì cho tới khi `isSessionReady` bật, nên tới được guard nghĩa là
`status` đã rời khỏi `restoring`. Bỏ lớp chặn đó thì người dùng thấy màn đăng
nhập chớp lên ở mỗi lần mở app — và họ đọc ra là "app hay tự đăng xuất".

## Điều hướng SAU khi đăng nhập/đăng xuất dùng `replace`

```ts
router.replace(PATHS.HOME); // ✅
router.push(PATHS.HOME); // ❌ nút Back trên Android quay lại màn đăng nhập
```

## Typed routes

`experiments.typedRoutes` bật sẵn: `router.push('/setting')` (thiếu chữ `s`) là
lỗi TypeScript chứ không phải màn hình trắng lúc chạy. Kiểu sinh vào `.expo/types`
ở lần `npx expo start` đầu tiên (editor dùng bản này).

⚠️ Cổng `npm run typecheck` KHÔNG đọc `.expo/types`: trên Windows, Metro đang chạy ghi rác `/../src/**` vào đó
làm union `href` phình ⇒ `TS2590` giả. Cổng dựng bảng route riêng từ `app/app/` (`scripts/typed-routes.mjs` →
`.typecheck/`, tự chạy trong `typecheck`) — thêm/đổi tên/xoá file route chỉ cần chạy lại `npm run typecheck`.

Vẫn giữ bảng `PATHS` (`src/shell/config/constants.ts`) để **đổi đường dẫn ở một
chỗ** — typed routes bắt lỗi gõ sai, nhưng không giúp đổi tên.

## Thanh tab

Đọc `MODULE_REGISTRY`. Thêm phân hệ = 1 file route + 1 dòng registry (xem README).

**4 phân hệ chính + Trang chủ ở giữa (D-29).** `placement: 'bar'` (tối đa 4) hiện trên thanh tab; `AppTabBar` chia đôi chúng quanh
nút **Trang chủ** (`HOME_MODULE`, route `index`). `placement: 'menu'` = phân hệ phụ, không có tab — hiện ở lưới "Phân hệ" của Trang
chủ và trong `ModulePickerSheet` (giữ nút Trang chủ, hoặc "Tất cả" ở Trang chủ). Phân hệ mới mặc định là `menu`.

⛔ Phân hệ `menu` có thư mục route cấp `(app)/` (`study`, `meetings`) vẫn được khai `<Tabs.Screen>` với `href: null` — vòng lặp trong
`(app)/_layout.tsx` làm việc đó cho mọi mục có `name`. Phân hệ `menu` không `name` (`href` trỏ vào màn con) không cần khai gì.

⛔ Phân hệ bị chặn quyền vẫn phải khai `<Tabs.Screen>` với `href: null`. Expo
Router tự tạo tab cho MỌI file trong thư mục; không khai tường minh thì tab vẫn
hiện, với nhãn là tên file và không có biểu tượng.

⚠️ Thanh tab VẼ bằng `BottomNav` của bộ component dùng chung, nối qua
`src/shell/navigation/AppTabBar.tsx` (`<Tabs tabBar={…}>`). ⛔ Đừng quay lại
thanh mặc định của React Navigation: nó không đi qua NativeWind nên màu, font và
vùng an toàn phải khai lại bằng style nội tuyến — và đó chính là chỗ luôn bị
quên khi đổi token.

⚠️ `Tabs` nhập từ `expo-router/js-tabs`, KHÔNG phải từ `expo-router`: ở SDK 57
lối nhập cũ đã deprecated (tên `Tabs` nhường cho bộ tab NATIVE).

## Nút Back giữa các tab

Hai tầng, đừng nhầm: **trong một tab** là ngăn xếp (`Stack`) của tab đó; **giữa các tab** là lịch sử của `Tabs`.

⛔ `<Tabs backBehavior="history">` (`app/(app)/_layout.tsx`), KHÔNG để mặc định `firstRoute`. Mặc định luôn nhảy về
Trang chủ: đi Trang chủ → Nhóm → Tin nhắn rồi Back là về Trang chủ, bỏ qua Nhóm. `history` về tab vừa xem trước đó
(Tin nhắn → Back → Nhóm → Back → Trang chủ → Back → thoát app). Đã đo bằng chính `TabRouter` của expo-router.

⚠️ `history` có một chỗ tụt: mở NGUỘI vào tab khác Trang chủ (bấm thông báo, mở link) thì lịch sử chỉ có đúng tab đó, Back
không đi đâu cả (nút "Quay lại" bấm không phản hồi, Android thoát app). `seedHomeInTabHistory`
(`src/shell/navigation/tab-history.ts`, gắn qua `UNSTABLE_router`) đặt Trang chủ vào đáy lịch sử đúng một lần lúc dựng lại
trạng thái. Đừng bỏ nó khi nâng SDK mà không đo lại ca "mở nguội vào Tin nhắn → Back → Trang chủ".

⛔ Đổi tab bằng `navigation.navigate({ merge: true, name, params: undefined })` (xem `AppTabBar`), ⛔ KHÔNG truyền lại
`params: route.params`. `TabRouter` dựng object tham số MỚI, navigator con của tab coi `params.screen` (của lần mở bằng
`router.push` từ tab khác) là chưa xử lý và điều hướng lại tới màn đó — màn trùng bị chồng vào ngăn xếp mỗi lần bấm tab.

`router.canGoBack()` phản ánh cả lịch sử tab: ở tab khác Trang chủ nó là `true` khi còn tab để lùi. Đừng dùng nó như
"ngăn xếp của màn này còn màn nào" — hãy dùng `canDismiss()` cho câu hỏi đó.

⚠️ Còn một hành vi của expo-router cần nhớ khi thêm lối tắt sang tab khác: `router.push('/messages')` tới một tab ĐÃ có
ngăn xếp sâu (`[index, hội thoại]`) thì đẩy thêm một `index` lên trên (`[index, hội thoại, index]`), Back sẽ đi qua màn
cũ. Đổi tab thuần tuý (không mở màn con) nên đi qua thanh tab / `navigation.navigate`, không `push`.

## Deep link

`scheme` khai trong `.env` (`APP_SCHEME`). Màn hình nhận tham số qua
`useLocalSearchParams()`.

⛔ Luôn có đường **nhập tay** song song với deep link. Ví dụ ở
`ResetPasswordScreen`: người dùng đọc e-mail trên máy tính, hoặc ứng dụng mail
mở liên kết trong trình duyệt nội bộ của nó — deep link không tới được app, và ô
nhập mã là đường duy nhất còn lại.
