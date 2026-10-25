# Widget Composition Rules (BẮT BUỘC cho `src/shared/widgets/`)

> Bổ sung cho `kit2-architecture.md` và `reuse-first.md` — tập trung vào widgets
> (Dock, Header, ProgressCenter, …). Mục tiêu: **sửa 1 chỗ → đồng bộ cả widget**, KHÔNG
> rải Tailwind chain ad-hoc trong JSX.

---

## 1. Token Centralization — quy tắc 1-Source

Mỗi widget folder PHẢI có 1 file `*.theme.ts` colocated chứa:

1. **Token constants** (radius, easing, duration) — `export const X = { ... } as const`
2. **`tv()` recipe** cho mọi panel/control có ≥ 2 visual state (selected/open/active/…)

```ts
// src/shared/widgets/dock/dock.theme.ts — bản THẬT trong repo
export const DOCK_BOTTOM_CLASS = 'bottom-[calc(1rem+var(--safe-b,0px))]';
export const DOCK_NARROW_FIT_CLASS = [ /* … */ ];

export const dockStyles = tv({
  slots: { root: [...], item: [...], glyph: [...], indicator: [...] },
  variants: {
    active: { true: { glyph: '…', indicator: '…' } },
  },
});
```

**Component CHỈ consume slots** — KHÔNG viết Tailwind chain dài trong JSX:

```tsx
// ❌ SAI — magic chain trong JSX
<button className="flex size-11 items-center justify-center rounded-md transition-colors ...">

// ✅ ĐÚNG — recipe slot
const s = dockStyles({ active });
<button className={s.item()}>
  <span className={s.glyph()}>…</span>
</button>
```

Ba file theme hiện có — đọc trước khi thêm cái thứ tư:
`dock/dock.theme.ts` · `header/header.theme.ts` · `header/page-header/page-header.theme.ts`.

---

## 2. Reuse Kit2 Primitives — KHÔNG re-implement

Trước khi viết Tailwind cho 1 phần tử trong widget, kiểm tra `@/shared/ui/`:

| Nhu cầu | Dùng |
|---------|------|
| Toggle/switch | `Toggle` |
| Floating panel | `Popover` (variant `glass` / `solid`) |
| Modal/dialog | `Modal` / `ConfirmDialog` / `FormModal` |
| Dropdown action | `Menu` · selection: `Dropdown` / `MultiSelect` |
| Text/heading | `Text` / `Heading` (KHÔNG raw `text-sm font-medium`) |
| Separator | `Divider` (KHÔNG `<div className="h-px bg-..." />`) |
| Icon | `<SystemIcon name="..." />` — mặc định `-outline`, `-bold` cho gem/KPI/overlay (KHÔNG inline SVG) |
| Avatar/ảnh | `Avatar` / `ImagePreview` / `Image` |
| Badge/tag | `Badge` |
| Tooltip | `Tooltip` (cẩn thận khi đặt trong `Popover.Trigger asChild` — dùng native `title` nếu xung đột Provider) |

Lý do: thay đổi typography/color/radius ở `font.json` / `colors.generated.ts` /
recipe → widget tự cập nhật. KHÔNG cần grep sửa từng class.

---

## 3. Local Sub-component khi tile lặp lại

Khi 1 layout (vd "icon + title + description + trailing") xuất hiện ≥ 2 lần
trong cùng widget, tạo 1 local component memoized:

Mẫu có thật trong repo: `page-header/PageHeaderNav.tsx` khai `NavChip` memoized
ngay trong file, **KHÔNG export** (đúng ngoại lệ §1 của `clean-code-standards.md`)
— vì mỗi chip cần `useCallback` riêng.

```tsx
// page-header/PageHeaderNav.tsx — local, KHÔNG export
const NavChip = memo(function NavChip({ item, active, disabled, onSelect }) {
  const handleSelect = useCallback(() => onSelect(item.key), [onSelect, item.key]);
  return <PageHeaderChip … />;
});
```

Ngưỡng: 2 lần → cân nhắc; 3 lần → BẮT BUỘC.

Nếu tile xuất hiện ở ≥ 2 widget → promote lên `src/shared/ui/` theo
checklist `kit2-architecture.md §9`.

---

## 4. Font tokens — BẮT BUỘC dùng `text-{scale}-{weight}`

KHÔNG raw `text-sm font-medium leading-5` hay `text-[11px] uppercase`. Dùng:

| Vai trò | Class hệ thống |
|---------|---------------|
| Tile title | `text-body-14-medium` (qua `<Text size="small" weight="medium" />`) |
| Tile description | `text-caption-12` (qua `<Text size="tiny" skin="muted" />`) |
| Section label uppercase | `text-caption-10-medium` |
| Heading panel | `<Heading size="extraTiny" />` |

Thiếu scale → sửa `src/styles/font/font.json` → `npm run generate:font`.
KHÔNG hard-code px.

---

## 5. Color tokens — KHÔNG hex / KHÔNG raw Tailwind palette

| ❌ Sai | ✅ Đúng |
|-------|--------|
| `bg-white` / `bg-[#0F172A]` | `bg-bg-1` / `bg-bg-2` |
| `text-gray-500` | `text-neutral-5` |
| `border-[#22c55e]` | `border-success` / `border-green-6` |
| `text-blue-500` | `text-link` / `text-sky-5` |

Cần màu mới → thêm `src/styles/theme/colors-theme.json` → `npm run generate:colors`.

---

## 6. Variant extension — thêm key, KHÔNG fork file

Khi designer thêm 1 mode/skin mới (vd "compact mode"):

```ts
// ❌ SAI — tạo DockCompact.tsx song song với Dock.tsx
// ❌ SAI — thêm prop `compact?: boolean` rồi rải `compact && "..."` trong JSX

// ✅ ĐÚNG — thêm key vào recipe có sẵn
export const dockStyles = tv({
  slots: { root: [...], item: [...], glyph: [...], indicator: [...] },
  variants: {
    active: { ... },
    density: {                          // ← thêm axis mới
      cozy: { root: "px-3 py-2", item: "size-11" },
      compact: { root: "px-2 py-1", item: "size-9" },
    },
  },
  defaultVariants: { density: "cozy" },
});
```

Component CHỈ thêm 1 prop `density?: "cozy" | "compact"` truyền vào recipe.
KHÔNG sửa JSX.

---

## 7. Checklist trước khi commit widget code

- [ ] File `*.theme.ts` colocated chứa tokens + `tv()` recipe
- [ ] JSX component CHỈ gọi slot của recipe (`s.item()`…) — KHÔNG Tailwind chain raw
- [ ] Mọi typography dùng `<Text>` / `<Heading>` hoặc `text-{scale}-{weight}`
- [ ] Mọi màu dùng semantic token (`bg-bg-1`, `text-neutral-5`, `text-sky-3`)
- [ ] Mọi icon dùng `<SystemIcon name="..." />` (mặc định `-outline`, `-bold` cho nhấn mạnh) — không inline SVG
- [ ] Reuse primitives từ `@/shared/ui` (Popover, Toggle, Divider, …)
- [ ] Tile/row lặp lại được extract thành local component memoized
- [ ] `npx tsc --noEmit` exit 0
- [ ] Variant mới = thêm key vào recipe, KHÔNG copy-paste component

---

## 8. Anti-patterns danh sách đen

| ❌ Sai | ✅ Đúng |
|-------|--------|
| `<div className="h-px bg-sky-5/15 my-2" />` | `<Divider className="my-2 border-sky-5/15" />` |
| `<p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-5">` | `<Text className={s.sectionLabel()}>` (font token qua recipe) |
| `<input type="checkbox" />` + style tay | `<Toggle />` / `<Checkbox />` |
| Inline `<svg>` cho check/arrow | `<SystemIcon name="check-bold" />` |
| `selected ? "bg-sky-5/15" : "hover:bg-bg-2/60"` rải trong JSX | Recipe variant `selected` |
| Tạo `DockV2.tsx` cho variant mới | Thêm key vào recipe `tv()` |
| Truyền `className` raw 3-4 layer xuyên props | Slot recipe + className override ở root |

---

## 9. Tham chiếu

- Token & visual rules: `color-system.md` · `font-system.md` · `icon-conventions.md` · `tailwind-conventions.md`
- Reuse policy chung: `reuse-first.md`
- Kit2 scale + decision tree: `kit2-architecture.md`
- Performance / memoization: `code-optimization.md`
