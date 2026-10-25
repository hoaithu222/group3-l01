# Reuse First — CHỈ kit2 (`src/shared/ui/`), KHÔNG raw HTML UI

> **Kit2 (`src/shared/ui/`)** là **single source of truth DUY NHẤT** cho mọi
> component UI. Mọi rule về scale, taxonomy, decision tree, checklist "thêm
> component mới" → đọc **`kit2-architecture.md`**. Token / variant / recipe
> centralization khi sửa widget → đọc **`widget-composition.md`**.
>
> File này là **catalog tra cứu nhanh + bảng map HTML → kit2** —
> dùng khi đang code để biết: "tôi cần làm X → component nào?".

---

## ⛔ Nguồn UI DUY NHẤT — `@/shared/ui`

```
✅ DUY NHẤT cho phép:
   import ... from "@/shared/ui"
   import ... from "@/shared/ui/icons/Icons"   // SystemIcon
   import { PageHeader, useQueryTabNav } from "@/shared/widgets/header"   // tiêu đề trang (§3.4)
```

Mọi nhu cầu UI (Button, Input, Modal, Form, Spinner, Card, …) **CHỈ** lấy từ
`@/shared/ui` (kit2). KHÔNG dựng thư mục UI thứ hai, KHÔNG copy component ra
feature để "sửa riêng". Vi phạm → **block merge** trong code review.

Khi component cần dùng KHÔNG có trong kit2:
1. Đọc catalog **§3 Kit2 Catalog** bên dưới — đa số đã có sẵn.
2. Gần giống nhưng thiếu prop → **mở rộng** component kit2 theo
   `kit2-architecture.md §6` (thêm key vào `tv()` recipe).
3. Hoàn toàn không có → **tạo mới trong `src/shared/ui/`** theo checklist
   `kit2-architecture.md §9`.

---

## 0. Quy tắc tối cao — 3R

```
1. REUSE   →  Đã có component kit2? DÙNG LẠI.
2. EXTEND  →  Gần giống nhưng thiếu prop/variant? MỞ RỘNG (thêm key vào tv() recipe).
3. CREATE  →  CHỈ tạo mới khi không trùng concept với BẤT KỲ component nào trong kit2.
```

**Quy tắc cứng (Balanced enforcement):**

| HTML element | Trạng thái | Lý do |
|--------------|-----------|-------|
| `<button>`, `<input>`, `<select>`, `<textarea>` | ❌ **CẤM** | Có kit2 component thay thế |
| Inline `<svg>`, raw `<img>` cho icon/asset | ❌ **CẤM** | Dùng `<SystemIcon>` / `<Image>` |
| `<span>` cho badge/chip/tag/dot | ❌ **CẤM** | Dùng `<Badge>` |
| `<div>` cho card/panel/section header | ❌ **CẤM** | Dùng `<SummaryCard>` / `<BoxInfo>` / `<SectionHeader>` |
| `<a>` / `<button>` cho action menu trigger | ⚠️ **HẠN CHẾ** | Ưu tiên `<Menu>` / `<Dropdown>` — chỉ dùng raw khi cần keyboard pattern custom |
| `<div>`, `<span>`, `<section>` làm flex/grid wrapper | ✅ **OK** | Layout primitive — không có UI behavior |
| `<form>` ngoài cùng | ✅ **OK** | Form root (nội dung bên trong dùng `<Form>` / fields) |
| `<table>`, `<thead>`, `<tr>` thủ công | ❌ **CẤM** | Dùng `<Table>` (kit2) |
| `<ul>`, `<li>` cho navigation/menu list | ⚠️ **HẠN CHẾ** | Ưu tiên `<Menu>` / `<Tabs>`. Cho phép `<ul>` cho danh sách nội dung thuần (vd: bullet trong description) |

Vi phạm bảng trên → **block merge** trong code review.

---

## 1. HTML → Kit2 Decision Table (BẮT BUỘC tra trước khi viết JSX)

### Form controls

| Cần làm | Dùng | Import |
|---------|------|--------|
| Text input | `<Input>` | `@/shared/ui` |
| Password input | (trong Form) `<PasswordField>` | `@/shared/ui` |
| Multi-line text | `<Textarea>` | `@/shared/ui` |
| Number input | (trong Form) `<NumberField>` | `@/shared/ui` |
| Single dropdown | `<Dropdown>` | `@/shared/ui` |
| Multi-select | `<MultiSelect>` | `@/shared/ui` |
| Checkbox | `<Checkbox>` | `@/shared/ui` |
| Switch / toggle | `<Toggle>` | `@/shared/ui` |
| Radio button group | `<RadioGroup>` + `<Radio>` | `@/shared/ui` |
| Date single | `<SingleDatePicker>` hoặc `<DatePicker mode="single">` | `@/shared/ui` |
| Date range | `<RangeDatePicker>` hoặc `<DatePicker mode="range">` | `@/shared/ui` |
| Segmented control (2-4 lựa chọn ngắn) | `<SegmentToggle>` | `@/shared/ui` |
| File upload | (trong Form) `<FileField>` | `@/shared/ui` |
| Async-loaded options | (trong Form) `<AsyncSelectField>` | `@/shared/ui` |
| Cascade select (parent → child) | (trong Form) `<CascadeSelectField>` | `@/shared/ui` |

### Action / Navigation

| Cần làm | Dùng | Import |
|---------|------|--------|
| CTA chính | `<Button variant="primary">` | `@/shared/ui` |
| CTA phụ | `<Button variant="secondary">` | `@/shared/ui` |
| Action thứ cấp viền | `<Button variant="stroke">` | `@/shared/ui` |
| Icon-only / link button | `<Button variant="ghost">` | `@/shared/ui` |
| Action menu (dropdown) | `<Menu>` | `@/shared/ui` |
| Tab navigation | `<Tabs>` + `<TabsPanel>` | `@/shared/ui` |
| Step wizard | `<Stepper>` | `@/shared/ui` |
| Pagination footer | `<Pagination>` | `@/shared/ui` |
| Mã / ID bấm để chép vào clipboard (kèm báo "Đã chép" cho trình đọc màn hình) | `<CopyableText value label display?>` — KHÔNG tự viết nút + `useCopyToClipboard` | `@/shared/ui` |
| Tìm nhanh toàn cục (Ctrl/Cmd+K, nhảy sang trang/phân hệ khác) | `<CommandPalette>` (mở qua `useCommandPaletteStore` hoặc `<CommandPaletteTrigger>`) — KHÔNG tự viết dialog tìm kiếm mới | `@/shared/widgets/command-palette` |
| Chọn một workspace (tìm phía server + "Tải thêm"; `allLabel` = chế độ bộ lọc có dòng "Toàn hệ thống", `null` ⇒ bỏ chọn) — KHÔNG tự dựng Popover + ô tìm + truy vấn `/admin/workspaces` | `<WorkspacePicker value onChange allLabel? placeholder?>` (cần `workspace:view` — nơi dùng tự ẩn/giải thích khi thiếu) | `@/shared/widgets/workspace-picker` |

### Feedback / Overlay

| Cần làm | Dùng | Import |
|---------|------|--------|
| Hover hint | `<Tooltip>` | `@/shared/ui` |
| Click panel (filter, settings) | `<Popover variant="glass\|solid">` | `@/shared/ui` |
| Modal dialog | `<Modal>` | `@/shared/ui` |
| Form trong dialog | `<FormModal>` | `@/shared/ui` |
| Confirm / delete xác nhận | `<ConfirmDialog variant="confirm\|delete\|success\|warning\|info">` — nhãn nút mặc định theo mức (`info` = "Đồng ý"); biết ngữ cảnh thì truyền `actionLabel` cụ thể ("Đã hiểu"…), KHÔNG để "OK" | `@/shared/ui` |
| Toast notification | `showToast()` (utility) — kit2 Radix Toast bên dưới | `@/shared/utils/toast.utils` |

### Display / Data

| Cần làm | Dùng | Import |
|---------|------|--------|
| Status badge / pill / tag | `<Badge color="..." variant="tinted\|solid\|disabled">` | `@/shared/ui` |
| Status dot (chấm đỏ unread, online, ...) | `<Badge dot color="..." />` | `@/shared/ui` |
| Avatar người dùng | `<Avatar size="..." name="..." src="..." />` | `@/shared/ui` |
| Thumbnail / preview ảnh content | `<ImagePreview>` (object-cover, có lightbox) | `@/shared/ui` |
| Fullscreen viewer (zoom/rotate) | `<ImageLightbox>` | `@/shared/ui` |
| Ảnh hệ thống (logo, illustration) | `<Image name="..." />` (registry-based) | `@/shared/ui` |
| KPI / summary card | `<SummaryCard>` (gem icon + label + value) | `@/shared/ui` |
| Status panel (title + progress bars) | `<BoxInfo>` | `@/shared/ui` |
| Panel khung chuẩn (header + body scroll) | `<BoxPanel>` | `@/shared/ui` |
| KPI dày đặc cho dashboard strip | `<CompactKpiCard>` | `@/shared/ui` |
| Chip số liệu inline | `<SummaryPill>` | `@/shared/ui` |
| Chia đôi panel kéo thả được | `<Splitter>` | `@/shared/ui` |
| Khung viền HUD (màn hình lớn) | `<HudFrame>` / `<HudInfoBox>` | `@/shared/ui` |
| Card của màn dashboard (khung HUD + header + trạng thái) | `<PanelCard>` | `@/shared/ui` |
| Tải tệp (drag-drop + preview) | `<Upload>` (kèm `useUpload`) | `@/shared/ui` |
| Vẽ chú thích lên ảnh | `image-annotator` | `@/shared/ui/media/image-annotator` |
| Trạng thái rỗng | `<EmptyState>` · `<TableEmptyIllustration>` | `@/shared/ui` |
| Banner thông báo trong trang | `<Callout intent="info\|success\|warning\|error\|neutral">` | `@/shared/ui` |
| Đang tải | `<Spinner>` / `<Skeleton>` | `@/shared/ui` |
| Header panel chi tiết (master-detail) | `<DetailPanelHeader>` | `@/shared/ui` |
| Table | `<Table columns={...} data={...} pagination />` | `@/shared/ui` |
| Tree (hierarchical) | `<Tree>` | `@/shared/ui` |
| Đếm số động (dashboard) | `<AnimatedNumber value={n} />` | `@/shared/ui` |
| Bảng xếp hạng | `<RankingBoard data={...} />` | `@/shared/ui` |
| Bảng tự cuộn (kiosk/màn lớn) | `<ScrollBoard data={...} columns={...} />` | `@/shared/ui` |
| So sánh giá trị dạng thanh có trục | `<CapsuleChart data={...} />` | `@/shared/ui` |
| Gauge mức nước/tồn kho | `<LiquidGauge value={n} />` | `@/shared/ui` |
| Card ảnh chụp màn hình/thumbnail | `<CardScreenshort src={...} />` | `@/shared/ui` |
| Khung viền + nền thuần (thay `border border-border-1 bg-bg-1` gõ tay) | `<Surface>` | `@/shared/ui` |
| Tiêu đề trang (title + tab + back + actions — trên thanh header) | `<PageHeader>` (+ `useQueryTabNav`) — quy ước ở §3.4, KHÔNG `<TitleScreen>` | `@/shared/widgets/header` |
| Section/panel header bar | `<SectionHeader>` | `@/shared/ui` |
| Thanh tiến độ ngang (% hoàn thành) | `<Progress value={n} showValue />` | `@/shared/ui` |
| Vòng tròn tiến độ (% ở tâm) | `<ProgressCircle value={n} showValue />` | `@/shared/ui` |
| Màu theo mức % (dùng chung cho cả 2) | `progressVariantOf(percent)` | `@/shared/utils/style/progress.utils` |
| Horizontal/vertical separator | `<Divider>` | `@/shared/ui` |
| Khung ngoài 1 trang nội dung | `<PageShell>` | `@/shared/ui` |
| Vùng cuộn còn lại của trang (đi cặp `PageShell`) | `<PageBody>` | `@/shared/ui` |
| Toolbar lọc/hành động của trang | `<Toolbar>` | `@/shared/ui` |
| Lưới card tự responsive (khai `min` width) | `<BoxGrid min={...}>` | `@/shared/ui` |

### Typography

| Cần làm | Dùng | KHÔNG dùng |
|---------|------|------------|
| Heading semantic h1..h6 | `<Heading size="extraLarge\|large\|medium\|small\|tiny\|extraTiny" />` | `<h1 className="text-2xl font-bold">` |
| Inline text | `<Text size="..." weight="..." skin="..." />` | `<span className="text-sm font-medium text-neutral-5">` |
| Raw font class (khi không dùng được component) | `text-{scale}-{weight}` (vd `text-body-14-medium`) | `text-sm font-medium leading-5` |

### Icons

| Cần làm | Dùng | KHÔNG dùng |
|---------|------|------------|
| Render system icon | `<SystemIcon name="..." size={16} className="text-..." />` (mặc định `-outline`, `-bold` cho gem/KPI/overlay) | Inline `<svg><path/></svg>`, `import { CheckIcon }` |
| Gem-shaped icon container (dashboard KPI) | `<GemIcon color="..." size="..."><SystemIcon ... /></GemIcon>` | Tự tạo div + gradient |

---

## 2. Cho phép raw HTML — Trường hợp nào?

### ✅ Layout wrappers thuần (không có UI behavior)

```tsx
// ✅ OK — flex/grid container, không có visual/behavior riêng
<div className="flex items-center gap-3">
  <Button>...</Button>
  <Badge color="success">Active</Badge>
</div>

<section className="grid grid-cols-2 gap-4">
  <SummaryCard ... />
  <SummaryCard ... />
</section>

<div className="relative">
  <Button startIcon={<SystemIcon name="bell-bold" size={16} />} />
  <Badge dot color="error" className="absolute -top-0.5 -right-0.5" />
</div>
```

### ✅ Form root element

```tsx
// ✅ OK — <form> ngoài cùng, nội dung dùng kit2
<form onSubmit={handleSubmit(onSubmit)}>
  <Form ...>
    <TextField name="email" label="Email" />
    <FormActions>
      <Button type="submit" variant="primary">Lưu</Button>
    </FormActions>
  </Form>
</form>
```

### ⚠️ Custom trigger cho Menu/Popover (cần keyboard pattern)

Khi component `<Menu>` / `<Popover>` cần trigger phức tạp (avatar + text + caret combo) thì có thể dùng `<button>` raw — nhưng **bắt buộc**:
- `type="button"` rõ ràng
- `aria-label` đầy đủ
- Class merge qua `cn()` — KHÔNG chain Tailwind raw quá 4 token
- Nếu lặp lại ≥ 2 lần → extract thành local component memoized (xem `widget-composition.md §3`)

```tsx
// ⚠️ OK có điều kiện — trigger compound cho Menu
<Menu
  trigger={
    <button
      type="button"
      className={cn("flex items-center gap-2 rounded-md", "hover:bg-neutral-10/40")}
      aria-label="Menu người dùng"
    >
      <Avatar size="sm" name={name} src={src} />
      <Text size="small" weight="medium">{name}</Text>
      <SystemIcon name="angle-down-bold" size={12} className="text-neutral-3" />
    </button>
  }
  options={options}
/>
```

---

## 3. Kit2 Catalog — `@/shared/ui` (single source of truth)
> **Bảng phân nhóm chuẩn** nằm ở `kit2-architecture.md` §2. Mục này là catalog tra
> nhanh theo NHU CẦU; khi hai bên lệch nhau, `kit2-architecture.md` là bản đúng.


### 3.1 `primitives/` · `feedback/` · `actions/` · `inputs/` — nguyên tố

| Component | Props chính | Mục đích |
|-----------|------------|----------|
| `Button` | `variant: primary\|secondary\|stroke\|ghost` · `skin: base\|accent\|danger\|neutral` · `size: xl\|lg\|md\|sm\|xs` · `fullWidth` · `startIcon` · `endIcon` · `loading` | Mọi action button |
| `Text` | `size: extraLarge\|large\|medium\|small\|body\|tiny\|extraTiny` · `weight: normal\|medium\|bold` · `skin: standard\|muted\|primary\|success\|warning\|error\|disabled` | Inline text |
| `Heading` | `size: extraLarge\|large\|medium\|small\|tiny\|extraTiny\|micro\|nano` · `light: boolean` (default true) | Semantic heading |
| `Badge` | `color: primary\|secondary\|accent\|info\|success\|warning\|error\|neutral` · `variant: tinted\|solid\|disabled` · `size` · `dot: boolean` | Pill/dot status |
| `Avatar` | `size: 3xs\|2xs\|xs\|sm\|md\|lg\|xl\|xxl` · `shape: circle\|square` · `variant: auto\|brand` · `name` · `src` | Avatar + initials fallback |
| `Divider` | `orientation: horizontal\|vertical` · `variant: solid\|dashed\|dotted` | Separator |
| `Input` | `variant: glass\|outline\|filled\|ghost` · `size` · `invalid` · `clearable` · `startIcon` · `endIcon` | Text input |
| `Textarea` | `maxLength` · `showCount` · `minHeight` | Multi-line text |
| `Checkbox` | `checked` · `label` · `error` | Checkbox |
| `Toggle` | `size: sm\|md\|lg` · `label` · `labelPosition: left\|right` · `checked` | Switch |
| `Radio` + `RadioGroup` | `label` | Radio group |
| `Progress` | `value` · `max` · `variant: primary\|success\|warning\|error\|neutral` · `size: xs\|sm\|md\|lg` · `showValue` | Thanh tiến độ ngang |
| `ProgressCircle` | cùng trục `variant` / `size` với `Progress` · `showValue` (ẩn ở `xs`) · `label` | Vòng tiến độ, % ở tâm |
| `LiquidGauge` | `value` (0-100) | Đồng hồ đo mức kiểu "nước dâng" (SVG + CSS wave animation) |
| `SegmentToggle` | `options[]` (key,label?,icon?,badge?,disabled?) · `value` · `aria-label`/`aria-labelledby` (tên của cả nhóm nút — đặt khi không có nhãn hiển thị bên cạnh) | Segmented control |
| `NumberInput` | `value` · `min` · `max` · `step` · `onChange` | Ô nhập số (có nút tăng/giảm) |
| `ColorPalettePanel` | `value` · `preset[]` · `usedColors[]` · `onChange` | Bảng chọn màu preset |
| `ContextMenu` | `options[]` · `onSelect` · `children` | Menu chuột phải |
| `ThemeToggle` | — | Chuyển sáng / tối |
| `CopyableText` | `value` (chuỗi ĐẦY ĐỦ được chép) · `label` (tên gọi: "Job ID", "mã hội thoại") · `display?` (chữ hiện ra, mặc định `value` — đặt khi muốn bản rút gọn của id dài) | Mã/ID chữ mono bấm để chép; vùng `aria-live` báo "Đã chép <label>"; không nổi bọt lên hàng bảng chứa nó |
| `Spinner` | `size` | Trạng thái đang tải |
| `Skeleton` | `variant` · `width` · `height` · `rounded` · `className` | Khung xương chờ dữ liệu |
| `EmptyState` | `icon` · `iconColor` · `title` · `description?` · `action?` · `size` | Trạng thái rỗng |
| `TableEmptyIllustration` | — | Minh hoạ rỗng riêng cho `<Table>` |
| `Callout` | `intent: info\|success\|warning\|error\|neutral` · `variant: tinted\|ghost` · `icon?` · `title?` · `closable?` · `action?` (nút đi kèm, vd "Thử lại" khi tải lỗi — đừng nhét `<Button>` vào `description`) | Banner thông báo trong trang |

### 3.2 `selects/` · `pickers/` · `navigation/` · `data-display/` — hợp thành

| Component | Props chính | Mục đích |
|-----------|------------|----------|
| `Dropdown` | `variant: tick\|radio` · `options[]` · `value` · `searchable` · `aria-label` (bộ lọc không có nhãn hiển thị) | Single-select dropdown |
| `MultiSelect` | `options[]` · `value[]` · `searchable` · `aria-label` (bộ lọc không có nhãn hiển thị) | Multi-select |
| `Menu` | `trigger` · `options[]` · `onSelect` · `align` | Action menu |
| `Tooltip` | `content` · `side` · `align` · `arrow` · `delayDuration` | Hover tooltip |
| `Popover` | `content` · `variant: glass\|solid` · `side` · `align` · `modal` · `arrow` | Click popover |
| `Tabs` + `TabsPanel` | `options[]` · `value` · `aria-label` (tên dải tab — đặt khi trang có nhiều dải tab) | Tab navigation — dải tự CUỘN NGANG khi hẹp (nhãn không co, tab đang chọn tự cuộn vào tầm nhìn): KHÔNG tự bọc `overflow-x-auto` quanh nó |
| `Table` | `columns[]` · `data[]` · `pagination` · `currentPage` · `pageSize` · `total` · `onPageChange` | Data table (sortable, resizable, dnd-kit row drag) |
| `AnimatedNumber` | `value` | Số đếm động (DOM text, animate rAF khi giá trị thay đổi) — dùng cho số KPI dashboard |
| `CapsuleChart` | `data[]` | Thanh ngang có trục, so sánh nhiều giá trị (khác `Progress`: không giới hạn 100; khác `RankingBoard`: có trục) |
| `RankingBoard` | `data[]` | Bảng xếp hạng: số thứ tự + tên + thanh scale theo giá trị MAX trong tập dữ liệu (không phải theo 100) |
| `ScrollBoard` | `data[]` · `columns[]` | Bảng tự động cuộn — cho màn hình lớn/kiosk không cần chuột |
| `Pagination` | `pageIndex` · `pageCount` · `pageSize` · `total` · `onPageChange` · `onPageSizeChange` | Pagination |
| `Stepper` | `steps[]` · `activeStep` · `layout: horizontal-center\|horizontal-inline\|vertical` · `size: sm\|md` | Step indicator |
| `Tree` | `data[]` · `selectionMode: single\|multi` · `selectedIds` · `searchTerm` · `height` · `renderNode` · `renderTrailing` | Hierarchical tree |
| `DatePicker` | `mode: single\|range` · `value` · `range` · `format` · `minDate` · `maxDate` | Date picker wrapper |
| `SingleDatePicker` | `value` · `onChange` · `format` · `minDate` · `maxDate` · `disabled` · `error` | Single date |
| `RangeDatePicker` | `range` · `onRangeChange` · `showQuickSelect` · `quickSelectOptions` · `format` · `minDate` · `maxDate` | Date range (+ quick-select) |
| `Toast` + `ToastProvider` + `ToastViewport` | `type: success\|error\|warning\|info` · `title` · `description` · `closable` | Toast notification |
| `ImagePreview` | `src` · `size: sm\|md\|lg\|xl\|full` · `rounded: none\|sm\|md\|full` · `preview` · `fallback` | Thumbnail + lightbox |
| `ImageLightbox` | `open` · `onOpenChange` · `src` · `alt` | Fullscreen viewer |
| `DropdownTreeSelect` | `data[]` · `value` · `searchable` · `selectionMode` | Chọn từ cây phân cấp |
| `TimePicker` · `DateTimePicker` | `value` · `onChange` · `format` · `step` | Chọn giờ / ngày-giờ |
| `MonthYearStartPicker` · `MonthYearRangePicker` | `value` / `range` · `onChange` | Chọn tháng-năm (điểm / khoảng) |
| `ScrollEdgeNav` | `children` | Dải cuộn ngang có nút mép trái/phải |

### 3.3 `surfaces/` — mặt nền, panel, thẻ số liệu

| Component | Props chính | Mục đích |
|-----------|------------|----------|
| `BoxInfo` | `title` · `total?` (label,value) · `items[]` (label,value,percent,color) · `onClose?` | Status panel với progress bars |
| `BoxPanel` | `title` · `description?` · `variant` · `headerRight?` · `headerDivider?` · `footer?` · `headerClassName` · `bodyClassName` | Panel khung chuẩn (header + body có scroll nội bộ) |
| `SummaryCard` | `color: blue\|green\|yellow\|red\|gray` · `size` · `gemSize: xs\|sm\|md` (mặc định suy từ `size`) · `icon: BoldSystemIconName` · `label` · `value` · `description?` | KPI card |
| `CompactKpiCard` | `color: blue\|green\|yellow\|red\|gray` · `size` · `emphasis` · `layout: row\|stack` (stack = nhãn trên, số dưới — dải ≥ 5 thẻ) · `icon: BoldSystemIconName` · `label` · `value` · `unit?` · `trailing?` · `footer?` · `selected?` | KPI dày đặc cho dashboard strip |
| `SummaryPill` | `label` · `value` · `color?` | Chip số liệu inline |
| `HudFrame` + `HudInfoBox` | `tone` · `intensity: default\|cyber\|prime` · `weight: regular\|hairline` · `notch` · `corners` · `glow` · `scanlines` · `sweep` · `ticks` · `children` (`hud-frame-decor` là mảnh nội bộ, KHÔNG export ra barrel; `HudCorners` thì export riêng — dòng dưới) | Khung viền HUD cho màn hình lớn |
| `HudCorners` | `variant: bracket\|dot\|chamfer\|none` · `size` · `thickness` · `frame` · `inset` · `radius` · `glow` — overlay `absolute inset-0` theo cha `relative`/`fixed` | Bốn ngoặc góc (± khung viền) HUD, dùng khi CHỈ cần phần nhấn góc (vd nền màn xác thực); cần cả khung panel thì dùng `HudFrame` |
| `PanelCard` | `title` · `titleNote?` · `right?` · `onExpand?`/`expanded?` · `onClose?` · `footer?` · `tone` · `variant: hud\|overlay\|plain` · `density: compact\|default\|relaxed` · `frame: default\|cyber\|prime` · `frameWeight` · `sweep` · `notch` · `flushBody` · `loading` · `empty`/`emptyText` | Card của màn dashboard — khung HUD + header vạch chéo + trạng thái tải/rỗng + nút phóng to/đóng |
| `Splitter` | `orientation: horizontal\|vertical` · `initialSize` · `minSize` · `maxSize` · `onResize` · `deferResize` · `collapsed` | Chia đôi panel kéo thả được |
| `Surface` | — | Khung viền + nền thuần (`border border-border-1 bg-bg-1`) — dùng thay vì gõ tay class này lặp lại |
| `CardScreenshort` | `variant: default\|ghost\|solid` · `size: sm\|md\|lg\|xl\|full` · `aspect` · `rounded` · `overlay` | Card hiển thị ảnh chụp màn hình/thumbnail |

### 3.4 `layout/`

| Component | Props chính | Mục đích |
|-----------|------------|----------|
| `TitleScreen` | `icon` · `iconColor: TitleIconColor` (14 tông) · `title` · `subtitle?` · `titleTrailing?` · `summary?` · `right?` · `onBack?` · `brackets?` | Header có gem icon — chỉ còn cho showcase kit2 và kiểu `TitleIconColor` (= `tone` của `PageHeader`). ⛔ KHÔNG còn là mẫu tiêu đề trang — xem ghi chú dưới bảng |
| `SectionHeader` | `title` · `description?` · `right?` · `icon?` · `iconColor?` · `accent?` | Section/panel header bar (gradient) |
| `AppShell` | *(không nhận prop)* — chỉ dựng khung nền + `<Outlet />` | Khung vỏ ứng dụng cho route gốc |
| `PageShell` | `variant: scroll` | Khung ngoài của 1 trang nội dung — recipe `flex h-full min-h-0 flex-col gap-2` chuẩn |
| `PageBody` | `overflow` · `stack` | Vùng cuộn còn lại của trang, đi cặp với `PageShell` |
| `Toolbar` | `border` · `padding` | Thanh toolbar/filter của trang — cụm trái giãn+wrap (filter), cụm phải cố định (action) |
| `BoxGrid` | `min` · `gap` · `align` | Lưới card/panel — khai `min` width mỗi ô, số cột tự suy ra (khác `FormGrid` khai SỐ CỘT) |
| `DetailPanelHeader` | `title` · `subtitle?` · `right?` · `onBack?` | Header của panel chi tiết trong master-detail |

**⛔ Tiêu đề trang — `<PageHeader>` (`@/shared/widgets/header`), KHÔNG `<TitleScreen>`.**
`<PageHeader>` portal tiêu đề · tab · nút quay lại · action lên THANH HEADER (slot
`start` · `title` · `end`), không chiếm hàng nào trong thân trang. Bảng tên chỉ có
chữ (không icon) và là `<h1>` thật.

| Tình huống | Cách làm |
|------------|----------|
| Tiêu đề | `<PageHeader title="…" tone="…" />` là con ĐẦU TIÊN của `<PageShell>`. `tone` nhận đúng giá trị `iconColor` cũ (`TitleIconColor`) |
| Tab module ≤ 4 (URL `?tab=`) | Lên header: `nav={useQueryTabNav({ options, active, onSelect, resetKeys?, shortLabels?, minItems? })}`. Chip là link thật (`href`), chip đang mở mang `aria-current="page"` |
| Hơn 4 tab, hoặc tab giữ bằng state cục bộ | Ở lại thân trang dạng `<Tabs>` — vd Gamification, Cấu hình hệ thống, chi tiết Workspace, chi tiết Skill |
| Trang chi tiết | `titleSize="sm"` cho tên bản ghi · `onBack` + `backHref` (đúng path đích) + `backLabel` ("Về …") · badge trạng thái → `subtitle` ngắn · action vào `end` dạng `Button size="sm"`, tối đa 3 nút hiện, phần dư vào `Menu` (kit2) |
| Nhánh tải / lỗi / rỗng | Vẫn render `<PageHeader>` ở MỌI nhánh — thiếu ở nhánh nào, thanh header mất tiêu đề ở đúng trạng thái đó |
| Test | Render page riêng lẻ → bọc `HeaderSlotsHarness` (`@tests/shared/header-slots-harness`). Đi qua `routes` thật → header có sẵn, KHÔNG bọc thêm. Chip tab truy vấn role `link` + `current: 'page'`, không phải role `tab` |

### 3.5 `overlays/` — hộp thoại & lớp nổi

| Component | Props chính | Mục đích |
|-----------|------------|----------|
| `Modal` | `title` · `description` · `size: xs…6xl \| auto \| screen \| full` · `frame: default\|hud` · `showClose` · `footer` · `onConfirm` · `onCancel` · `noPadding` · `trigger` | Generic dialog |
| `ConfirmDialog` | `variant: confirm\|delete\|success\|warning\|info` · `title` · `description` · `icon?` · `actionLabel?` · `cancelLabel?` · `onConfirm` · `onCancel` · `trigger` | Confirm với GemIcon header |
| `FormModal` | `title` · `size: sm\|md\|lg\|xl` · `form: UseFormReturn` · `onConfirm` · `scrollable` · `readOnly` | Form trong dialog (auto handleSubmit) |
| `Drawer` | `side` · `size` · `resizable` · `open` · `onOpenChange` | Ngăn kéo trượt từ cạnh màn |
| `CustomModalLayout` | `header` · `body` · `footer` | Bố cục modal tự dựng khi `<Modal>` không đủ |

### 3.6 `icons/` + `media/`

| Component | Props chính | Mục đích |
|-----------|------------|----------|
| `SystemIcon` | `name: SystemIconName` (kebab-case, `*-bold` / `*-outline`) · `size: number` (default 16) | Render icon từ registry |
| `GemIcon` | `color: blue\|green\|yellow\|red\|gray` · `size: xs\|sm\|md` · `icon` · `children` | Isometric icon container |
| `Image` | `name: ImageName` · `alt: string` (required) · `width` · `height` · `fit: cover\|contain\|fill\|none\|scale-down` · `rounded` · `preview` | Ảnh từ registry |
| `Upload` | `variant` · `size` · `accept` · `maxSize` · `maxFiles` · `multiple` · `onFiles` · `onReject` | Vùng tải tệp (dùng kèm `useUpload`) |
| `Dropzone` · `FileBadge` · `FileCard` · `FileList` | — | Mảnh ghép của `Upload`, dùng riêng khi cần layout khác |
| `image-annotator` (`AnnotationLayer` · `flattenAnnotations`) | `source` · `fileName` · `initialShapes` · `onSave` · `onCancel` | Vẽ chú thích lên ảnh (canvas thuần, import sâu `@/shared/ui/media/image-annotator`) |

### 3.7 `form/` — Form system (RHF + Zod)

**Core:**
`Form` · `FormItem` · `FormActions` · `PasswordStrength`

**Hooks:**
`useZodForm` · `useFormField` · `useFieldA11y` · `useServerErrors` · `useAsyncValidation` · `useFormDraft` · `useDirtyGuard` · `useModalDateDefaults` · `useFormMeta`

**Fields (`form/fields/`) — 20 field:**

| Field | Loại data |
|-------|-----------|
| `TextField` | string |
| `EmailField` | string (email) |
| `PhoneField` | string (số điện thoại) |
| `IPAddressField` | string (IPv4) |
| `PasswordField` | string (masked) |
| `TextareaField` | string (multi-line) |
| `NumberField` | number |
| `MaskedField` | string (formatted) |
| `SelectField` | single option |
| `MultiSelectField` | multi options |
| `CheckboxField` | boolean |
| `ToggleField` | boolean |
| `RadioGroupField` | enum value |
| `DateField` | single date |
| `TimeField` | string (giờ) |
| `DateRangeField` | { from, to } |
| `AsyncSelectField` | option (loaded from API) |
| `CascadeSelectField` | parent → child option |
| `FileField` | File / File[] |
| `ColorPickerField` | string (hex) |

> ⚠️ Root barrel `@/shared/ui` hiện **thiếu** `TimeField` và `PasswordStrength`
> (chúng chỉ có ở `@/shared/ui/form`). Đây là lỗ thủng barrel cần vá ở `src/`,
> KHÔNG phải chỗ để nới luật import sâu.

**Layout (`form/layout/`):**
`FormSection` · `FormGrid` · `FormRow` · `FieldArray` · `NestedFieldArray` · `DictionaryField` · `FormTabs` · `SortableFieldArray`

**Patterns (`form/patterns/`):**
`ConditionalField` · `DynamicSchemaField` · `FormStepper`

---

## 4. Shared Hooks (`@/shared/hooks`)

> Chia theo chức năng: `state/` · `dom/` · `input/` · `table/`.
> **LUÔN** import qua `@/shared/hooks`, KHÔNG import sâu vào nhóm.

| Hook | Mục đích |
|------|----------|
| `useDisclosure()` | Open/close cho Modal / Popover / Drawer |
| `usePagination(options)` | Pagination state |
| `useQueryParams(config?)` | ⛔ Filter / search / page / tab sống trên URL (xem `api-patterns.md`) |
| `useNavHref()` | Dựng URL cho tab `?tab=` mà giữ nguyên param lọc khác |
| `useLocalStorage(key, default)` | Persist state localStorage |
| `useNowTick(ms)` | Đồng hồ re-render theo nhịp |
| `useEventCallback(fn)` | Callback identity ổn định |
| `useDeleteWithConfirm(...)` | Xoá + ConfirmDialog + toast, gộp 1 chỗ |
| `useClickOutside(handler)` | Click outside detection |
| `useCopyToClipboard()` | Copy clipboard |
| `useBeforeUnload(when)` | Cảnh báo khi rời trang lúc đang dở việc |
| `useMultiTabSync(channel, cb)` | Đồng bộ trạng thái giữa nhiều tab |
| `useNetworkStatus()` | Online / offline + `wasOffline` |
| `useElementSize()` | Đo kích thước phần tử (tuple `[ref, size]`) |
| `useDrawerResize()` | Kéo đổi bề rộng Drawer |
| `useMediaQuery(query)` / `useFullscreen()` | Responsive query · toàn màn hình |
| `useDebounce(value, delay)` | Debounce cho filter / query |
| `useImeSafeSearchInput(value, onChange)` | ⛔ Ô tìm kiếm IME-safe (xem `ime-safe-input.md`) |
| `useArrowFieldNav()` | ⛔ Đi giữa các ô nhập bằng mũi tên (xem `keyboard-navigation.md`) |
| `useSaveShortcut(onSave)` | Ctrl/⌘ + S |
| `useTvEscapeHatch()` | Thoát TV mode bằng bàn phím |
| `useTableFilter(...)` / `useTableSort(...)` | Lọc / sắp xếp bảng |
| `useRowSelection(...)` | Chọn dòng (+ `useClearRowSelectionOnOutsideClick`) |
| `useDetailExpand(...)` | Mở rộng dòng chi tiết |

---

## 5. Shared Utilities (`@/shared/utils`)

| Utility | Import | Mục đích |
|---------|--------|----------|
| `cn()` | `@/shared/utils/style/cn` | Merge Tailwind class (BẮT BUỘC khi compose className) |
| `formatDate()` · `formatNow()` · `formatRelativeTime()` | `@/shared/utils/format/format.utils` | Ngày → chuỗi hiển thị |
| Cộng/trừ, so sánh, phân tích ngày | `dayjs` (đã là dependency) | Base KHÔNG bọc lại — dayjs đã đủ và mọi picker của kit2 đang dùng chính nó |
| `formatCurrency()` · `formatNumber()` · `formatDate()` · `formatRelativeTime()` · `formatPercent()` | `@/shared/utils/format/format.utils` | Formatting |
| `showToast()` · `showToastByCode()` | `@/shared/utils/toast.utils` | Toast notification |
| `getThemeColor()` | `@/shared/utils/style/color.utils` | Get hex từ color token (cho chart canvas) |
| `stripDiacritics()` | `@/shared/utils/format/string.utils` | Bỏ dấu tiếng Việt |
| `pxToRem()` · `pxToRemString()` | `@/shared/utils/style/responsive.utils` | px → rem |

---

## 6. Shared Types & Constants

```ts
// API
import type { ApiResponse, PaginationMeta, Paginated, Maybe, Nullable, IdName } from '@/shared/types/api.types';
import type { Option, ActionResult } from '@/shared/types/common.types';

// Constants
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, ROLES } from '@/shared/constants/consts';
import { ERROR_CODE_MESSAGES, HTTP_STATUS_MESSAGES } from '@/shared/constants/error-codes';
```

---

## 7. Core Services

| Module | Import | Mục đích |
|--------|--------|----------|
| `apiClient` | `@/core/api/client` | HTTP (đã có interceptors) |
| `queryClient` | `@/core/config/query-client` | React Query client |
| `useAuthStore` | `@/app/store` | Auth state |
| `extractErrorMessage()` | `@/core/api/error.handler` | Extract error message |

---

## 8. KHÔNG ĐƯỢC — Danh sách đen

```tsx
// ❌ Raw UI element
<button onClick={...}>Lưu</button>
<input type="text" value={...} />
<select><option>...</option></select>
<textarea />
<table><tr><td>...</td></tr></table>

// ❌ Inline SVG / direct import icon component
<svg viewBox="..."><path d="..." /></svg>
import { CircleCheckBoldIcon } from "@/assets/icons";

// ❌ Raw <span> cho badge/dot
<span className="px-2 py-1 rounded-full bg-error text-neutral-0">3</span>
<span className="w-2 h-2 rounded-full bg-error absolute -top-1 -right-1" />

// ❌ Raw <div> cho card/panel
<div className="rounded-lg bg-bg-1 border border-border-1 p-4">
  <h3>Tiêu đề</h3>
  <p>Mô tả</p>
</div>

// ❌ Hardcoded color / raw font utility
<p className="text-sm font-medium text-[#94A3B8]">Label</p>
<div style={{ backgroundColor: '#0F172A' }}>...</div>

// ❌ Custom toggle/modal/dropdown thay vì kit2
const [open, setOpen] = useState(false); // dùng useDisclosure
<MyButton />     // dùng <Button>
<MyLoading />    // dùng <Spinner> hoặc Button loading state
mergeClasses(...) // dùng cn()
clsx(...)         // dùng cn()
twMerge(...)      // dùng cn()
window.alert(...)   // dùng <ConfirmDialog>
window.confirm(...) // dùng <ConfirmDialog>

// ✅ ĐÚNG — DUY NHẤT: showToast() từ shared utils (kit2 Radix Toast bên dưới)
import { showToast, showToastByCode } from '@/shared/utils/toast.utils';
showToast('success', 'Lưu thành công');
showToast('error', 'Lỗi', { description: 'Chi tiết lỗi', duration: 5000 });
showToastByCode('RESOURCE_NOT_FOUND');
```

```tsx
// ✅ ĐÚNG — luôn qua kit2
<Button variant="primary" onClick={...}>Lưu</Button>
<Input value={...} onChange={...} />
<Dropdown options={...} value={...} />
<Textarea />
<Table columns={...} data={...} />

<SystemIcon name="circle-check-bold" size={16} className="text-success" />

<Badge color="error" variant="solid">3</Badge>
<Badge dot color="error" className="absolute -top-0.5 -right-0.5" />

<SummaryCard color="blue" icon="house-bold" label="Tổng dự án" value={42} />

<Text size="small" weight="medium" skin="muted">Label</Text>

const { isOpen, open, close } = useDisclosure();
```

---

## 9. Workflow trước khi viết JSX (Checklist)

1. **Nhu cầu là form control / action / display / overlay?**
   → Tra **§1 HTML → Kit2 Decision Table**
2. **Có component kit2 đúng concept?**
   → REUSE. Done.
3. **Gần giống nhưng thiếu variant/size?**
   → EXTEND: thêm key vào `tv()` recipe của component đó (xem `kit2-architecture.md §6`)
4. **Không trùng concept với bất kỳ component nào?**
   → CREATE theo checklist `kit2-architecture.md §9` (Adding a New Component)
5. **Chỉ là layout wrapper (flex/grid container)?**
   → `<div>` / `<span>` / `<section>` raw OK — KHÔNG cần kit2
6. **Đang sửa widget (`src/shared/widgets/`)?**
   → Đọc `widget-composition.md` — token tập trung qua `*.theme.ts` + `tv()` recipe

---

## Chart Infrastructure — `@/shared/charts`

**`@/shared/charts` là nguồn DUY NHẤT cho hạ tầng chart** (density, token color, 
utility). Mỗi feature KHÔNG tự khai constants, phải import từ shared.

---

## 10. Cross-references

- Kit2 scale + decision tree → `kit2-architecture.md`
- Widget token centralization → `widget-composition.md`
- Color tokens → `color-system.md`
- Font tokens → `font-system.md`
- Icon registry → `icon-conventions.md`
- Tailwind / `cn()` → `tailwind-conventions.md`
- Performance / memoization → `code-optimization.md`
- Chart infrastructure → `chart-conventions.md` (§1.1 bộ 5 file)
