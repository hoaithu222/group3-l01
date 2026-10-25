# Tailwind CSS Conventions

## Quy tắc chung

1. **Tailwind-first**: KHÔNG viết CSS thuần trừ khi bất khả kháng
2. **Dùng `cn()`**: Cho conditional classes, KHÔNG dùng template literals
3. **Responsive**: Thang 6 bậc bề rộng `sm: md: lg: xl: 2xl: wide:` (nguồn chuẩn:
   `src/shared/widgets/header/header.theme.ts`) + 3 biến thể khai ở `globals.css`:
   `touch:` (máy chạm) · `standalone:` (PWA toàn màn) · `tv:` (chế độ TV)
4. **Dark mode**: Đã xử lý qua CSS variables — KHÔNG cần `dark:` prefix

## Border Radius — Mặc định VUÔNG GÓC ⛔

**KHÔNG tự ý thêm `rounded-*`** vào container, card, panel, input, table, modal.
Chỉ áp dụng khi **được chỉ định rõ ràng** trong design spec hoặc component recipe.

```tsx
// ❌ SAI — tự thêm rounded vào card/container
<div className="border border-border-1 bg-bg-1 rounded-xl p-4">

// ✅ ĐÚNG — vuông góc theo mặc định
<div className="border border-border-1 bg-bg-1 p-4">

// ✅ OK — được chỉ định rõ trong design (avatar, badge dot, pill)
<div className="rounded-full" />       // avatar / dot
<Badge className="rounded-full" />     // pill badge (nếu design yêu cầu)
```

**Ngoại lệ chấp nhận (phải có lý do):**

| Trường hợp | Class | Lý do |
|-----------|-------|-------|
| Avatar / user icon | `rounded-full` | Hình tròn theo thiết kế |
| Status dot / badge dot | `rounded-full` | Hình tròn |
| Chip / tag có pill shape | `rounded-full` | Design pill shape |
| Tooltip / popover (kit2 tự quản lý) | *(kit2 xử lý nội bộ)* | Không can thiệp |

## Class Order

1. Layout: `flex`, `grid`, `block`, `hidden`
2. Positioning: `relative`, `absolute`, `fixed`, `sticky`
3. Box Model: `w-`, `h-`, `m-`, `p-`, `gap-`
4. Typography: `text-`, `font-`, `leading-`
5. Visual: `bg-`, `border-`, `rounded-`, `shadow-`
6. Interactive: `hover:`, `focus:`, `active:`
7. Transitions: `transition-`, `duration-`

## cn() cho conditional classes

```tsx
import { cn } from '@/shared/utils/style/cn';

<div className={cn(
  "flex items-center gap-4 p-4",
  "bg-bg-1 border border-border-1",
  isActive && "bg-primary-1 border-primary-5",
  className
)} />
```

## Spacing

- Dùng Tailwind scale: `p-1` (4px), `p-2` (8px), `p-4` (16px)
- **TRÁNH** arbitrary values: `p-[13px]`
- Dùng `gap-` cho layout spacing

## Inline Style — CHỈ cho

- Dynamic values JS: `style={{ height: \`calc(100vh - ${h}px)\` }}`
- CSS variables: `style={{ '--custom-var': value }}`
- KHÔNG dùng inline style cho colors, spacing, typography → dùng Tailwind

## Typography tokens (text-h*, text-body-*, text-caption-*) — BẮT BUỘC

Các class typography (`text-h3`, `text-body-16`, `text-caption-12-medium`…) được
sinh từ `src/styles/font/font.json` qua `scripts/generate-font.mjs`. Chúng có
shape `text-{scale}` — **trùng hình dạng với class màu** (`text-neutral-0`).

**Cạm bẫy:** `tailwind-merge` (trong `cn()`) mặc định coi mọi `text-*` lạ là
text-COLOR. Nếu không xử lý, `cn("text-h3", "text-neutral-0")` sẽ rút gọn còn
mỗi `text-neutral-0` → **âm thầm mất font-size** → mọi `Heading`/`Text` render
cùng một cỡ chữ. (Đây là bug đã từng xảy ra.)

**Cơ chế đã chống sẵn:** `src/shared/utils/style/cn.ts` đọc danh sách token trực tiếp
từ `font.json` và đăng ký chúng vào nhóm `font-size` của tailwind-merge. Nên:

1. **Định nghĩa typography CHỈ ở `font.json`.** Thêm/sửa scale → chạy
   `npm run generate:font` (hoặc `npm run generate:styles`). CSS được sinh lại
   và `cn.ts` tự nhận token mới — **không cần** sửa `cn.ts` hay nơi nào khác.
2. **KHÔNG hard-code class `text-...` font-size** ngoài `font.json`, và **KHÔNG
   tự viết regex token** ở chỗ khác — `font.json` là single source of truth.
3. **Suffix weight** (`-medium`/`-semibold`/`-bold`) phải khớp `fontWeightSuffix`
   trong `generate-font.mjs` — đã đồng bộ, đừng tách ra.
4. Ưu tiên dùng component `<Heading>` / `<Text>` thay vì gắn class `text-h*` trực
   tiếp; cả hai đều đi qua `cn()` nên đã an toàn.
5. **Luôn dùng `cn()`** khi gộp typography token với class màu — đừng bypass bằng
   template literal (sẽ mất khả năng merge/đè class từ ngoài vào).
6. ⛔ **`tv()` có tailwind-merge RIÊNG — KHÔNG đi qua `cn()`.** Mọi recipe `tv()` mà một slot
   (tính cả base + variant + compoundVariants, và cả hằng class import vào như
   `POPUP_ITEM_CLASS` / `FIELD_POPUP_ITEM_CLASS`) có token cỡ chữ lẫn màu chữ PHẢI khai
   `tv({...}, { twMergeConfig: twMergeFontExtend })`. Thiếu nó là lỗi CÂM, đã đo được
   (2026-09-29): `Button` mất `text-neutral-0` (nút primary theme sáng ra chữ navy trên nền
   tím), `Tabs` / menu người dùng mất `text-body-14` và rơi về 16px mặc định của trình duyệt.

## Đơn vị: rem + media query breakpoint

**Mọi utility Tailwind dùng rem** (Tailwind v4 base, không override). Breakpoint
`wide:` khai ở `src/styles/globals.css`: `--breakpoint-wide: 112.5rem` (= 1800px).

**⚠️ Lưu ý: Media query breakpoint KHÔNG giãn theo TV mode**
- Rem trong media query quy chiếu root font-size **lúc khởi tạo** (16px), KHÔNG theo `--ui-scale`
- `112.5rem` = `1800px` ở mọi mức `--ui-scale` (1 · 1.1 · 1.2 · 1.3)
- Vì TV mode **KHÔNG phóng root font-size** (design mới), mà chỉ nhân `--ui-scale` vào token chữ
- Hệ quả: layout grid / responsive grid GIỮ NGUYÊN ở 2 chế độ → không vỡ

**Đặc biệt:** `wide:` vẫn hoạt động bình thường ở TV vì không phóng root font-size.

---

## TV Mode — đọc trạng thái từ `@/app/store`

`useDisplayStore` + selector `selectIsTv` / `selectEffectiveUiScale`.
`DisplayProvider` ghi lên `<html>`: class `.tv`, `--ui-scale` (1 · 1.1 · 1.2 ·
1.3) và `--lh-scale` (nửa nhịp).

⛔ `--tv-overscan` **KHÔNG còn tồn tại** — đã bỏ cùng design cũ, đừng khai lại
(`tv-display-mode.md §3`). Cần khác biệt hình học ở TV thì dùng biến thể `tv:`.
