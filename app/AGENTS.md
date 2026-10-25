# Hướng dẫn cho AI agent — Base Android (React Native)

Đọc `README.md` trước. File này chỉ nêu những gì hay bị làm sai.

## Phạm vi trong Super App

File này áp dụng cho `super-app/app/`; đường dẫn bên dưới tính từ thư mục
này. Đọc thêm `../GEMINI.md` hoặc `../AGENTS.md` cho quy tắc toàn repo. Cây route `app/` được
nhắc dưới đây là `super-app/app/app/`, không phải package mobile bên ngoài.

Antigravity (Gemini) đọc `GEMINI.md` hoặc file này; Codex đọc trực tiếp file này;
Claude dùng `CLAUDE.md` với `@AGENTS.md`. Các skill dùng chung vẫn ở `.claude/skills/`:
Agent phải mở `.claude/skills/base-rules/SKILL.md` rồi skill liên quan trong bảng bên dưới,
không giả định chúng đã được đăng ký tự động. `.claude/settings.json` là
cấu hình riêng cho Claude.

## Trước khi sửa

1. Đọc quy tắc tương ứng trong `docs/rules/`:

| Sắp sửa gì                    | Đọc                                                           |
| ----------------------------- | ------------------------------------------------------------- |
| Bất kỳ JSX nào                | `ui-components.md` · `styling-nativewind.md` · `mobile-ux.md` |
| **Dùng** component có sẵn     | `ui-components.md`                                            |
| Lưới màn, định dạng tiền/ngày | `screen-layout.md`                                            |
| Bố cục, tablet, xoay ngang    | `responsive.md`                                               |
| Cấu trúc thư mục, đặt tên     | `feature-structure.md` · `code-style.md`                      |
| Gọi API                       | `api-patterns.md`                                             |
| Route, guard, thanh tab       | `navigation.md`                                               |
| Form                          | `form-validation.md`                                          |
| Viết test                     | `testing.md`                                                  |
| Màn hình webview              | `webview.md`                                                  |

2. Ưu tiên **sửa file có sẵn**, đừng tạo file mới nếu không cần.
3. Sau khi sửa mã/cấu hình: `npm run check` phải sạch (typecheck → lint →
   kiểm import → **kiểm class** → kiểm contrast → kiểm touch targets →
   kiểm file size → test), theo `package.json`. Với thay đổi chỉ Markdown,
   kiểm tra đường dẫn, nội dung rules và `git diff --check` theo `../AGENTS.md`.
   ⛔ Đừng bỏ `check:classes` — nó là thứ DUY NHẤT bắt
   được class Tailwind đã chết (`text-body`, `rounded-2xl`): NativeWind bỏ qua
   class lạ trong im lặng, `tsc` và ESLint đều không thấy.
   ⚠️ `npm run typecheck` KHÔNG đọc `.expo/types` mà tự dựng bảng route riêng (`scripts/typed-routes.mjs` →
   `.typecheck/`, `tsconfig.typecheck.json`): trên Windows, Metro đang chạy ghi rác `/../src/**` vào
   `.expo/types/router.d.ts` ⇒ `TS2590` GIẢ ở `DeepLinkRedirect.tsx`/`intent-handlers.ts`. Gặp TS2590 ở chỗ dùng
   `Href` thì chạy `npm run typecheck` (đừng ép kiểu); `tsc --noEmit` trần vẫn đọc `.expo/types`.
   ⚠️ Nếu `npm run typecheck` (bảng route sạch) VẪN đỏ TS2590 thì lỗi là THẬT, không phải giả: union `Href` phình theo số route
   (đã chạm ở ~180 route, 2026-09-27) và biểu thức `a ?? b`/`cond ? a : b` tạo `Href` vượt giới hạn TypeScript ⇒ viết `if/else`
   (đã làm ở `DeepLinkRedirect.tsx`, `intent-handlers.ts`). Đừng coi TS2590 là "lỗi đã biết" rồi bỏ qua.
4. Thêm/dùng gói native (webview, skia, mapbox, location, orientation, Yjs, FCM…) ⇒ đọc `docs/native-libraries.md`
   (phiên bản, plugin, mock Jest, bước phải làm tay, cái CỐ Ý chưa bật). Sau khi thêm gói native phải BUILD LẠI dev client.

## Tech stack

| Tầng           | Công nghệ                                                             |
| -------------- | --------------------------------------------------------------------- |
| Nền            | React Native 0.86 · Expo SDK 57 · TypeScript strict                   |
| Điều hướng     | **Expo Router** (file-based, typed routes)                            |
| Style          | **NativeWind 4** (Tailwind **3.4**) + `tailwind-variants`             |
| Dữ liệu server | TanStack React Query 5                                                |
| State client   | Zustand 5                                                             |
| HTTP           | Axios (`@/core/api`)                                                  |
| Form           | React Hook Form + Zod 4                                               |
| Icon           | Bộ icon BIDV xuất từ Figma — `<Icon name="…" />` (`@/shared/ui/icon`) |
| Test           | Jest (`jest-expo`) + `@testing-library/react-native`                  |

## ⛔ Bảy điều KHÔNG được làm

1. **KHÔNG tạo `src/app/`.** Expo Router ưu tiên nó hơn `app/` ở gốc → toàn bộ
   cây route bị bỏ qua, build vẫn xanh, app hiện màn trống. Vỏ ứng dụng ở
   `src/shell/`. Có test chặn.

2. **KHÔNG sửa file `*.generated.*`.** Sửa file JSON nguồn trong
   `src/styles/` rồi `npm run generate:styles`. Icon thì sửa file `.svg`
   trong `assets/icons/` rồi `npm run generate:icons`.

3. **KHÔNG viết màu/cỡ chữ thô.** `bg-white`, `text-[17px]`,
   `style={{ color: '#fff' }}` đều sai. Dùng token. ESLint chặn một phần, phần
   còn lại người review phải bắt.

4. **KHÔNG đọc biến môi trường động.** `process.env[key]` luôn ra `undefined` —
   Metro thay chuỗi lúc build. Viết đủ tên tại chỗ đọc; thêm biến mới thì thêm
   một dòng vào `RAW` (`env.config.ts`) và một dòng vào `types/env.d.ts`.

5. **KHÔNG để refresh token ra ngoài kho khoá.** `expo-secure-store`, không phải
   `AsyncStorage`.

6. **KHÔNG gộp `unavailable` với `unauthenticated`** khi làm mới token. Mất sóng
   ≠ phiên chết. Xem `src/core/api/session.ts`.

7. **KHÔNG `expect(el).toHaveStyle(...)`** trong test — NativeWind không biên
   dịch trong Jest, `style` luôn rỗng. Test hành vi.

## Quen tay từ base web (`base-projects`) — khác chỗ nào

| Bên web                             | Ở đây                                                    |
| ----------------------------------- | -------------------------------------------------------- |
| `src/app/` = vỏ ứng dụng            | `src/shell/` (xem điều 1)                                |
| Tailwind 4, `@theme`, `oklch()`     | Tailwind **3.4** — không có                              |
| `import.meta.env.VITE_*`            | `process.env.EXPO_PUBLIC_*`, viết đủ tên                 |
| `localStorage` (đồng bộ)            | `AsyncStorage` (bất đồng bộ) + kho khoá OS               |
| Cookie `HttpOnly` cho refresh token | Kho khoá hệ điều hành                                    |
| `window.location.assign('/login')`  | Dọn store, guard tự điều hướng                           |
| Vitest                              | Jest (`jest-expo`)                                       |
| `<div>`, `<span>`                   | `<View>`, `<Text>` — **mọi chữ PHẢI nằm trong `<Text>`** |

## Skill — đọc skill trước, tài liệu sau

`.claude/skills/` có sẵn bảy skill. **`base-rules` là skill mặc định, đọc TRƯỚC
mọi việc**; sáu skill còn lại tuỳ loại việc:

| Việc                                              | Skill            |
| ------------------------------------------------- | ---------------- |
| Bất cứ việc gì (luật chung, quy trình, cổng kiểm) | `base-rules`     |
| Dựng/sửa component, sửa `className`, node Figma   | `ui-component`   |
| Bố cục co giãn, máy tính bảng, xoay ngang         | `responsive-ui`  |
| Đổi màu, thang chữ, bo góc, giãn cách, font       | `design-tokens`  |
| Thêm màn hình, feature, route, tab, guard         | `feature-screen` |
| Gọi API, React Query, 401/refresh                 | `api-data`       |
| Form + Zod, và viết test                          | `form-and-test`  |

## Trạng thái hiện tại

Nền, cấu hình chung, **hệ token** và **bộ component giao diện** đã dựng, lấy
design system **BIDV SmartBanking v2.0** làm **THAM CHIẾU** — đây là base dùng
lại, không phải app của một ngân hàng cụ thể. Cơ chế thì giữ, dữ liệu (tên
token, số đo, bộ icon) thì dự án mới thay theo bản vẽ của chính nó.

- Token: mỗi nhóm MỘT thư mục trong `src/styles/` — `colors/` · `typography/` ·
  `layout/`, mỗi thư mục có `<nhóm>.json` (sửa tay) và `<nhóm>.generated.js`
  (sinh ra). Sửa xong chạy `npm run generate:styles`.
  ⚠️ Thang chữ có **15 vai trò** và chỉ MỘT bộ tên. Tên cũ (`text-body`,
  `text-label`, `text-caption`, `text-title`, `text-heading`, `text-subheading`,
  `text-body-sm`) **đã bị gỡ** — chúng trùng số đo với vai trò chuẩn, để song
  song thì mỗi người viết một kiểu cho cùng một cỡ chữ.
- Icon: `assets/icons/{system,feature,bank}/**.svg` (xuất từ Figma) →
  `npm run generate:icons` → dùng qua `<Icon name="…" />`.
- Component: `src/shared/ui/` — đọc `src/shared/ui/AGENTS.md` TRƯỚC khi thêm
  hay sửa bất kỳ component nào ở đó.
- Thanh tab dưới của app dùng chính `BottomNav` của bộ chung, nối qua
  `src/shell/navigation/AppTabBar.tsx`.
- **Danh mục component**: barrel `src/shared/ui/index.ts`, JSDoc của từng component
  và `tests/ui/*` (ví dụ dùng thật). Trang `/demo` (thư viện component chạy trong
  app) đã được **gỡ** ở p0-12 (2026-09-26) — không còn `app/demo/`, `src/features/demo/`.

### Phân hệ và tab

Thanh tab dưới = **4 phân hệ chính + nút Trang chủ ở giữa** (D-29, `docs/plans/00-foundation/04-decisions.md`).
`src/shell/navigation/module-registry.ts` (`MODULE_REGISTRY`) là nguồn DUY NHẤT cho thanh tab **và** danh sách
chọn phân hệ. Mỗi mục có:

- `placement` — `'bar'` (phân hệ chính, hiện trên thanh tab, **tối đa `BAR_MODULE_LIMIT` = 4**, có test chặn) hoặc
  `'menu'` (phân hệ phụ: không có tab, mở từ danh sách chọn phân hệ). Phân hệ mới mặc định là `menu`; đưa lên thanh
  tab phải đẩy một phân hệ chính xuống `menu` — quyết định sản phẩm.
- `name` — ⛔ PHẢI trùng ĐÚNG tên file/thư mục route trong `app/(app)/`. Sai một ký tự thì `<Tabs.Screen name="…">`
  không khớp route nào: tab hiện ra (Expo Router tự sinh) nhưng bấm vào không có gì, không lỗi nào báo. Bắt buộc với
  `bar`; với `menu` chỉ khai khi phân hệ có thư mục route cấp `(app)/` (`study`, `meetings`), bỏ trống khi `href` trỏ vào
  màn con của phân hệ khác (`/messages/calls`). `tests/shell/module-registry.test.ts` đối chiếu `name`/`href` với cây route.
- `permission?` — quyền NGƯỜI DÙNG cần có (lọc theo `user`, `useAccessibleModules`).
- `featureFlag?` — cờ PHÂN HỆ ở backend (`capabilities.features.<flag>.enabled`,
  `GET /capabilities` qua `useCapabilities()`/`useFeature()`). Tắt ⇒ ẩn khỏi tab và danh sách chọn phân hệ nhưng route
  vẫn vào được bằng link. Khác `permission`: đây là "phân hệ đã bật cho CẢ hệ thống chưa", không phải "người này có quyền không".
- `badge?` — `'unread'` hiện chấm/số trên tab (nguồn dữ liệu tới ở Phase 1).
- `description?` — dòng phụ trong danh sách chọn phân hệ (`menu`).

**Trang chủ** là route `app/(app)/index.tsx` (`features/home`, `PATHS.HOME` = `/`), khai ở `HOME_MODULE` — KHÔNG thuộc
`MODULE_REGISTRY`. `AppTabBar` tự chia đôi các phân hệ chính quanh nó (`BottomNav` mục `featured`); **giữ** nút Trang chủ
hoặc chạm "Tất cả" ở Trang chủ mở `ModulePickerSheet` (liệt kê TẤT CẢ phân hệ qua `useAccessibleModules()` — chính lẫn phụ — kèm nút
GHIM; `useModulePickerStore`). Trang chủ hiện mọi phân hệ dạng bento: ô đã ghim (tối đa `MAX_PINNED_MODULES` = 2, nhấn giữ hoặc nút trong
sheet) lên hàng hero, còn lại vào lưới; ghim/lượt mở lưu theo NGƯỜI DÙNG (`shell/navigation/module-pins.store.ts`, dọn khi đăng xuất). Khối
thống kê ở cuối Trang chủ do các feature đăng ký qua khe `@/shared/home-widgets` (`registerHomeWidget`, import side-effect ở
`shell/home-widgets/register-stats-widgets.ts`) — `features/home` không import feature khác. Lọc quyền/cờ chỉ ở
`useAccessibleModules` / `useTabModules` / `useMenuModules` — đừng tự lọc ở nơi khác.

Phân hệ có NHIỀU màn (vd `me/`: `index.tsx` + `settings.tsx`) PHẢI có
`_layout.tsx` riêng (`<Stack screenOptions={STACK_SCREEN_OPTIONS} />`, hằng số ở
`@/shell/navigation/stack-screen-options` = ẩn header + trượt ngang; đừng chép
lại `{ headerShown: false }` trần) trong
đúng thư mục đó — thiếu nó, Expo Router "đẩy" (hoist) từng file thành các tab
NGANG HÀNG ở `(app)/_layout.tsx` thay vì gộp lại thành MỘT tab có màn con.

### Socket và capabilities

- **`src/core/socket/`** — client Socket.IO dùng CHUNG (singleton,
  `autoConnect: false`); vòng đời (`connectSocket`/`disconnectSocket`/`bindAppState`)
  do `AppProviders` điều khiển theo trạng thái phiên. Tên sự kiện tập trung ở
  `socket.events.ts` (`SocketEvent.XXX`); nghe trong component qua
  `useSocketEvent(event, handler)`.
- **`src/core/capabilities/`** (service gọi `GET /capabilities`) +
  **`src/shell/capabilities/`** (`useCapabilities()`/`useFeature(flag)` — React
  Query, cache 5 phút + bản `AsyncStorage` để vẽ đúng tab khi mất mạng lúc mở app).

⛔ **Cần một control mới thì tìm trong `src/shared/ui/` trước** (barrel `index.ts`
và `tests/ui/`). Viết cục bộ trong feature chỉ khi bộ chung thật sự không có, và
phải ghi rõ vì sao.

⛔ **`@expo/vector-icons` đã bị gỡ khỏi dự án.** Nét của Ionicons lệch hẳn với
bản thiết kế, và hai bộ icon song song thì thanh tab là chỗ lộ ra rõ nhất.
