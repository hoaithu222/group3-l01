---
name: ui-styling
description: Style UI trong base-projects bằng kit2 (Radix UI + tailwind-variants + Tailwind v4 token). Dùng khi cần style 1 component mới, đổi theme, hoặc quyết định dùng token/variant nào — KHÔNG áp dụng pattern shadcn/ui hay MUI.
---

# UI Styling — kit2 (KHÔNG phải shadcn/ui)

base-projects **không dùng shadcn/ui**. kit2 (`src/shared/ui/`) tự có hệ token
+ component riêng, cũng đứng trên Radix UI nhưng khác mô hình phân phối:
shadcn copy-paste component vào từng repo, kit2 là **thư viện dùng chung** —
sửa 1 chỗ, mọi nơi dùng đều đổi theo.

## Nguồn thật (đọc trước, đừng đoán)

| Cần gì | Đọc |
|---|---|
| Token màu | `docs/rules/color-system.md` |
| Token typography | `docs/rules/font-system.md` |
| Merge className, spacing, thứ tự class | `docs/rules/tailwind-conventions.md` |
| Cấp bậc chữ (`fg-1..5`) | `docs/rules/text-contrast.md` |
| Component nào cho tình huống nào | `docs/rules/reuse-first.md`, skill `kit2-component-picker` |
| Style 1 widget (không phải component đơn) | `docs/rules/widget-composition.md` |

## Cơ chế token — Tailwind v4 `@theme inline`

`src/styles/globals.css` là entry point duy nhất:

```css
@import 'tailwindcss' source(none);
@import './theme/generated-colors.css';   /* :root + .dark + @theme inline */
@import './font/generated-font.css';      /* @utility text-{scale}{suffix} */
```

- Màu: sửa `src/styles/theme/colors-theme.json` → `npm run generate:colors`.
  KHÔNG sửa tay `generated-colors.css`/`colors.generated.ts`.
- Font: sửa `src/styles/font/font.json` → `npm run generate:font`.
- Dark mode tự lật qua CSS var (`.dark` class) — token `bg-*`/`fg-*`/`border-*`
  đổi theo theme tự động, token số (`primary-5`, `blue-3`...) KHÔNG tự lật
  (dùng cho fill/stroke cần giữ nguyên identity, xem `color-system.md`).

## Variant — `tailwind-variants` (`tv()`), KHÔNG phải `cva` kiểu shadcn

```ts
import { tv, type VariantProps } from 'tailwind-variants';

const button = tv({
  slots: { root: '...', icon: '...' },
  variants: {
    variant: { primary: { root: '...' }, secondary: { root: '...' } },
    size: { sm: { root: '...' }, md: { root: '...' } },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
});

export type ButtonVariant = NonNullable<VariantProps<typeof button>['variant']>;
```

Component có ≥2 trục biến thể (variant + size, variant + color...) BẮT BUỘC
dùng `tv()` — không viết `className={cn(variant === 'x' && '...', ...)}` dài
dòng trong JSX. Thêm biến thể mới = thêm 1 key vào `variants.xxx`, KHÔNG sửa
JSX, KHÔNG fork file.

## 3 nguồn dùng chung — đừng tự dựng lại bề mặt

Trước khi tự viết Tailwind chain cho khung ô nhập / bề mặt popover / lớp phủ
modal, kiểm 3 file này (xem `kit2-architecture.md §5b`):

| Cần gì | Import từ |
|---|---|
| Khung/nền/hover/focus ô nhập | `inputs/field.theme` (`fieldSurface()`, `FIELD_HEIGHT`...) |
| Bề mặt menu/popover | `overlays/popup-surface.theme` (`popupSurface()`...) |
| Lớp phủ mờ toàn màn | `overlays/modal.theme` (`MODAL_OVERLAY_CLASS`) |

## className merge — CHỈ qua `cn()`

```ts
import { cn } from '@/shared/utils/style/cn';
```

`cn()` = clsx + tailwind-merge, đã cấu hình nhận diện token typography riêng
của project (`text-h1`, `text-body-14-medium`...) để `tailwind-merge` không
nhầm nó là color token rồi xoá nhầm khi merge (xem `tailwind-conventions.md`
— đây là pitfall thật, không phải lý thuyết).

## Best practices

1. **Composition trước, tuỳ biến sau** — ghép component kit2 có sẵn, không
   viết lại từ đầu.
2. **Utility-first** — Tailwind class trực tiếp trong JSX cho layout; token
   riêng (`text-*`, `bg-*`) cho style hệ thống.
3. **Mobile/touch-aware trước** — dùng `touch:` variant (chỉ được THU NHỎ,
   không phóng to — xem `docs/rules/ipad-responsive.md`).
4. **A11y qua Radix** — kit2 đứng trên Radix UI nên focus trap, ARIA,
   keyboard nav phần lớn có sẵn; đừng tự viết lại khi đã có `@radix-ui/*`
   trong component.
5. **Token trước, giá trị số sau** — không hardcode px/hex ngoài `tv()`
   recipe.
6. **Dark mode qua CSS var, KHÔNG qua `dark:` prefix** — token `bg-*`/`fg-*`
   đã tự lật, không cần viết `dark:bg-slate-800` song song `bg-white`.

## Sai lầm cần tránh (không phải lỗi shadcn — lỗi hay gặp khi quen shadcn)

| ❌ Kiểu shadcn/MUI quen tay | ✅ Kiểu kit2 |
|---|---|
| `npx shadcn add button` | Không có CLI — component đã có sẵn trong `@/shared/ui`, `import` thẳng |
| Copy component vào feature để "sửa riêng" | Extend `tv()` recipe của component gốc trong kit2 |
| HSL CSS var kiểu `hsl(var(--primary))` trong `tailwind.config.ts` | Không có `tailwind.config.js` — token định nghĩa trong `@theme inline` ở `generated-colors.css` |
| `sx={{ color: 'primary.main' }}` (MUI) | `className="text-primary-5"` |
| `next-themes` cho dark mode | `ThemeProvider` riêng của project (`src/app/providers/ThemeProvider.tsx`) + class `.dark` |
