# Color System Rules (CRITICAL — BẮT BUỘC)

## Nguyên tắc tối cao

**KHÔNG BAO GIỜ sử dụng màu hardcode** (hex, rgb, rgba, hsl) trong code.
**CHỈ sử dụng** Tailwind CSS classes từ color tokens đã được generate.

Source of truth: `src/shared/theme/colors.generated.ts`

## Available Color Tokens

### Primary Scale (brand colors)

```tsx
className = 'bg-brand'; // Brand primary
className = 'bg-primary-1'; // Lightest → bg-primary-10 Darkest
className = 'text-primary-5'; // Text dùng primary
```

### Neutral Scale

```tsx
className = 'bg-neutral-0'; // Lightest → bg-neutral-10 Darkest
```

⛔ **KHÔNG dùng thang này cho MÀU CHỮ trên nền của trang.** Chữ dùng `text-fg-1…5`
— chúng tự lật khi đổi theme, còn `text-neutral-6` thì đứng yên nên sáng lên là
mất hút. Ví dụ `text-neutral-6 // Muted text` từng nằm ở đây là SAI và đã bỏ;
xem `text-contrast.md §2.1` cho ngoại lệ duy nhất (chữ trên nền màu ĐẶC).

```tsx
className = 'text-fg-4'; // ✅ chữ mờ (muted)
className = 'text-neutral-6'; // ❌ không lật theo theme
```

### Color Scales (1-10 cho mỗi họ màu)

25 họ có thang số đầy đủ (`neutral` là `0-10`, còn lại `1-10`):

```
primary secondary accent success info warning error
indigo purple teal fuchsia pink azure orange
neutral gray blue sky red green yellow lime emerald white black
```

```tsx
className = 'bg-blue-3';
className = 'text-green-7';
className = 'border-red-5';
```

> ⚠️ Bảng màu Super App (khác dự án gốc `vci-sun-pms-fe`, nơi `primary` là xanh lá):
> `primary` = **TÍM thương hiệu** · `secondary` = **CYAN** (#22B5D8 ở bậc `-5`, cùng họ
> lưới teal của khung app và slot đầu của `CHART_SERIES_TOKENS`) · `accent` = **VÀNG**
> (`action-accent` đi cùng họ này). Màu hồng dùng họ `pink-*`, KHÔNG dùng `secondary`.
>
> Thang `primary` KHÁC NHAU giữa hai theme, CỐ Ý: theme SÁNG đặt bậc `-5` = #A855F7
> (Tailwind purple-500, tươi + đủ tương phản trên nền trắng; `-6` = #9333EA cho nền nút —
> chữ trắng 5.4:1), theme TỐI đặt `-5` = #C084FC (bậc sáng hơn một nấc để nét nhấn/chữ
> tím vẫn đọc được trên nền navy). Cần một màu tím GIỐNG HỆT ở hai theme (ảnh bìa, dữ liệu
> như tấm ảnh) → dùng họ `purple-*`, không dùng `primary-*`.

### Chữ màu trên nền TINT — hai bậc theo theme

Thang màu tông KHÔNG lật theo theme: bậc `-5` chỉ đọc được trên nền navy. Chữ màu đặt trên
nền tint (`bg-{c}-6/20`…) khai HAI bậc: `text-{c}-7` (họ sáng — success · accent · warning ·
yellow · green — dùng `-8`) cho theme sáng, `dark:text-{c}-5` cho theme tối. `Badge`,
`Callout`, `CompactKpiCard`, `SummaryPill` đã theo luật này — nơi gọi không cần tự thêm.

```tsx
className = 'bg-success-6/20 text-success-8 dark:bg-success-6/30 dark:text-success-5'; // ✅
className = 'bg-success-6/30 text-success-5'; // ❌ theme sáng ~1.3:1 — chữ gần như biến mất
```

### Foreground (chữ)

```tsx
className = 'text-fg-1'; // Đậm nhất → text-fg-5 mờ nhất
className = 'text-fg-inverse'; // Chữ trên nền đảo
// Trên bề mặt riêng: fg-on-nav(-muted/-subtle/-accent) · fg-on-popup(-muted) · fg-on-dialog(-muted)
```

Chi tiết cấp bậc chữ → `text-contrast.md`.

### Background Colors

> Hex ghi dưới đây là giá trị **dark theme**; light theme có giá trị riêng
> trong cùng token. Nguồn chuẩn: `src/styles/theme/colors-theme.json`.

```tsx
className = 'bg-bg-base'; // Nền trang chính (#04162A)
className = 'bg-bg-1'; // Nền card, container (#0A1D30)
className = 'bg-bg-2'; // Nền section phụ (#122A42)
className = 'bg-bg-3'; // Nền tertiary (#1B3B5C)
className = 'bg-bg-4'; // Nền quaternary (#265579)
className = 'bg-bg-popup'; // Nền dropdown, tooltip, popover
className = 'bg-bg-input'; // Nền input fields (#0F2438)
className = 'bg-bg-input-2'; // Nền input variant (#08192B)
className = 'bg-bg-nav'; // Nền navigation
className = 'bg-bg-dialog'; // Nền modal/dialog (#122A42)
className = 'bg-bg-dialog-2'; // Nền dialog variant (#1B3B5C)
className = 'bg-bg-chart'; // Nền chart area (#03101F)
// Nền nhạt theo họ màu (badge, alert): bg-primary · bg-success · bg-info ·
// bg-warning · bg-error · bg-neutral · bg-accent · bg-indigo · bg-purple ·
// bg-teal · bg-fuchsia · bg-pink · bg-azure · bg-orange · bg-secondary
```

### Border & Divider Colors

```tsx
className = 'border-border-1'; // Viền mặc định (light)
className = 'border-border-2'; // Viền strong (input, card)
className = 'border-divider-1'; // Divider chính
className = 'border-divider-2'; // Divider phụ
className = 'border-divider-primary'; // Divider tông brand
// Divider trong suốt theo bậc alpha: divider-white-10/20 · divider-blue-10/20/30/40
```

### Status Colors (semantic)

```tsx
className = 'text-success'; // Text thành công
className = 'text-error'; // Text lỗi
className = 'text-warning'; // Text cảnh báo
className = 'text-link'; // Text link

// Status backgrounds (cho badges, alerts)
className = 'bg-success-1 text-success-2'; // Success badge
className = 'bg-error-1 text-error-2'; // Error badge
className = 'bg-warning-1 text-warning-2'; // Warning badge
className = 'bg-info-1 text-info-2'; // Info badge
```

### Chrome của thanh điều hướng / header / popup

```tsx
// Nav: nav-from · nav-to · nav-border · nav-divider · nav-hover-bg ·
//      nav-active-bg · nav-shadow-inset
// Header: header-from · header-to · header-border
// Popup: popup-border · popup-shadow
// Khác: overlay (nền mờ modal) · ring-focus (vòng focus) ·
//       action-base · action-accent
```

### Disabled State

```tsx
className = 'bg-disabled-1'; // Background disabled
className = 'text-disabled-2'; // Text disabled
```

> **Toast, button, table cell KHÔNG có token riêng.** Chúng lấy màu qua `tv()`
> recipe của `<Toast>` / `<Button>` / `<Table>` từ chính các token ở trên. Cần
> đổi màu chúng → sửa recipe trong component, KHÔNG thêm token mới.

## Ngoại lệ — khi mã hex KHÔNG phải là vi phạm

Luật "cấm hex" nói về **màu của giao diện**: thứ phải lật khi đổi theme và phải
đổi theo khi bảng màu đổi. Có ba loại hex nằm ngoài phạm vi đó — chặn chúng chỉ
tạo cảnh báo giả và làm người review mất niềm tin vào luật.

| Loại | Ví dụ trong base | Vì sao không phải màu giao diện |
|---|---|---|
| **Hex là DỮ LIỆU người dùng chọn** | `ColorPalettePanel`, `ColorPickerField`, bảng màu chú thích ảnh | Ô màu trong bộ chọn màu CHÍNH LÀ giá trị người dùng sẽ lưu. Đổi nó sang token là đổi dữ liệu, không phải đổi giao diện |
| **Canvas 2D** | `image-annotator` | `ctx.fillStyle` không nhận `className`. Cần token thì đọc qua `getThemeColor()` rồi truyền chuỗi vào |
| **Màn che (scrim) cố ý độc lập theo theme** | `bg-black/45` ở `modal.theme.ts` | Lớp phủ tối sau hộp thoại phải TỐI ở cả hai theme. Token `bg-*` lật màu nên sẽ thành màn che trắng ở theme sáng |

⛔ Ba ngoại lệ này KHÔNG mở đường cho hex trong `className` hay `style` của
component thường. Dấu hiệu phân biệt: hex có bị GHI XUỐNG hoặc GỬI ĐI như dữ
liệu không? Có thì là dữ liệu. Không, nó chỉ dùng để tô — thì phải là token.

```tsx
// ✅ ĐÚNG — hex là giá trị người dùng chọn rồi lưu vào CSDL
const PRESET_COLORS = ['#06B6D4', '#22C55E'];

// ❌ SAI — hex chỉ để tô một cái viền
<div className="border-[#22C55E]" />
<div style={{ borderColor: '#22C55E' }} />

// ✅ ĐÚNG
<div className="border-primary-5" />
```

---

## Khi cần CSS variable trong JS/inline style

```tsx
// ✅ ĐÚNG — Dùng CSS variable
style={{ color: 'var(--color-primary-5)' }}
style={{ backgroundColor: 'var(--color-bg-base)' }}

// ✅ ĐÚNG — Dùng getThemeColor khi cần hex programmatically (charts, canvas)
import { getThemeColor } from '@/shared/utils/style/color.utils';
const chartColor = getThemeColor('primary-5');

// ❌ SAI — KHÔNG BAO GIỜ dùng hex trực tiếp
style={{ color: '#0F172A' }}
style={{ backgroundColor: '#fff' }}
```

## KHÔNG ĐƯỢC

```tsx
// ❌ SAI — Hardcoded colors
className="bg-white"
className="text-gray-500"
className="bg-[#F8FAFC]"
className="text-[#333]"
style={{ color: '#333' }}
style={{ backgroundColor: 'white' }}
style={{ borderColor: '#e2e8f0' }}

// ✅ ĐÚNG — Dùng color tokens
className="bg-bg-base"
className="text-neutral-6"
className="bg-bg-1"
className="border-border-1"
```

---

## TV Display Mode — Chrome tương phán, series giữ nguyên

Ở TV (dark theme bắt buộc), chữ/nét chart (axis, legend, grid) cần tương phán cao hơn 
để đọc được từ 3m. **Chart series KHÔNG thay đổi màu sắc** (chống bloom 65").

| Element | Desktop | TV | Lý do |
|---------|---------|-----|-------|
| Axis/legend/grid | `fg-4` / `border-1` (mặc định) | `fg-2` / `border-2` (vọc sáng hơn) | Nét mỏng bị "chìm" |
| Series `-5` | Giữ nguyên | Giữ nguyên (KHÔNG tăng saturation) | Chống bloom từ 3m |

**Cơ chế tự động:** Font weight nâng nửa bậc (§font-system.md) + nâng CSS var 
`--ui-scale: 1.1` → axis/legend/grid chữ to + đậm = đủ nổi. KHÔNG cần thêm constant 
`TV_GRID_WIDTH` nữa (bỏ design cũ).

**Token TV (ngoài scope color mà dùng qua `buildChartStyles`):**
- Axis label: `fg-4` → `fg-2` (nâng tương phán chữ)
- Grid / đường trục: `border-1` → `border-2` (đổi MÀU cho đậm hơn; bề dày nét do
  `scale.gridWidth` lo, nhân theo `uiScale` trong `buildChartStyles`)
- Legend: `fg-3` → `fg-1` (emphasis trên TV)

---

## Khi cần thêm màu mới

1. Thêm vào `src/styles/theme/colors-theme.json` (cả light và dark mode)
2. Chạy `npm run generate:colors` để tạo lại CSS + TS
3. **KHÔNG BAO GIỜ** thêm màu trực tiếp vào CSS/TSX
