# Super App Admin

Trang quản trị web của Super App, dẫn xuất từ `D:\work\base-projects` (React 19 +
TypeScript + Vite 8 + Tailwind 4). Backend đối ứng ở `../be` (Express, API tại
`/api/v1`), ứng dụng di động ở `../app`, đặc tả sản phẩm ở `../docs/notes.md`
và `../docs/modules/`, kế hoạch triển khai ở `../docs/development-plan.md`.

Hướng dẫn cho AI agent: `AGENTS.md` (Codex) và `.claude/CLAUDE.md` (Claude).

## Khác gì so với base

| Mục | Base | Ở đây |
| --- | --- | --- |
| `package.json` name | `react-base` | `super-app-admin` |
| `APP_NAME` (`src/app/config/constants.ts`) | `Base App` | `Super App Admin` |
| `VITE_API_BASE_URL` | trống | `/api/v1` — BE mount nghiệp vụ tại `/api/v1/*` |
| Proxy dev `/api` | `localhost:5000` | `localhost:3000` (`be/.env` PORT) |
| `VITE_AUTH_ENABLED` | `false` | `true` — dự án thật |
| `.gitignore` | chỉ `.env.local` | thêm `.env` (đồng bộ với `../be`) |
| `index.html`, `manifest.webmanifest` | Base App | Super App Admin |

Phân hệ mẫu `demo` (`/demo`, `/demo/ghep`) của base **đã xoá** — không còn route, `src/features/demo/`
hay `tests/demo-page.test.tsx`. Tra component ở `docs/rules/reuse-first.md`; mẫu feature đầy đủ ở
`src/features/user/`, `workspace/`, `moderation/`, `system-config/`.

## Phân hệ hiện có

Nguồn duy nhất: `src/app/router/modules/module-registry.ts` (id phân hệ cũng là `resource` khi kiểm quyền
`{id}:view`). Trạng thái đối chiếu với mã ngày 2026-09-21.

| Phân hệ | Route | Cờ | Nội dung |
| --- | --- | --- | --- |
| `user` | `/user`, `/user/:id` | — | Danh sách + drawer (hồ sơ, phiên, đăng nhập sinh trắc học, khoá/đổi vai/ẩn danh) |
| `workspace` | `/workspace`, `/workspace/:id?tab=` | `communication` | Tab: tổng quan · thành viên (+ khách, lời mời, yêu cầu chờ duyệt) · kênh · nhóm chat · báo cáo · ví (`wallet`) · tài liệu · dự án (`project`) |
| `moderation` | `/moderation`, `/moderation/:id` | `communication` | Hàng đợi báo cáo realtime + chi tiết (tin nhắn, người dùng, kênh, nhóm chat, **bộ học**), luồng D-06 |
| `audit-log` | `/audit-log` | — | Nhật ký quản trị (lọc, cursor, drawer) |
| `system-config` | `/system-config?tab=` | — | Tab: giới hạn · tính năng · lưu trữ · thông báo · **media** · job nền · dự án (`project`) |
| Trang chủ | `/` | — | KPI tổng quan (`GET /admin/overview`) |
| `gamification`, `ai-job`, `integration`, `skill`, `recruiter`, `recruiter-portal`, `o2o`, `partner` | — | theo phân hệ | **Khung giữ chỗ** (`PlaceholderPage`) — chưa có BE tương ứng |

Kiểu dữ liệu response hiện **viết tay** theo BE thật (chưa có `openapi.json` sinh kiểu — p0-09); mỗi file
`types/*.ts` ghi rõ route BE nó khớp. Kiểm thử: **Vitest + Testing Library + MSW** (chưa có Playwright/E2E).

## Hợp đồng API với `../be`

Auth **đã khớp** (đối chiếu 2026-09-21): BE có `POST /auth/refresh` (kèm alias `/auth/refresh-token`),
`GET /auth/me` (kèm alias `/auth/profile`) và `AuthUserDto` trả `role`, `roles[]`, `permissions[]`
(`be/src/modules/auth/dtos/auth-user.dto.ts`). Bảng chi tiết và các điều cấm nằm ở `AGENTS.md`. BE là nguồn hợp
đồng: khi lệch, sửa/hỏi ở BE, không chữa bằng adapter trong `src/core/api`. Muốn xem giao diện khi chưa có BE thì
tạm `VITE_AUTH_ENABLED=false`.

## Chạy

```bash
cd admin
npm ci                    # dùng package-lock.json có sẵn
cp .env.example .env      # đã trỏ /api/v1 và proxy localhost:3000
npm run dev               # http://localhost:5173 — BE chạy song song: cd ../be && npm run dev
npm run check             # typecheck → lint → kiểm import → kiểm vòng → orphans → test
```

Lưu ý husky: `prepare` chạy `husky` trong `admin/` sẽ báo `.git can't be found`
(thư mục `.git` ở gốc repo) và thoát 0 — hook pre-commit KHÔNG được gắn, giống
`../app`. Tới khi có hook cấp repo (xem kế hoạch Phase 0), chạy `npm run check`
thủ công trước khi commit.

---

# Tài liệu base gốc

## React Base

Khung dự án React 19 + TypeScript + Vite 8 + Tailwind 4, tách ra từ một hệ PMS
đã chạy thật (1000+ PR). Giữ phần nền đã được kiểm chứng, bỏ toàn bộ nghiệp vụ.

**Trong hộp:** design system 60+ component · hệ form 21 field · design token sinh
từ JSON · auth JWT có refresh chống bão · module registry · 26 hook · 22 util ·
bộ quy tắc code 28 file.

**Không có (ở base gốc):** màn hình nghiệp vụ nào — base khởi đầu với 7 trang khung: đăng nhập, đăng ký, quên
mật khẩu, đặt lại mật khẩu, trang chủ, hồ sơ cá nhân và cài đặt. Super App Admin đã dựng các phân hệ thật trên khung
đó (xem "Phân hệ hiện có" ở trên); thư viện giao diện `/demo` của base đã bị xoá.

⚠️ **Kiểm đăng nhập MẶC ĐỊNH TẮT** (`VITE_AUTH_ENABLED`) để `npm run dev` lần đầu
vào thẳng được mọi trang khi chưa có backend. **Dự án thật phải đặt `true`.**
Chi tiết ở mục "Xác thực bật/tắt bằng một cờ" bên dưới.

---

## Bắt đầu

```bash
git init                  # ⛔ TRƯỚC npm install — xem ghi chú bên dưới
npm install
cp .env.example .env      # sửa VITE_API_BASE_URL trỏ về BE của bạn
npm run dev               # http://localhost:5173 (cổng mặc định của Vite)
```

> ⛔ **`git init` phải chạy TRƯỚC `npm install`.** Hook `prepare` cài husky, mà
> husky cần thư mục `.git`. Không có nó thì husky in `.git can't be found` rồi
> **thoát 0** — cài đặt vẫn "thành công", nhưng pre-commit không được gắn và mọi
> guard (typecheck, lint, kiểm import) im lặng không chạy. Lỡ rồi thì
> `git init && npm run prepare`.

| Lệnh | Việc |
|------|------|
| `npm run dev` | Máy chủ phát triển |
| `npm run build` | Sinh token → typecheck → build |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run lint` / `lint:fix` | ESLint |
| `npm test` | Vitest |
| `npm run check` | Chạy hết: typecheck → lint → kiểm import → kiểm vòng → test |
| `npm run check:imports` | Gói được import nhưng chưa khai trong `package.json` |
| `npm run check:cycles` | Import vòng (madge — nay nằm trong devDependencies nên chạy được offline) |
| `npm run check:orphans` | File không ai với tới + gói khai trong `package.json` mà không code nào import (knip) |
| `npm run check:dead` | Như trên, kèm cả export chưa ai dùng — BÁO CÁO, không chặn |
| `npm run generate:styles` | Sinh lại CSS màu + chữ (tự chạy khi build) |
| `npm run generate:icons` | Sinh lại registry icon — **chạy tay** sau khi thêm SVG |
| `npm run generate:images` | Sinh lại registry ảnh — **chạy tay** |

> ⚠️ `generate:icons` và `generate:images` **không** nằm trong `build`. Thêm file
> vào `src/assets/` mà quên chạy thì component mới không tồn tại lúc biên dịch.

---

## Cấu trúc

```
src/
├── app/                    Vỏ ứng dụng — biết về ứng dụng CỤ THỂ này
│   ├── config/             APP_NAME, PATHS, cờ tính năng
│   ├── pages/              Trang chung: chủ, hồ sơ, cài đặt, 403, 404, giữ chỗ
│   ├── providers/          QueryClient → Theme → Display
│   ├── router/             Bảng route, guard, layout, module registry, phân quyền
│   ├── shell/              Nối widget thuần với store (AppHeader, AppDock)
│   └── store/              Zustand: auth · theme · display
│
├── core/                   Hạ tầng — KHÔNG biết gì về giao diện
│   ├── api/                axios + interceptor, refresh phiên, module auth
│   └── config/             env, query-client, zod locale, hằng số auth
│
├── features/               Nghiệp vụ. Base chỉ có `auth/`
│
├── shared/                 Dùng chung, KHÔNG phụ thuộc feature
│   ├── ui/                 Kit2 — design system (xem bên dưới)
│   ├── widgets/            Header · Dock · command-palette (⌘K) · upload-center (rail tiến trình) · charts
│   ├── hooks/              state · dom · input · table
│   ├── utils/              format (kèm date) · style · browser · validation
│   ├── charts/             Quy ước Recharts: mật độ, token, style
│   ├── theme/              colors.generated.ts (SINH TỰ ĐỘNG)
│   ├── constants/          Hằng số dùng chung
│   └── types/
│
├── styles/                 globals.css + nguồn token (JSON) + CSS sinh ra
└── assets/                 377 icon SVG + ảnh, kèm registry sinh tự động
```

### Kit2 — `src/shared/ui`

Chia theo **chức năng**, không theo bậc trừu tượng. Lý do: khi cần một
component, người ta nhớ *nó làm gì*, chứ không nhớ nó là "atomic" hay
"composite".

| Nhóm | Chứa gì |
|------|---------|
| `primitives/` | Text · Heading · Badge · Avatar · Divider |
| `feedback/` | Spinner · Skeleton · Callout · Progress · ProgressCircle · LiquidGauge · EmptyState |
| `actions/` | Button · Menu · ContextMenu · SegmentToggle · ThemeToggle |
| `inputs/` | Input · Textarea · NumberInput · Checkbox · Radio · Toggle · ColorPalettePanel |
| `selects/` | Dropdown · MultiSelect · DropdownTreeSelect |
| `pickers/` | DatePicker · Range · DateTime · MonthYear · MonthRangeFilter · TimePicker |
| `overlays/` | Popover · Tooltip · Modal · ConfirmDialog · FormModal · Drawer · Toast |
| `navigation/` | Tabs · Stepper · Pagination · ScrollEdgeNav |
| `data-display/` | Table (kéo-thả, cột đóng băng, đổi bề rộng) · Tree · AnimatedNumber · ScrollBoard · RankingBoard · CapsuleChart |
| `surfaces/` | BoxPanel · BoxInfo · HudFrame · HudInfoBox · SummaryCard · CompactKpiCard · SummaryPill · CardScreenshort · Splitter |
| `media/` | Image · ImagePreview · ImageLightbox · Upload · image-annotator |
| `layout/` | PageShell · PageBody · Toolbar · BoxGrid · AppShell · SectionHeader · TitleScreen (showcase kit2, KHÔNG còn là tiêu đề trang) · DetailPanelHeader |
| `form/` | RHF + Zod: 21 field · 6 layout · 3 pattern · 7 hook |
| `icons/` | `<SystemIcon name="..." />` — registry 377 icon, SINH TỰ ĐỘNG |

**Luôn import qua barrel gốc**, đừng import sâu:

```tsx
import { Button, TextField, useZodForm } from '@/shared/ui';   // ✅
import Button from '@/shared/ui/actions/Button';                // ❌ vỡ khi refactor
```

---

## Những quyết định đáng biết trước khi sửa

### Bố cục trang: một công thức, một nguồn lề

Mọi trang nội dung dựng bằng ba hộp trong `layout/` cộng `<PageHeader>`
(`@/shared/widgets/header`), **không gõ tay class**:

```tsx
<PageShell>                     {/* vỏ — KHÔNG đệm, layout ngoài đã cấp lề */}
  <PageHeader title="…" tone="…" />  {/* portal lên thanh header, không chiếm hàng */}
  <Toolbar left={…} right={…} />  {/* cụm trái nở, cụm phải ghim */}
  <PageBody overflow="hidden">    {/* chiếm phần còn lại; đây mới là chỗ cuộn */}
    <BoxPanel>…</BoxPanel>
  </PageBody>
</PageShell>
```

⛔ **Tiêu đề trang nằm trên thanh header**, không còn là dải `<TitleScreen>` đầu
nội dung: `<PageHeader>` đưa tiêu đề (`<h1>` thật) · tab module (≤ 4, qua
`useQueryTabNav`) · nút quay lại · action lên header. Quy ước đầy đủ (trang chi
tiết, nhánh tải/lỗi/rỗng, test với `HeaderSlotsHarness`): `docs/rules/reuse-first.md` §3.4.

⛔ **Trang KHÔNG được tự thêm đệm.** Lề 8px bốn phía (`SHELL_GUTTER_X` + `SHELL_GUTTER_Y`,
bằng khe `gap-2` giữa các panel — theo `vci-sun-pms-fe`) cấp một lần ở `BackgroundLayout`,
và thanh header đọc cùng `SHELL_GUTTER_X` — ba lớp nằm trên một lưới. Dock ghim cố định
thì `<main>` chừa thêm đệm đáy (`DOCK_CONTENT_CLEARANCE_CLASS`) để Dock không che hàng
cuối của bảng / dòng phân trang. Trước khi có `PageShell`,
bốn trang tự thêm `p-2` lên nền `p-4` cũ của `<main>`, đo được:

```
/          nội dung bắt đầu ở x=24     ← lệch
/settings  nội dung bắt đầu ở x=24     ← lệch
(trang khác) nội dung bắt đầu ở x=16
```

Đi giữa hai trang là toàn bộ nội dung nhảy 8px. Nay mọi trang đều bắt đầu ở cùng một
mép (x=8 kể từ 2026-09-29, khi lề ngang về 8px).

⛔ `min-h-0` trong `PageShell`/`PageBody` **không phải** để cho đẹp: flex item
mặc định có `min-height: auto` nên không chịu co nhỏ hơn nội dung. Thiếu nó thì
`flex-1` nở bằng chiều cao nội dung, `overflow-y-auto` không có gì để cuộn, và
bảng **đẩy cả trang dài ra** thay vì cuộn trong khung.

Ba lưới, đừng lẫn: `BoxGrid` (thẻ/panel — khai bề ngang một ô) · `FormGrid`
(field — khai số cột, mỗi cột trần 448px).

### Nhóm "sống & tự chạy" — và luật giảm chuyển động

Base có một nhóm component TỰ LÀM MỘT VIỆC theo thời gian, học từ họ giao diện
bảng điều khiển lớn của Trung Quốc (DataV / BigDataView): `AnimatedNumber`
(số đếm lên), `ScrollBoard` (bảng tự cuộn), `RankingBoard`, `CapsuleChart`,
`LiquidGauge`. Ba thẻ KPI sẵn có — `SummaryCard`, `CompactKpiCard`,
`SummaryPill` — nay cũng **đếm số theo mặc định**.

Lý do chúng tồn tại: trên một màn hình có 20 con số, số nhảy phịch thì mắt
không bắt được cái nào vừa đổi. Chuyển động là thứ thị giác ngoại vi nhạy nhất.

⛔ **Luật không được phá:** mọi hiệu ứng TỰ CHẠY phải hỏi `usePrefersReducedMotion()`
và **nhảy thẳng tới trạng thái cuối**, chứ không phải chạy nhanh hơn. Với người
bị rối loạn tiền đình, chuyển động không mong muốn gây chóng mặt thật. Điều này
đã được `tests/shared/smart-live.test.tsx` chốt lại.

Tắt từng chỗ bằng `animate={false}` (thẻ KPI) hoặc `disabled` /
`disableAnimation` (nhóm còn lại). Nên tắt khi số nằm trong **bảng dài** — 200
con số cùng chạy là nhiễu, không ai theo dõi được 200 thứ một lúc.

### Design token sinh từ JSON, không viết tay

```
src/styles/theme/colors-theme.json  ──generate:colors──▶  generated-colors.css
                                                          colors.generated.ts
src/styles/font/font.json           ──generate:font────▶  generated-font.css
src/assets/icons/*.svg              ──generate:icons───▶  icons/index.ts
```

Đổi màu hay cỡ chữ → sửa **file JSON** rồi chạy lại script. ⛔ Đừng sửa file
`*.generated.*` — lần chạy sau ghi đè sạch.

Có 327 token màu × 2 theme (sáng/tối) và 14 thang chữ × 4 độ đậm. Trong code:

```tsx
<div className="bg-bg-1 text-fg-2 border-border-1">   {/* ✅ token */}
<p className="text-body-14-medium">                    {/* ✅ thang chữ */}

<div className="bg-white text-gray-500">               {/* ❌ */}
<p className="text-sm font-medium">                    {/* ❌ */}
```

### Access token KHÔNG nằm trong localStorage

`auth.store.ts` cố ý loại `token` khỏi `partialize`. Token sống trong bộ nhớ;
refresh token nằm ở cookie HttpOnly do BE đặt, JS không đọc được. Sau F5, phiên
được dựng lại bằng một lượt gọi `refresh` (`useSessionBootstrap`).

Đổi lại cho "tiện" là mở cửa cho XSS lấy trọn phiên.

Interceptor 401 (`core/api/client.ts`) phân biệt **ba** kết quả — đừng gộp lại:

| Kết quả | Xử lý |
|---------|-------|
| `ok` | Chạy lại request gốc, xả hàng đợi |
| `unauthenticated` | Xoá phiên, về `/login` |
| `unavailable` (mạng chập, BE 5xx) | **GIỮ NGUYÊN phiên** — không đá người dùng ra |

### Thêm phân hệ = 1 file + 1 dòng

```ts
// src/app/router/modules/user.routes.tsx
export const userModule: ModuleConfig = {
  id: 'user',                    // cũng là `resource` khi kiểm quyền
  path: '/user',
  title: 'Người dùng',
  iconName: 'user-outline',
  page: { lazy: () => import('@/features/user/pages/UserPage') },
};

// src/app/router/modules/module-registry.ts
export const MODULE_REGISTRY: ModuleConfig[] = [userModule];
```

Route, Dock, breadcrumb, tiêu đề tab và `PermissionGuard` tự đi theo.

Quyền là chuỗi phẳng `"resource:action"` trong `user.permissions`. Vai trò
`admin` vượt mọi kiểm tra chi tiết.

### Command Palette (⌘K) — điểm nối toàn cục thứ hai vào Module Registry

`Ctrl/Cmd + K` ở BẤT KỲ trang nào mở hộp thoại tìm nhanh (`@/shared/widgets/command-palette`),
liệt kê Trang chủ/Hồ sơ/Cài đặt + mọi phân hệ trong `MODULE_REGISTRY` (đã lọc
quyền, dùng CHUNG `useAccessibleModules` với `AppDock` — hai nơi này KHÔNG bao
giờ được tự lọc riêng, xem lý do ở `AppDock.tsx`) + hành động đổi sáng/tối.

Widget bản thân GENERIC — giống `Header` — không đọc `MODULE_REGISTRY` hay
store nào; tầng nối là `AppCommandPalette.tsx` (`src/app/shell/`), mount một
lần ở `BackgroundLayout.tsx`. Mở/đóng qua store colocated
(`command-palette-store.ts`), cùng khuôn với `overlays/toast-store.ts` — nút mở
(trong Header) và hộp thoại (mount ở gốc layout) là hai cây component riêng,
không bắc cầu được bằng props.

Thêm phân hệ mới theo đúng công thức 1-file-1-dòng ở trên → palette tự có mục
mới, KHÔNG phải sửa gì trong `command-palette/`.

### Khai `PATHS` thì PHẢI mount route

Đã sập bẫy này một lần: `PATHS.PROFILE` và `PATHS.SETTINGS` được khai và được
menu người dùng trên Header điều hướng tới, nhưng không route nào mount chúng —
bấm "Hồ sơ cá nhân" rơi thẳng vào catch-all `*` và ra trang 404. `tsc` không
thấy (path là chuỗi hợp lệ), lint cũng không.

`tests/app-routes.test.tsx` giờ đối chiếu hai danh sách: mọi giá trị trong
`PATHS` phải khớp một route trong `routes`. Thêm path mà quên route là test đỏ
ngay.
### Bốn rule ESLint chặn cứng lỗi tiếng Việt

`eslint.config.js` có 4 selector `no-restricted-syntax` bắt hai lỗi đã gây bug thật:

1. **Ô tìm kiếm controlled** (`<Input value={search}>`) cắt ngang composition của
   bộ gõ → gõ Telex mất dấu. Dùng `useImeSafeSearchInput`.
2. **`x.toLowerCase().includes(y)`** không bỏ dấu → gõ "met khoi" không ra
   "Mét khối". Dùng `includesSearch` / `matchesSearch`.

⛔ Đừng tắt bằng `eslint-disable`. Cần ngoại lệ thì sửa rule kèm lý do trong PR.


### TypeScript 7 CHƯA dùng được (đã thử, đã hoàn nguyên)

Base ghim `typescript ~5.9.3` một cách CÓ CHỦ Ý. Đã thử nâng 7.0.2 ngày
2026-08-31 và hoàn nguyên vì hai lý do đo được:

1. **`typescript-eslint@8` sập hoàn toàn** — khai peer `typescript >=4.8.4
   <6.1.0`; nâng lên là `npx eslint` ném lỗi ngay lúc nạp module, không lint
   được một dòng nào. Mất sạch 4 rule chặn lỗi tiếng Việt.
2. **TS 7 bỏ hẳn `baseUrl`** (`error TS5102`) — phải sửa `tsconfig.app.json`.

Chỉ nâng khi `typescript-eslint` phát hành bản khai hỗ trợ TS 7. Nâng xong nhớ
gỡ `baseUrl` khỏi `tsconfig.app.json`.

`vite@8` và `eslint@10` thì ĐÃ nâng và chạy tốt. Vite 8 dùng Rolldown nên build
nhanh khoảng 10 lần (2.4s → 0.3s); tổng bundle không đổi đáng kể, chỉ chia chunk
khác đi (Rolldown gộp `radix`/`tree` vào chunk `kit2`).
### `tsc -b`, không phải `tsc --noEmit`

`tsconfig.json` là kiểu solution (`files: []` + `references`), nên
`npx tsc --noEmit` kiểm **đúng 0 file và luôn pass giả**. Ở dự án gốc lỗi này
từng giấu 13 lỗi type qua hàng chục lượt commit. Husky vì thế gọi
`npm run typecheck` (`tsc -b --noEmit`).

---

### Xác thực bật/tắt bằng một cờ

```bash
VITE_AUTH_ENABLED=false   # mặc định — mọi route mở, không cần backend
VITE_AUTH_ENABLED=true    # BẮT BUỘC cho môi trường thật
```

Cờ tắt thì `AuthGuard` cho qua, `GuestGuard` không đá người đã đăng nhập ra khỏi
trang login, và `useSessionBootstrap` KHÔNG gọi `refresh` — base xuất xưởng chưa có
backend nào, gọi lúc đó chỉ tạo một request đỏ ở MỌI lần tải trang, làm người
mới tưởng base hỏng.

Toàn bộ mã xác thực vẫn nguyên vẹn: store, interceptor 401 ba nhánh, 4 trang
khách, `useLogin`/`useLogout`. Bật lại là chạy, không phải dựng lại gì.
`tests/app-boot.test.tsx` kiểm CẢ HAI chế độ nên không chế độ nào âm thầm hỏng.

---

## Quy tắc code

28 file trong `docs/rules/`. Đọc trước khi sửa mảng tương ứng:

| Sắp sửa gì | Đọc |
|-----------|-----|
| Bất kỳ JSX nào | `reuse-first.md` · `kit2-architecture.md` |
| Màu · chữ · icon | `color-system.md` · `font-system.md` · `icon-conventions.md` |
| Bố cục, mật độ, padding | `visual-hierarchy.md` |
| Gọi API, lọc trên URL | `api-patterns.md` |
| Form, kiểm dữ liệu | `form-validation.md` |
| Ô tìm kiếm | `ime-safe-input.md` · `search-matching.md` |
| Chart | `chart-conventions.md` |
| Máy tính bảng / PWA | `ipad-responsive.md` |
| Màn hình lớn / TV | `tv-display-mode.md` |

---

## Nợ kỹ thuật đã biết

Ghi ra để người sau khỏi tưởng là cố ý:

- **`shared/utils/toast.utils.ts` gánh hai việc nên nằm chơ vơ ngoài 4 nhóm.**
  `showToast()` là API mệnh lệnh của component Toast (chỉ cần `toast-store`),
  nhưng cùng file còn có `showToastByCode()` bắc cầu từ mã lỗi BE sang thông
  báo — thứ phụ thuộc `core/api/error.handler`. Muốn dọn thì **tách đôi**;
  ⛔ đừng dời cả cụm vào `shared/ui`, làm vậy là bắt design system phụ thuộc
  ngược vào tầng gọi API.
- ~~`shared/charts/` chưa có component nào dùng.~~ **Đã xong** — chart thật của dashboard, workspace
  (thống kê, dự án) và system-config (lưu trữ, thông báo) đều dựng trên `shared/charts`, nên `recharts` không còn
  bị báo là gói thừa và `chart-conventions.md` có bản mẫu chạy được để đối chiếu.
- **`public/icons/` chưa có icon PWA.** `manifest.webmanifest` có mảng `icons`
  rỗng. Thiếu thì "Thêm vào Màn hình chính" trên iOS lấy ảnh chụp màn hình làm
  biểu tượng. Xem `docs/rules/ipad-responsive.md §9`.
- **Chưa có Playwright.** Chỉ có Vitest. Thêm E2E khi có luồng thật để chạy.
# base-project
