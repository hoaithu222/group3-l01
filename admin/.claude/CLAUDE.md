# super-app/admin — Claude Code Memory

Trang quản trị Super App, dẫn xuất từ base-projects (React 19 + TypeScript). Đọc `AGENTS.md` cùng thư mục cho cấu hình riêng của Super App và hợp đồng API với `../be`. Design system riêng ("**kit2**", thư mục
`src/shared/ui/`) đã hoàn chỉnh — đừng dựng lại, hãy **đọc và tái sử dụng**.

## Tech stack

| Layer | Lựa chọn |
|---|---|
| Framework | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS v4 (CSS-first `@theme`, KHÔNG có `tailwind.config.js`) |
| Component variant | `tailwind-variants` (`tv()`) |
| UI primitives | Radix UI (Dialog · Select · Popover · Tabs · Switch · RadioGroup · Avatar · Toast · ContextMenu · DropdownMenu) |
| Form | react-hook-form + zod v4 |
| Server state | TanStack Query v5 |
| Client state | Zustand v5 |
| Routing | React Router v7 |
| Chart | Recharts v3 (qua `@/shared/charts`) |
| Drag & drop | dnd-kit |
| Ngày giờ | dayjs |

## Luật vàng — KHÔNG THƯƠNG LƯỢNG

**`@/shared/ui` ("kit2") là nguồn DUY NHẤT cho mọi UI.** Trước khi viết bất kỳ
`.tsx` nào: đọc `docs/rules/reuse-first.md` (bảng "HTML → Kit2") và
`docs/rules/kit2-architecture.md` (decision tree đặt file + 3R).

```
1. REUSE   → Đã có component kit2? DÙNG LẠI.
2. EXTEND  → Gần giống nhưng thiếu prop/variant? Thêm key vào tv() recipe.
3. CREATE  → CHỈ tạo mới khi không trùng concept với bất kỳ component nào.
```

Cấm tuyệt đối: raw `<button>/<input>/<select>/<table>`, inline `<svg>`, hex màu
trong `className`/`style` (`#fff`, `text-[#333]`), raw Tailwind font
(`text-sm font-medium`), `clsx()`/`twMerge()` trực tiếp (dùng `cn()`), tự viết
`useToggle`/`useModal` (dùng `useDisclosure`).

> Luật cấm hex chỉ áp cho **màu giao diện** (style của UI). Có 3 ngoại lệ hợp
> lệ — hex là DỮ LIỆU người dùng chọn (`ColorPalettePanel`/`ColorPickerField`),
> canvas 2D (`ctx.fillStyle` không nhận Tailwind class), và scrim cố ý không
> lật theo theme — xem `docs/rules/color-system.md` §"Ngoại lệ" trước khi
> báo vi phạm nhầm 1 trong 3 case này.

## Mandatory pre-code checklist

1. Cần UI gì? → tra `docs/rules/reuse-first.md` §1 Decision Table + §3 Catalog
2. Không có sẵn → `docs/rules/kit2-architecture.md` §3 Decision Tree quyết
   định đặt file ở đâu, áp dụng 3R
3. Màu → CHỈ token từ `colors-theme.json` (`docs/rules/color-system.md`)
4. Chữ → CHỈ `text-{scale}-{weight}` (`docs/rules/font-system.md`)
5. Icon → CHỈ `<SystemIcon name="..." />` (`docs/rules/icon-conventions.md`)
6. className → CHỈ qua `cn()` (`docs/rules/tailwind-conventions.md`)
7. Code xong → `npm run check` phải sạch (typecheck = `npm run typecheck` = `tsc -b --noEmit`; ⛔ `npx tsc --noEmit` kiểm 0 file vì `tsconfig.json` là solution-style)

## Ví dụ chuẩn (đọc trước khi build feature mới)

- `src/features/user/` — phân hệ nghiệp vụ đầy đủ đầu tiên (Phase 0): bảng +
  tìm IME-safe + lọc + phân trang URL-synced (`pages/UserListPage.tsx`),
  drawer chi tiết nhiều tab + hành động có xác nhận lý do
  (`components/UserDetailDrawer.tsx`), React Query (`service/`), Zod
  (`schemas/`) — bố cục ghép từ mẫu `ComposedDemoPage` gốc (đã xoá khỏi base
  sau khi `user` thay được vai trò minh hoạ, xem `docs/rules/feature-structure.md`).
- `src/features/auth/` — kiến trúc feature chuẩn: `pages/ schemas/ service/
  hooks/`, form dùng `useZodForm` + zod schema + `Form`/`FormItem`/field kit2.

## Rules index (`docs/rules/*.md`)

| File | Khi nào đọc |
|---|---|
| **`kit2-architecture.md`** | CRITICAL — trước khi tạo/sửa bất kỳ component nào trong `shared/ui` |
| **`reuse-first.md`** | CRITICAL — trước khi viết JSX mới, tra "cần X → dùng component nào" |
| **`color-system.md`** | Mọi khi cần dùng màu |
| **`font-system.md`** | Mọi khi cần dùng typography |
| **`tailwind-conventions.md`** | Merge className, thứ tự class, quy ước spacing |
| **`icon-conventions.md`** | Dùng icon (`SystemIcon`, outline vs bold) |
| **`widget-composition.md`** | Sửa/tạo widget trong `shared/widgets` — token qua `*.theme.ts` |
| **`text-contrast.md`** | Màu chữ (`text-fg-*`) — cấp bậc tương phản |
| **`visual-hierarchy.md`** | Bố cục, mật độ, spacing, border, số liệu |
| **`interaction-ux.md`** | Inline-edit vs modal, auto-focus, keyboard shortcut chuẩn |
| **`navigable-controls.md`** | Điều hướng phải là `<Link>` khi có URL đích, không `<button onClick={navigate}>` |
| **`keyboard-navigation.md`** | Arrow-key navigation giữa các ô nhập |
| **`ime-safe-input.md`** | Ô tìm kiếm/nhập tự do — bắt buộc `useImeSafeSearchInput` |
| **`search-matching.md`** | So khớp text — bắt buộc `normalizeSearch`/`matchesSearch`, không tự `.toLowerCase().includes()` |
| **`form-validation.md`** | Zod schema — luôn `.trim().min(1)`, KHÔNG `.min(1)` một mình |
| **`feature-structure.md`** | Cấu trúc thư mục 1 feature mới |
| **`api-patterns.md`** | React Query, URL-synced filter (`useQueryParams`) |
| **`code-style.md`** | Naming convention, import order |
| **`clean-code-standards.md`** | 1 file = 1 component, giới hạn số dòng |
| **`code-optimization.md`** | memo/useMemo/useCallback khi nào dùng |
| **`chart-conventions.md`** | Quy ước Recharts (density tier, `tabular-nums`, gradient fill) |
| **`development-rules.md`** | Nguyên tắc chung: YAGNI/KISS/DRY, naming file, không tạo file `-v2` |
| **`test-viewpoint.md`** | Checklist bảo mật/non-functional trước khi ship (XSS, token, upload guard, enumeration-safe message) |
| **`ipad-responsive.md`** | `touch:`/`standalone:` variant, `dvh`, safe-area |
| **`tv-display-mode.md`** | Chế độ hiển thị TV/kiosk (nếu dùng) |
| **`routing-conventions.md`** | Thêm/sửa phân hệ (route) mới — module registry |
| **`state-management.md`** | Zustand slice mới, khi nào Zustand vs TanStack Query vs URL state |
| **`documentation-management.md`** | Khi nào viết rule mới, giữ rule không lệch khỏi code thật |

> `docs/rules/` là nguồn thật — file này chỉ là index, KHÔNG lặp lại nội dung.
> Sửa rule → sửa trong `docs/rules/*.md`, không sửa ở đây.

## Skills (`.claude/skills/*/SKILL.md`)

| Skill | Dùng khi |
|---|---|
| `kit2-component-picker` | Cần biết "tình huống này dùng component nào" |
| `ui-styling` | Style 1 component, đổi theme, chọn token/variant |
| `frontend-development` | Viết component/page/hook mới (cấu trúc, lazy-load, data fetching) |
| `react-best-practices` | Nghi ngờ hiệu năng chậm, tối ưu re-render/bundle |
| `frontend-design` | Dựng UI mới từ đầu, tránh thẩm mỹ rập khuôn "AI slop" |
| `web-testing` | Viết/sửa test Vitest + Testing Library |
| `debug` | Có bug/hành vi lạ, cần tìm root cause |
| `fix` | Có 1 lỗi cụ thể cần sửa (type/lint/bug/CI) |
| `git` | Commit/push/tạo PR |
| `new-feature` | Dựng 1 phân hệ/feature mới từ đầu (folder + route registry) |
| `docs` | Cập nhật `docs/rules/*.md` sau khi code đổi, hoặc viết rule mới |
| `brainstorm` | Cần cân nhắc trade-off trước 1 quyết định kiến trúc khó đảo ngược |
| `problem-solving` | Bế tắc, đã thử vài cách không tiến triển (khác `debug` — không phải 1 bug cụ thể) |

## Design tokens — pipeline

| Đổi gì | Sửa file | Chạy lại |
|---|---|---|
| Màu sắc | `src/styles/theme/colors-theme.json` | `npm run generate:colors` |
| Typography | `src/styles/font/font.json` | `npm run generate:font` |
| Icon SVG | `src/assets/icons/*.svg` | `npm run generate:icons` |
| Ảnh hệ thống | `src/assets/image/*` | `npm run generate:images` |

**KHÔNG BAO GIỜ** sửa tay file generated (`generated-colors.css`,
`generated-font.css`, `shared/ui/icons/index.ts`, `colors.generated.ts`).

## Cấu trúc thư mục

```
src/
  app/       # shell: router, providers, store (zustand slices), config
             #   capabilities/ hook useCapabilities()/useFeature() (chạm store)
  core/      # api client, http, config nền tảng
             #   socket/         Socket.IO client + useSocketEvent (thuần, không đụng store)
             #   capabilities/   service GET /capabilities (thuần)
  features/  # 1 thư mục / 1 domain — xem feature-structure.md
  shared/
    ui/        # kit2 — design system, xem reuse-first.md
    widgets/   # ghép sẵn từ kit2 (Dock, Header, ProgressCenter...)
    charts/    # hạ tầng chart dùng chung (density, palette, tokens)
    hooks/     # dom/ input/ state/ table/
    utils/     # browser/ format/ style/ validation/
    theme/     # re-export token đã generate
  styles/      # font.json, colors-theme.json + CSS generated
```

## Trước khi commit

`npm run check` phải sạch (typecheck → lint → kiểm import → kiểm vòng → orphans → test). Không hex màu, không `any`, không component fork
(`XxxV2.tsx`), không raw HTML control thay kit2.

---

> **Ghi chú kỹ thuật:** `.claude/settings.json` khai `rules_dir`/`agents_dir`
> theo đúng convention của `vci-sun-pms-fe` (dự án gốc sinh ra base này) —
> chưa xác minh được đây có phải key chính thức, có hiệu lực của Claude Code
> hay không (không tìm thấy schema cục bộ để đối chiếu). Nếu Claude Code
> không đọc 2 key này, `agents/*.md` vẫn được auto-discover theo convention
> mặc định; `docs/rules/*.md` vẫn luôn được đọc trực tiếp qua index ở trên,
> không phụ thuộc `rules_dir` có hoạt động hay không.
