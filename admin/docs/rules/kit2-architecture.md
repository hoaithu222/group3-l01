# Kit2 Architecture & Scale Rules (CRITICAL — BẮT BUỘC)

> **Kit2** = `src/shared/ui/` — design system của base project.
> Đây là **single source of truth** cho mọi component UI. Mục tiêu của rule này: **scale nhanh** + **đáp ứng thay đổi cực kỳ nhanh** mà KHÔNG vỡ kit2.

---

## 0. Nguyên tắc tối cao — quy tắc 3R

```
   1. REUSE   →  Đã có component? DÙNG LẠI.
   2. EXTEND  →  Gần giống nhưng thiếu prop/variant? MỞ RỘNG cái có sẵn (tv recipe + new variant).
   3. CREATE  →  Chỉ tạo mới khi không trùng concept với BẤT KỲ component nào trong kit2.
```

**KHÔNG BAO GIỜ** tạo component "gần giống" `Button`/`Modal`/`Input`/`Table`/`Dropdown`/`Badge`… đã có. Mở rộng bằng variant axis mới — KHÔNG copy-clone.

> ✅ **Trước khi viết bất kỳ file `.tsx` mới nào trong `src/shared/ui/`** → đọc bảng **§2 Inventory** + **§3 Decision Tree**.

---

## 1. Public API (BẤT BIẾN)

```ts
// ✅ ĐÚNG — luôn import từ barrel
import { Button, Modal, type ButtonVariant } from "@/shared/ui";

// ❌ SAI — import sâu, vỡ refactor nội bộ
import Button from "@/shared/ui/actions/Button";
import { ModalSize } from "@/shared/ui/overlays/Modal";
```

**Quy tắc:**
- Mọi component / type / hook publish ra ngoài kit2 → export qua `src/shared/ui/index.ts`
- Type phải export cùng component (`{Name}Props`, `{Name}Variant`, `{Name}Size`…)
- Internal helper (calendar-panel, picker-trigger…) → **KHÔNG** re-export ở root barrel

**Hai ngoại lệ import sâu — CHỈ hai đường này:**

```ts
import { SystemIcon } from '@/shared/ui/icons/Icons';          // registry icon tự sinh
import { AnnotationLayer } from '@/shared/ui/media/image-annotator';  // canvas nặng, nạp lười
```

`SystemIcon` cố ý KHÔNG nằm ở root barrel: `icons/index.ts` là file tự sinh,
đưa nó vào barrel chung buộc mọi trang phải nạp cả registry 377 icon.

⚠️ Luật này áp cho GIÁ TRỊ, không áp cho KIỂU. `SystemIconName` bị xoá sạch lúc
biên dịch nên không tốn byte nào — nó **có** ở root barrel:

```ts
import { type SystemIconName } from '@/shared/ui';           // ✅ kiểu, miễn phí
import { SystemIcon } from '@/shared/ui/icons/Icons';        // ✅ giá trị, import sâu
```

---

## 2. Inventory & Taxonomy (luôn cập nhật)

Kit2 chia theo **CHỨC NĂNG**, không theo "atomic/composite". Lý do: khi cần một
component, người ta nhớ *nó làm gì* ("tôi cần chọn ngày"), chứ không nhớ nó
thuộc bậc trừu tượng nào. 48 file phẳng ở gốc là thứ không ai tra nổi.

| Nhóm | Thư mục | Chứa gì | Ví dụ |
|------|---------|---------|-------|
| **Nguyên tố** | `primitives/` | Hiển thị thuần, không state, không hành vi | Text · Heading · Badge · Avatar · Divider |
| **Phản hồi** | `feedback/` | Trạng thái tải / rỗng / cảnh báo / tiến độ | Spinner · Skeleton · Callout · Progress · ProgressCircle · EmptyState · TableEmptyIllustration |
| **Hành động** | `actions/` | Control kích hoạt một việc | Button · Menu · ContextMenu · SegmentToggle · ThemeToggle · CopyableText |
| **Ô nhập** | `inputs/` | Nhập liệu cơ bản | Input · Textarea · NumberInput · Checkbox · Radio · Toggle · ColorPalettePanel · field.theme |
| **Chọn danh sách** | `selects/` | Chọn từ tập giá trị | Dropdown · MultiSelect · DropdownTreeSelect |
| **Chọn thời gian** | `pickers/` | Ngày / khoảng ngày / giờ | DatePicker · SingleDatePicker · RangeDatePicker · DateTimePicker · MonthYear* · TimePicker |
| **Lớp nổi** | `overlays/` | Nổi lên trên nội dung | Popover · Tooltip · Modal · ConfirmDialog · FormModal · Drawer · CustomModalLayout · Toast* · popup-surface.theme |
| **Điều hướng** | `navigation/` | Đi giữa các phần | Tabs · TabsPanel · Stepper · Pagination · ScrollEdgeNav |
| **Trình bày dữ liệu** | `data-display/` | Bảng, cây | Table (+ table-parts / table-header / table-align) · Tree |
| **Mặt nền** | `surfaces/` | Khung chứa nội dung | Surface · BoxPanel · BoxInfo · HudFrame (+ `hud-frame-decor` nội bộ) · HudCorners · HudInfoBox · PanelCard · SummaryCard · CompactKpiCard · SummaryPill · CardScreenshort · Splitter |
| **Ảnh & tệp** | `media/` | Ảnh, xem ảnh, tải tệp | Image · ImagePreview · ImageLightbox · Upload · Dropzone · FileCard · FileList · image-annotator/ |
| **Bố cục** | `layout/` | Khung màn hình / vùng | AppShell · SectionHeader · TitleScreen (showcase kit2 — tiêu đề trang dùng `PageHeader` của `@/shared/widgets/header`) · DetailPanelHeader |
| **Hệ form** | `form/` | RHF + Zod | Form · FormItem · FormActions · fields/* · layout/* · patterns/* · hooks/* |
| **Icon** | `icons/` | Registry tự sinh | SystemIcon · GemIcon — ⛔ KHÔNG sửa tay `index.ts` |

---

## 3. Decision Tree — đặt file ở đâu?

```
Component mới của bạn …
│
├── là field react-hook-form?                → form/fields/
├── là layout-orchestrator của form?         → form/layout/
├── là pattern form đặc biệt (conditional, stepper)? → form/patterns/
├── nổi LÊN TRÊN nội dung (dialog, popover, toast)? → overlays/
├── để NHẬP một giá trị tự do?               → inputs/
├── để CHỌN từ danh sách có sẵn?             → selects/
├── để chọn NGÀY hoặc GIỜ?                   → pickers/
├── là BẢNG hoặc CÂY dữ liệu?                → data-display/
├── đưa người dùng đi chỗ khác (tab, bước, trang)? → navigation/
├── là KHUNG CHỨA nội dung khác (panel, card, HUD)? → surfaces/
├── báo TRẠNG THÁI (đang tải, rỗng, lỗi, %)? → feedback/
├── là ẢNH hoặc TỆP?                          → media/
├── là khung BỐ CỤC màn hình / vùng?          → layout/
├── KÍCH HOẠT một hành động khi bấm?          → actions/
├── là icon SVG?                              → icons/  (KHÔNG sửa index.ts)
├── là ảnh hệ thống (logo, minh hoạ)?         → assets/image/ + dùng <Image name="..." />
└── chỉ HIỂN THỊ, không state, không hành vi? → primitives/
```

**KHÔNG tạo nhóm mới** trừ khi: ≥ 3 component cùng họ + sẽ có ≥ 5 trong 3 tháng
tới. Nhóm mới phải có barrel `index.ts` ngay từ ngày đầu, và phải thêm một dòng
vào bảng §2 + một nhánh vào cây quyết định §3 — bảng nói dối còn tệ hơn không có bảng.

---

## 4. File & Symbol Naming

| Loại | Convention | Ví dụ |
|------|-----------|-------|
| Component file | `PascalCase.tsx` | `Button.tsx`, `SummaryCard.tsx` |
| Internal helper file (không export ra `@/shared/ui`) | `kebab-case.tsx` | `calendar-panel.tsx`, `picker-trigger.tsx` |
| Types file | `kebab-case.ts` | `date-picker-types.ts` |
| Hook file | `useXxx.ts` (camelCase) | `useZodForm.ts`, `useFormField.ts` |
| Barrel | `index.ts` | — |
| Default export | Component class | `export default Button` |
| Named exports | Types + sub-components | `export type ButtonVariant` · `export const ButtonGroup` |

---

## 5. Token Contract — KHÔNG NEGOTIABLE

Mọi component kit2 BẮT BUỘC:

| Aspect | Source of truth | Tham chiếu |
|--------|----------------|------------|
| Colors | `colors.generated.ts` → Tailwind classes | `color-system.md` |
| Typography | `font.json` → `text-{scale}-{weight}` | `font-system.md` |
| Icons | `<SystemIcon name="...-bold" />` | `icon-conventions.md` |
| className merge | `cn()` từ `@/shared/utils/style/cn` | `tailwind-conventions.md` |

**KHÔNG có ngoại lệ.** Vi phạm = revert.

```tsx
// ❌ Hex màu / raw font / inline SVG / clsx trực tiếp
<div className="text-sm font-medium leading-5 text-[#94A3B8]">…</div>

// ✅ Token + cn + SystemIcon
import { cn } from "@/shared/utils/style/cn";
import { SystemIcon } from "@/shared/ui/icons/Icons";

<div className={cn("text-body-14-medium text-neutral-5", className)}>
  <SystemIcon name="house-bold" size={16} className="text-primary-5" />
</div>
```

---

## 5b. Ba NGUỒN DÙNG CHUNG — đừng chép lại bề mặt

Component trong kit2 KHÔNG tự dựng lại ba thứ dưới đây. Trước khi viết chuỗi
Tailwind cho khung ô nhập, cho một lớp nổi kiểu menu, hay cho lớp phủ toàn màn,
hãy nhập từ đúng file:

| Cần gì | Nhập từ | Cấp cái gì |
| --- | --- | --- |
| Khung / nền / hover / focus của ô nhập | `inputs/field.theme` | `fieldSurface()` · `FIELD_HEIGHT` · `FIELD_CONTROL_CLASS` · `FIELD_POPUP_*` · `FIELD_CLEAR_ICON` |
| Bề mặt menu / popover (kính + viền teal + quầng) | `overlays/popup-surface.theme` | `popupSurface()` · `POPUP_ITEM_CLASS` · `POPUP_ITEM_ICON_CLASS` |
| Lớp phủ mờ toàn màn | `overlays/modal.theme` | `MODAL_OVERLAY_BASE` (không animation) · `MODAL_OVERLAY_CLASS` |

**Ngoài kit2 thì nhập qua barrel.** Widget dựng lớp nổi riêng (hiện chỉ `shared/widgets/command-palette`)
mượn `MODAL_OVERLAY_CLASS` · `modalStyles` · `POPUP_ITEM_CLASS` · `POPUP_ITEM_ICON_CLASS` từ `@/shared/ui`
(`overlays/index.ts` xuất bốn tên đó) — KHÔNG import sâu `@/shared/ui/overlays/*.theme`. Đây là lý do
"CHỈ hai đường import sâu" ở §1 vẫn đúng: không có đường thứ ba cho theme nội bộ. Bản trước để widget import
sâu vì barrel chưa xuất; xuất ra là chỗ sửa ở gốc. Component thường KHÔNG cần chúng: hộp thoại dùng `Modal`,
menu dùng `Menu`.

**Vì sao ghi thành luật.** Cả ba đều đã từng bị chép tay rồi trôi khỏi chuẩn, và
chú thích trong code còn tự thú điều đó — `ContextMenu` ghi "SYNC với Menu.tsx",
còn `modal.theme` và `drawer.theme` thì nhắc lẫn nhau. Đồng bộ bằng lời hứa
không phải là cơ chế. Hậu quả đo được: trong CÙNG một form, `TextField` tụt vào
focus có viền xanh + quầng ring, còn `MaskedField` ngay cạnh chỉ đổi màu viền —
và ba sắc đỏ khác nhau cho cùng một trạng thái lỗi.

**Hai vai trò của nút xoá.** `FIELD_CLEAR_ICON.chip` (8px) cho dấu ✕ nằm trong
một `<Badge>`; `FIELD_CLEAR_ICON.all` (10px) cho dấu ✕ xoá tất cả, bằng đúng cỡ
mũi tên xổ đứng cạnh. Trước khi gom, năm chỗ dùng năm con số — nặng nhất là
`Dropdown` vẽ nút xoá cỡ 6 ngay cạnh mũi tên cỡ 10.

**Màu trong shadow phải qua token.** `shadow-[…rgba(45,212,191,0.15)…]` chính là
`teal-5` chép tay — đổi palette là nó ở lại màu cũ. Viết
`color-mix(in_srgb,var(--color-teal-5)_15%,transparent)`, đúng như `modal.theme`
đã quy định.

**Rào chắn tự động.** `tests/shared/kit2-props-types.test.ts` bắt buộc mọi
component đi qua barrel phải xuất kèm kiểu `XxxProps`;
`tests/shared/kit2-uncovered.test.tsx` giữ cho những export chưa có nơi dùng
(API dọn sẵn cho dự án kế thừa) vẫn render được.

---

## 6. Variant System — `tailwind-variants` (tv)

Component có ≥ 2 axes biến thể (variant + size, hoặc variant + color) → BẮT BUỘC dùng `tv()` recipe:

```ts
import { tv, type VariantProps } from "tailwind-variants";

const button = tv({
  slots: { root: "...", icon: "..." },
  variants: {
    variant: { primary: { root: "..." }, secondary: { root: "..." } },
    size:    { sm: { root: "..." },     md: { root: "..." } },
  },
  defaultVariants: { variant: "primary", size: "md" },
});

export type ButtonVariant = NonNullable<VariantProps<typeof button>["variant"]>;
export type ButtonSize    = NonNullable<VariantProps<typeof button>["size"]>;
```

**Vì sao bắt buộc:** thêm variant mới = thêm 1 dòng trong recipe, KHÔNG sửa JSX. Đáp ứng thay đổi cực nhanh.

Khi mở rộng: **thêm key vào `variants.xxx`**, KHÔNG fork component.

---

## 7. Props Pattern — chuẩn kit2

```tsx
export interface ComponentNameProps {
  // ── Content ──
  // primitive content first (title, value, children)

  // ── Variants ── (mọi variant phải export type riêng)
  variant?: ComponentNameVariant;
  size?: ComponentNameSize;

  // ── Slots ── (React.ReactNode cho mọi vùng nhúng custom)
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  footer?: React.ReactNode;

  // ── Behavior ──
  onClick?: (e: React.MouseEvent) => void;

  // ── Escape hatch ──
  className?: string;
}
```

**Rules:**
- Mọi prop optional có `defaultValue` rõ ràng — KHÔNG để rơi vào `undefined`
- Slot luôn `React.ReactNode` (không `string` riêng) — caller tự render component con
- `className` luôn được merge cuối qua `cn()` để cho phép override
- Icon prop = `BoldSystemIconName` (template-literal enforcement) — KHÔNG `string`

---

## 8. Barrel File — BẮT BUỘC cho mọi sub-folder

Mỗi nhóm (`primitives/`, `feedback/`, `actions/`, `inputs/`, `selects/`, `pickers/`, `overlays/`, `navigation/`, `data-display/`, `surfaces/`, `media/`, `layout/`, `form/`, …) PHẢI có `index.ts` re-export public API. Lý do: refactor đổi tên file → KHÔNG vỡ caller.

```ts
// src/shared/ui/surfaces/index.ts
export { default as BoxInfo } from "./BoxInfo";
export type { BoxInfoProps, BoxInfoItem, BoxInfoItemColor } from "./BoxInfo";
export { default as SummaryCard } from "./SummaryCard";
export type { SummaryCardProps, BoldSystemIconName } from "./SummaryCard";
export { default as BoxPanel } from "./BoxPanel";
export type { BoxPanelProps } from "./BoxPanel";
```

Root barrel (`src/shared/ui/index.ts`) re-export TỪ barrel con — KHÔNG import từ file lá.

---

## 9. Adding a New Component — Checklist BẮT BUỘC

Trước khi merge PR thêm component mới vào kit2:

- [ ] Đã grep `src/shared/ui/` → KHÔNG trùng concept với component có sẵn
- [ ] Đặt file đúng layer theo **§3 Decision Tree**
- [ ] PascalCase cho file `.tsx` component
- [ ] JSDoc block top file: mô tả Figma node, variant matrix, slots
- [ ] Mọi color = Tailwind token (xem `color-system.md`)
- [ ] Mọi typography = `text-{scale}-{weight}` (xem `font-system.md`)
- [ ] Mọi icon = `<SystemIcon name="..." />` — mặc định `-outline`, `-bold` cho gem/KPI/overlay (xem `icon-conventions.md`)
- [ ] Variant ≥ 2 axes → `tv()` recipe (xem **§6**)
- [ ] Props theo pattern **§7** (slots = ReactNode, có `className`, default rõ ràng)
- [ ] Export qua barrel con + root `src/shared/ui/index.ts`
- [ ] Thêm import vào `tests/shared/kit2-barrel.test.tsx` — barrel trỏ sai đường là lỗi im lặng, test này bắt được
- [ ] `npx tsc --noEmit` → exit 0
- [ ] Update bảng **§2 Inventory** trong rule này

**Khoảng cách giữa "có yêu cầu mới" và "component sẵn sàng" phải ≤ 1 giờ** với checklist này.

---

## 10. Extending Existing Component — checklist mini

Khi thêm variant / size / slot vào component có sẵn:

- [ ] Edit recipe `tv()` — thêm key mới trong `variants.xxx`
- [ ] Export type updated (`type XxxVariant = NonNullable<VariantProps<…>["variant"]>` auto-pick)
- [ ] Update JSDoc variant matrix
- [ ] Cập nhật bảng props của component trong `reuse-first.md` §3
- [ ] KHÔNG fork component thành `XxxV2.tsx`

---

## 11. Anti-patterns — DANH SÁCH ĐEN

| ❌ Sai | ✅ Đúng |
|-------|--------|
| Tạo `PrimaryButton.tsx`, `IconButton.tsx`, `LinkButton.tsx` | Mở rộng `Button` qua `variant` axis |
| `BlueBadge`, `SuccessBadge`, `WarningBadge` | `<Badge color="success" variant="tinted" />` |
| Import deep: `@/shared/ui/surfaces/SummaryCard` | `import { SummaryCard } from "@/shared/ui"` |
| Sửa file auto-gen (`icons/index.ts`) | Edit SVG → `npm run generate:icons` |
| Hex màu trong `style={{}}` | CSS var `var(--color-azure-8)` hoặc Tailwind token |
| `text-sm font-medium leading-5` | `text-body-14-medium` |
| Copy-paste component để fork variant | Thêm `variant` axis vào recipe `tv()` |
| `<svg><path d="..." /></svg>` inline | `<SystemIcon name="..." />` |
| `clsx(...)` / `twMerge(...)` trực tiếp | `cn(...)` |
| Tạo `useToggle`, `useModal` riêng | Dùng `useDisclosure` từ `@/shared/hooks` |
| `any` type | `unknown` hoặc generic |
| Hardcode size px ngoài recipe | Thêm size variant `tv()` |

---

## 12. Khi cần thay đổi visual toàn hệ thống

**Tình huống:** Designer thay primary color, type scale, hoặc border radius.

| Phạm vi đổi | File cần sửa | Lệnh chạy lại |
|-------------|-------------|--------------|
| Màu sắc (1 token hoặc cả palette) | `src/styles/theme/colors-theme.json` | `npm run generate:colors` |
| Typography scale | `src/styles/font/font.json` | `npm run generate:font` |
| Icon SVG | `src/assets/icons/*.svg` | `npm run generate:icons` |
| Component variant | `tv()` recipe trong file component | — |
| Image asset | Thả file vào `src/assets/image/*` | `npm run generate:images` |

**KHÔNG sửa class/hex/svg ở chỗ khác.** Sai chỗ → mất sync, sẽ debug lâu.

---

## 13. Cross-references

- Token & visual rules → `color-system.md` · `font-system.md` · `icon-conventions.md` · `tailwind-conventions.md`
- Reuse policy chung + catalog component → `reuse-first.md`
- Performance / memoization → `code-optimization.md`
- File naming chung cho project → `code-style.md`

---

## 14. Khi vi phạm

- PR có hex màu / raw font / inline SVG / copy-paste fork → **revert**
- Thêm component mới mà KHÔNG update bảng **§2** → **block merge**
- Thêm sub-folder mới mà KHÔNG có `index.ts` → **block merge**
- Import deep từ ngoài `@/shared/ui` (`@/shared/ui/surfaces/...`) → fail review
