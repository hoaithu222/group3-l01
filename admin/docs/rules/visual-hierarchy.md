# Visual Hierarchy & Density Rules (BẮT BUỘC)

> Áp dụng cho **mọi page, panel, card, bảng, form** trong `src/features/**`.
> Mục tiêu: thông tin **quan trọng** nổi bật trước, thông tin **phụ trợ** lùi
> sau — sửa 1 chỗ → toàn page đồng bộ. Vi phạm các quy tắc đánh dấu **⛔**
> → **block merge**.

---

## 0. Nguyên tắc tối cao — Hierarchy 3 cấp

```
PRIMARY     →  cái user CẦN xem ngay (KPI tổng, action chính, kết quả).
                Diện tích lớn, font đậm, màu nhấn (-5), border-2/shadow.
SECONDARY   →  context / chi tiết hỗ trợ PRIMARY (label, axis, sub-total).
                Diện tích vừa, font medium, màu neutral-2/3.
TERTIARY    →  metadata / control phụ (filter, hint, tooltip).
                Nhỏ, font normal, màu neutral-4/5.
```

**Quy tắc cứng:**
- 1 page CHỈ có 1-2 vùng PRIMARY (nhiều hơn = mất focus, vi phạm).
- PRIMARY luôn **chiếm > 50%** diện tích viewport nội dung chính.
- SECONDARY KHÔNG được nổi bật bằng/hơn PRIMARY (font weight ≤ PRIMARY, opacity ≤ 100%).

---

## 1. ⛔ Padding & Gap Scale — MAX DENSITY (BẮT BUỘC)

> **Triết lý CỨNG:** nội dung là TẤT CẢ, whitespace là **kẻ thù**. Càng ít padding
> càng tốt. Tham khảo Bloomberg Terminal, TradingView, VPS SmartOne — trader chuyên
> nghiệp KHÔNG dung túng padding to. Mỗi pixel phải phục vụ nội dung.

### 1.1. ⛔ QUY TẮC VÀNG — Layout `p-2`, Page/Inner `p-2`

```
LAYOUT  →  px-2 (8px)    ← lề NGANG — BackgroundLayout <main> CUNG CẤP, CHỈ 1 lần
           py-2 (8px)    ← đệm DỌC của <main> — tiêu đề trang đã lên thanh header
           (+ đệm đáy chừa Dock khi Dock ghim — DOCK_CONTENT_CLEARANCE_CLASS)
PAGE    →  KHÔNG padding ← Page outer thừa vì main đã có lề
INNER   →  p-2  (8px)    ← Panel/card/section body (dense)
GAP     →  gap-2 (8px)   ← Mọi khoảng cách default
INLINE  →  gap-1 (4px)   ← button group / badge cluster

HEIGHT: page outer BẮT BUỘC `h-full flex flex-col` — fill parent (main)

EXCEPTION (justify PR):
  p-3  (12px)   ← modal body size=md, form section
  p-4  (16px)   ← auth card, empty state (page cần isolate)
```

Lề `<main>` lấy từ `SHELL_GUTTER_X` / `SHELL_GUTTER_Y` (`src/shared/constants/layout.ts`) — 8px
bốn phía ở MỌI chế độ, BẰNG khe `gap-2` giữa panel (lề = khe, theo `vci-sun-pms-fe`: các panel
xếp thành một lưới đều tới tận mép). Đổi ở đó, page KHÔNG tự bù. Dock `fixed` ở đáy vẽ ĐÈ lên
nội dung, nên khi Dock ghim `<main>` nhận thêm đệm đáy `DOCK_CONTENT_CLEARANCE_CLASS`
(`@/shared/widgets/dock`, chọn theo `useDockDisplayMode()`) — page KHÔNG tự chừa chỗ cho Dock.

**Ngoài `p-2`, `p-3`, `p-4` KHÔNG có mức khác cho app UI.**  
Sai = block merge.

### 1.2. Bảng full — áp dụng thực tế

| Ngữ cảnh | Padding | Gap | Ghi chú |
|---------|---------|-----|---------|
| **Page outer wrapper** | `p-2` (8px) | `gap-2` (8px) | ⛔ MẶC ĐỊNH — không p-4 nữa |
| **Panel / card / section body** | `p-2` (8px) | `gap-2` (8px) | Default cho MỌI container nội dung |
| **Panel header** (SectionHeader) | `py-1.5 px-2` | `gap-2` | Compact, không lấn body |
| **Grid dashboard** (nhiều panel) | (parent `p-2`) | `gap-2` | Panel con có border, không cần gap to |
| **KPI strip / stat card** | `p-2` | `gap-2` | Số nổi, padding tối thiểu |
| **Table cell** | `px-2 py-1.5` | — | Compact cứng |
| **Inline cluster** (button group, badge) | `px-1.5` | `gap-1` | Sát nhau, dense scan |
| **Modal body** — `size="sm"` | `p-2` | `gap-2` | Compact |
| **Modal body** — `size="md"/"lg"` (EXCEPTION) | `p-3` | `gap-2` | Modal cần breathing nhẹ |
| **Form field row** (EXCEPTION) | (parent `p-2`) | `gap-3` | Hit-target flex — DUY NHẤT ngoại lệ gap |
| **Auth page card** (EXCEPTION) | `p-4` | `gap-3` | User focus 1 form |
| **Tooltip / popover compact** | `px-2 py-1` | `gap-1.5` | Nhỏ, ephemeral |

### 1.3. ⛔ BAN LIST — revert / block merge

| ❌ Class BỊ CẤM | Lý do | ✅ Thay bằng |
|-----|------|------|
| `p-4` mặc định cho page outer | Wasteful whitespace — user muốn dense | `p-2` |
| `p-3` cho content (trừ modal md+) | Nửa vời — không compact, không breathe | `p-2` |
| `p-5` (20px) | Lãng phí | `p-2` |
| `p-6` (24px) | Nội dung nhỏ trong biển trắng | `p-2` |
| `p-8` (32px) | Quá xa nội dung | `p-2` |
| `p-10` `p-12` `p-16` `p-20` | KHÔNG BAO GIỜ | `p-2` — max `p-4` |
| `gap-3` (12px) trừ Form field | Không nhất quán | `gap-2` |
| `gap-4` (16px) | Panel bị rời rạc | `gap-2` |
| `gap-6` `gap-8` `gap-10+` | Rất sai | `gap-2` |
| Arbitrary `p-[13px]` `gap-[10px]` `p-[20px]` | Off-scale | `p-2` / `p-3` / `p-4` chỉ |
| `gap-x-4 gap-y-2` (lệch trục) | Rối nhịp | `gap-2` cùng 2 chiều |
| `space-y-4` `space-x-4` (lớn hơn 2) | Wasteful | `space-y-2` / `space-x-2` |

### 1.4. Nested padding — CẤM tăng ngược

```
✅ ĐÚNG                       ❌ SAI
Page   p-2                    Page  p-2
 └─ Panel  p-2                 └─ Panel  p-4   (TĂNG = violation)
     └─ Card   p-2                 └─ Card    p-6   (nặng)
         └─ Cell p-1.5
```

Nested luôn **≤ parent**. Mặc định: MỌI cấp `p-2` phẳng.

### 1.5. Ví dụ page skeleton chuẩn — copy-paste

```tsx
// ✅ ĐÚNG — max density
<div className="flex h-full flex-col gap-2 p-2">        {/* OUTER p-2 gap-2 */}
  <PageHeader title="…" tone="…" />                      {/* portal lên thanh header, không chiếm hàng */}
  <FilterBar className="p-2" />                          {/* p-2 */}
  <div className="grid flex-1 min-h-0 grid-cols-3 gap-2">   {/* gap-2 giữa panel */}
    <Panel className="p-2" />                            {/* p-2 */}
    <Panel className="p-2" />
    <Panel className="p-2" />
  </div>
</div>

// ❌ SAI — quá thoáng
<div className="flex h-full flex-col gap-4 p-6">        {/* p-6 + gap-4 = violation nặng */}
  <div className="grid gap-4 p-4">                      {/* p-4 nested + gap-4 = SAI */}
    <Panel className="p-4" />                            {/* p-4 panel body = SAI */}
  </div>
</div>
```

### 1.6. Ngoại lệ được duyệt sẵn (phải justify trong PR)

| Case | Padding cho phép | Lý do |
|------|------------------|-------|
| Auth pages (login/register/forgot) | `p-4` card, `p-3` inputs | User focus 1 form, cần breathing |
| Modal `size="md"`/`"lg"` body | `p-3` OK | Content pop-out cần margin |
| Empty state (icon + text center) | `p-4` OK | Trạng thái đặc biệt, không content dense |
| Landing / marketing page | `p-4` `p-6` OK | Không phải app UI (chỉ nếu có) |
| Form field row với label bên | `gap-3` OK | Hit-target UX |

**MỌI ngoại lệ khác** phải comment trong code + justify trong PR description.

### 1.7. Tại sao MAX density?

1. **User đọc nhanh** — mắt không quét vùng trắng
2. **Fit nhiều thông tin hơn** — PMS dashboard: ≥ 6 KPI + 3 chart + table cùng viewport
3. **Chuẩn ngành trading/enterprise** — Bloomberg, TradingView, VPS: `p-2` khắp
4. **Mobile-friendly** — dense scale xuống mobile không cần media query
5. **Feel "pro"** — enterprise/trading UI = dense; airy = landing marketing

---

## 2. ⛔ Border System (BẮT BUỘC)

### 2.1. Bảng quy chuẩn — chỉ dùng các bước này

| Ngữ cảnh | Border | Color token |
|---------|--------|-------------|
| **Page-level panel** (BoxPanel ngoài cùng) | `border-2` | `border-border-2` |
| **Section / sub-panel** trong panel | `border` (1px) | `border-border-1` |
| **Active state** (item đang chọn) | `border-2` + shadow ring | `border-primary-5` + `shadow-[0_0_0_1px_var(--color-primary-5)]` |
| **Highlight current** (tháng/năm hiện tại) | `border-2` | `border-warning-5` |
| **Table header bottom** | `border-b border-2` | `border-border-2` |
| **Table row divider** | `border-t` (1px) | `border-border-1` |
| **Subtle separator** trong card | `border-t` (1px) | `border-border-1` |
| **Input default** | `border` (1px) | `border-border-1` |
| **Input focus** | `border-2` + ring | `border-primary-5` + `ring-1 ring-primary-5` |

### 2.2. ⛔ KHÔNG được phép

| ❌ Sai | ✅ Đúng |
|-------|--------|
| `border-border-1/40` `border-border-1/60` (faded — khó scan) | `border-border-1` (1px) hoặc `border-2 border-border-2` (2px) |
| `border-4` `border-8` (quá dày, lãng phí pixel) | `border-2` tối đa |
| Trộn radius: `rounded-md` panel + `rounded-xl` card trong | Default vuông góc (xem `tailwind-conventions.md`) |
| Border `border-primary-5/25` mờ cho active | `border-primary-5` rõ + `bg-[color-mix(...)]` tint nhẹ |

---

## 3. ⛔ Visual Hierarchy — Khi nào element nào To/Đậm/Nổi?

### 3.1. Diện tích (Size)

| Element | Width / Height | Khi nào |
|---------|---------------|---------|
| **KPI dominant** (1-3 cái / page) | grid cell **2x-3x** row khác · min-h `120-160px` | Số liệu user CẦN xem 1 phát |
| **KPI strip** (4-8 thẻ ngang) | grid cell đều · `h-20` đến `h-24` | Snapshot tổng quát |
| **Chart chính** | flex-1 chiếm space còn lại · min-h `360px` | Trục chính của analysis |
| **Chart phụ** (mini, sparkline) | `h-[60-140px]` | Trend / context |
| **Table chi tiết** | flex-1 fill · scroll nội bộ | Lookup chi tiết |
| **Filter / control bar** | `h-8` đến `h-10` shrink-0 | KHÔNG được chiếm > 10% chiều cao panel |

### 3.2. Font weight & color hierarchy

| Cấp | Heading | Body | Color |
|-----|---------|------|-------|
| **PRIMARY** | `text-h4-bold` / `text-h3-bold` | `text-body-16-bold` | `text-fg-1` hoặc tone -5 (primary-5/success-5/...) |
| **SECONDARY** | `text-body-14-bold` (uppercase) | `text-body-14-semibold` | `text-fg-2` / `text-neutral-2` |
| **TERTIARY** | `text-caption-12-medium uppercase` | `text-caption-12` | `text-fg-3` / `text-neutral-4` |
| **METADATA** | — | `text-caption-10 uppercase tracking-wider` | `text-fg-4` / `text-neutral-5` |

### 3.3. Numbers — BẮT BUỘC `tabular-nums`

Mọi số liệu (KPI value, table cell, axis, chart label) PHẢI có:
- `tabular-nums` (cùng width cho mỗi chữ số → cột số thẳng)
- Hậu tố unit RÕ RÀNG (`tỷ`, `%`, `m²`, `ngày`) — KHÔNG để user đoán

```tsx
// ✅ ĐÚNG
<span className="tabular-nums text-body-16-bold" style={{ color: TT_COLOR }}>
  {formatTotal(value, unit)} <span className="text-caption-12 text-neutral-4">tỷ</span>
</span>

// ❌ SAI — không tabular (cột số so le), không unit
<span className="text-body-16">{value}</span>
```

### 3.3.1. ⛔ SỐ KHÔNG DÙNG FONT MONO — `.num-mono` ĐÃ XOÁ

Recipe `.num-mono` / `.num-mono-light` (JetBrains Mono + weight 600) đã **gỡ khỏi
toàn bộ codebase** và **xoá định nghĩa** trong `globals.css`. Số dùng ĐÚNG font
sans của app; căn cột là việc của `tabular-nums`, không cần font mono.

Lý do đầy đủ + bảng đối chiếu → `chart-conventions.md §1.8`. Tóm tắt:

- Số mono cạnh nhãn sans trong cùng một dòng đọc ra như hai hệ chữ ghép vào nhau.
- Ở cỡ 10–12px, JetBrains Mono nét MỎNG hơn sans → nhoè, đúng thứ nó định chống.
- `.num-mono` khoá `font-weight: 600` trong CSS rule → nuốt `weight` của
  component, và nuốt cả SVG presentation attribute (`fontWeight={700}`).

```tsx
// ❌ SAI — class đã xoá; viết lại là dựng lại đúng recipe vừa gỡ
<span className="num-mono tabular-nums">{value}</span>
<span className="num-mono-light">{value}</span>
<span className="font-mono tabular-nums">{value}</span>   // ép mono bằng đường vòng

// ✅ ĐÚNG
<span className="tabular-nums text-fg-1">{value}</span>
```

`font-mono` CHỈ còn dùng cho chuỗi KHÔNG phải số liệu — IP, độ phân giải, mã/ID,
đoạn cấu hình, `<kbd>`. Dấu hiệu: **đi kèm `tabular-nums` nghĩa là SỐ → bỏ
`font-mono`.**

### 3.4. Hover tooltip cho data dày — BẮT BUỘC

Mọi cell trong bảng chứa số đã được rút gọn (integer/truncate) → BẮT BUỘC có
`title` attribute với giá trị đầy đủ + context:

```tsx
<td
  className="tabular-nums"
  title={`KH · ${group.short} · ${month}: ${fmtFullDecimal(value)} đơn vị`}
>
  {fmtTableInt(value)}
</td>
```

**Lý do:** dashboard density cao → user cần xem chi tiết KHÔNG ROI mouse vào row riêng.

---

## 4. ⛔ Highlight & Active State Rules

### 4.1. Bậc highlight

| Cấp | Pattern | Khi nào |
|-----|---------|---------|
| **L1 — Selected** (1 item active) | `border-2 border-primary-5` + `bg-[color-mix(in_srgb,var(--color-primary-5)_18%,transparent)]` + `shadow-[0_0_0_1px_var(--color-primary-5),0_0_20px_-4px_...]` | User chọn 1 trong list |
| **L2 — Current** (tháng/năm/period hiện tại) | `border-2 border-warning-5` + `bg-[color-mix(in_srgb,var(--color-warning-5)_10%,transparent)]` + shadow glow warning | Marker "you are here" |
| **L3 — Hover** | `hover:bg-[color-mix(in_srgb,var(--color-primary-5)_6%,transparent)]` + `hover:border-primary-5/60` | Mouse over |
| **L4 — Focused** (input) | `focus:border-primary-5` + `focus:ring-1 focus:ring-primary-5` | Keyboard focus |

### 4.2. ⛔ KHÔNG được trộn

- KHÔNG dùng selected + current cùng 1 element (visual conflict). Ưu tiên L1 selected.
- KHÔNG có "active" mờ (vd `border-primary-5/25` `bg-primary-5/8`) — user phải thấy ngay.
- Hover state KHÔNG được mạnh hơn selected (vd hover `bg-primary-5/30` > selected `bg-primary-5/18` → loạn).

---

## 5. ⛔ Page Layout Skeleton (BẮT BUỘC)

### 5.1. Page route content

```tsx
const FeaturePage = memo(() => {
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <FeatureHeader />                              {/* shrink-0 */}
      <FeatureKpiRow />                              {/* shrink-0 — optional */}
      <div className="min-h-0 flex-1 overflow-auto">
        {/* Tab content / main content */}
      </div>
    </div>
  );
});
```

### 5.2. Tab / nested content (full-height)

```tsx
const FooTab = memo(() => (
  <div className="grid h-full min-h-0 grid-cols-[300px_1fr] gap-3 overflow-hidden">
    <LeftPanel />     {/* h-full overflow-hidden */}
    <RightPanel />    {/* h-full overflow-hidden */}
  </div>
));
```

### 5.3. Panel với scroll nội bộ (BẮT BUỘC pattern)

```tsx
<BoxPanel
  className="h-full overflow-hidden border-2 border-border-2"
  headerClassName="shrink-0 px-2 py-1.5"
  bodyClassName="flex min-h-0 flex-col gap-2 p-2"
>
  <div className="shrink-0">{/* Toolbar / filter — không scroll */}</div>
  <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
    {/* Long content — scroll nội bộ */}
  </div>
</BoxPanel>
```

### 5.4. ⛔ Anti-patterns layout

| ❌ Sai | ✅ Đúng |
|-------|--------|
| Page wrapper thiếu `h-full flex-col` | Luôn `flex h-full flex-col` + child `min-h-0 flex-1` |
| Magic `max-h-[calc(100vh-420px)]` | `flex-1 min-h-0` + `overflow-y-auto` |
| Panel có scroll page lẫn scroll nội bộ (double scroll) | Panel `overflow-hidden`, scroll CHỈ ở body cuối |
| Header KHÔNG `shrink-0` → bị co khi content dài | Header BẮT BUỘC `shrink-0` |
| Body KHÔNG `min-h-0` → flex không co được | Body BẮT BUỘC `min-h-0` khi parent flex |

---

## 6. ⛔ Information Density per Region

### 6.1. Tỉ lệ vùng theo cấp

| Cấp page | Diện tích PRIMARY | SECONDARY | TERTIARY |
|---------|------------------|-----------|----------|
| Dashboard / analytics | ≥ 60% | 25-35% | ≤ 10% |
| Form / wizard | ≥ 70% (form fields) | 15-20% (preview/help) | ≤ 10% |
| List / table page | ≥ 75% (table) | 15-20% (filter sidebar) | ≤ 10% |
| Detail page | ≥ 60% (content) | 25-30% (sidebar meta) | ≤ 10% |

### 6.2. Nhồi không gian — RULE OF 3

Trong 1 panel (region), tối đa **3 mức** nội dung cùng cấp:

```
✅ ĐÚNG — 3 cấp rõ:
   [Title bold]
     [Sub-section label]
       [Data row]

❌ SAI — 5 cấp lồng:
   [Title]
     [Sub-title]
       [Sub-sub-title]
         [Sub-sub-sub-title]
           [Data]
```

Nếu cần > 3 cấp → tách thành panel/tab/dialog riêng.

---

## 7. Checklist trước khi commit page/panel

### Layout / Height
- [ ] Page wrapper: `flex h-full flex-col p-4 gap-4`
- [ ] Tab content: `h-full min-h-0 overflow-hidden`
- [ ] Panel: `h-full overflow-hidden border-2 border-border-2`
- [ ] Panel header: `shrink-0`
- [ ] Panel body: `min-h-0 flex-1` + `overflow-y-auto` nếu cần scroll
- [ ] KHÔNG còn `calc(100vh-...)` magic number trong code

### Padding / Gap
- [ ] Chỉ dùng scale `1, 1.5, 2, 2.5, 3, 4` — KHÔNG arbitrary `p-[13px]`
- [ ] Nested padding giảm dần (`p-4` → `p-3` → `p-2` → `p-1.5`)
- [ ] Cùng panel dùng cùng `gap-N` (không trộn `gap-4` + `gap-1`)

### Border
- [ ] Panel ngoài cùng: `border-2 border-border-2`
- [ ] Section trong panel: `border border-border-1`
- [ ] KHÔNG còn `border-border-1/40` `/60` faded
- [ ] Active state: `border-2 border-primary-5` + shadow ring

### Hierarchy & Density
- [ ] 1-2 vùng PRIMARY rõ (KPI dominant / chart chính)
- [ ] PRIMARY chiếm ≥ 50% diện tích viewport
- [ ] Mỗi cell số có `tabular-nums` — và KHÔNG có `num-mono` / `font-mono` (§3.3.1)
- [ ] Mỗi cell số dày dữ liệu có `title` tooltip full decimal + unit
- [ ] Tối đa 3 cấp nội dung lồng nhau

### Charts (link sang `chart-conventions.md`)
- [ ] Bar chart có `<LabelList formatter={labelInt}>` (integer + thousand separator)
- [ ] LabelList có `stroke="var(--color-bg-base)" strokeWidth={3} paintOrder="stroke"`
- [ ] Tooltip có `formatter` đầy đủ decimal + unit
- [ ] Series color = scale `-5` từ `CHART_COLORS`

---

## 8. ⛔ Compound Layout Patterns (BẮT BUỘC khi lặp lại ≥ 2 nơi)

### 8.1. Filter Bar (segment + dropdown)

Khi 1 page có **SegmentToggle (scope) + Dropdown (category)** đứng cạnh nhau làm
filter cho dashboard / panel dữ liệu, BẮT BUỘC layout chuẩn:

```tsx
<div className="flex items-center gap-2">
  <SegmentToggle
    options={SCOPE_OPTIONS}
    value={scope}
    onChange={setScope}
    className="min-w-[280px]"   // ⛔ tối thiểu — KHÔNG hardcode `w-[300px]`
  />
  <Dropdown
    options={categoryOptions}
    value={category}
    onValueChange={setCategory}
    className="min-w-[148px]"
  />
</div>
```

**Quy tắc:**
- `gap-2` (KHÔNG `gap-3` `gap-4`)
- SegmentToggle: `min-w-[280px]` (cho phép grow — KHÔNG fixed `w-[300px]`)
- Dropdown: `min-w-[148px]`
- KHÔNG bọc `<div className="w-[300px]">` raw — dùng className prop của Kit2

### 8.2. Data Sidebar Selection (nhóm / danh mục / phân loại)

Sidebar cột trái chứa list item chọn-1, body chính cập nhật theo selection:

```tsx
<aside className="flex h-full min-w-[240px] flex-col overflow-hidden border-2 border-border-2 bg-bg-1">
  <header className="shrink-0 bg-bg-2 px-3 py-2.5">
    <Text size="tiny" weight="bold" className="uppercase tracking-wide text-fg-1">
      {sidebarLabel}
    </Text>
    <Text size="extraTiny" className="text-fg-4">
      {count} mục
    </Text>
  </header>
  <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
    {items.map((item) => (
      <SidebarItem key={item.id} {...item} selected={item.id === selectedId} />
    ))}
  </div>
</aside>
```

**Item pattern (selected state — L1 theo §4):**

```tsx
<Button
  variant={selected ? 'primary' : 'ghost'}
  className={cn(
    'w-full justify-start border-2 px-3 py-2',
    selected
      ? 'border-primary-5 bg-[color-mix(in_srgb,var(--color-primary-5)_18%,transparent)]'
      : 'border-border-1 bg-bg-1 hover:border-primary-5/60'
  )}
  onClick={() => onSelect(item.id)}
>
  {item.label}
</Button>
```

**⛔ KHÔNG:**
- KHÔNG raw `<button>` cho sidebar item — dùng Kit2 `<Button variant="ghost">`
- KHÔNG sidebar width < 240px (label bị cắt)
- KHÔNG sidebar width > 320px (lấn body) — trừ khi rich content (avatar + meta)
- KHÔNG quên `min-h-0` ở body container → list không scroll được

### 8.3. Detail Modal KPI Grid (3 cột)

Modal chi tiết (theo kỳ / theo mục) có **3 KPI tổng quan ở đầu**:

```tsx
<Modal title={title} size="lg" {...rest}>
  {/* 1. KPI grid — PRIMARY, chiếm không gian lớn */}
  <div className="grid grid-cols-3 gap-3">
    <CompactKpiCard color="blue"   icon="…-bold" label="…" value={kpi1} unit="…" />
    <CompactKpiCard color="green"  icon="…-bold" label="…" value={kpi2} unit="…" />
    <CompactKpiCard color="yellow" icon="…-bold" label="…" value={kpi3} unit="…" />
  </div>

  {/* 2. Chart hoặc Table — SECONDARY */}
  <div className="mt-4">
    <PlanActualChart ... />
  </div>

  {/* 3. Detail list / breakdown — TERTIARY */}
  <div className="mt-3">
    <DetailTable ... />
  </div>
</Modal>
```

**Quy tắc:**
- KPI grid: **luôn** `grid grid-cols-3 gap-3` (KHÔNG `gap-4` — modal compact)
- Tối đa 3 KPI cards top (4+ → chuyển sang KPI strip horizontal)
- Khoảng cách giữa 3 region: `mt-4` (KPI→Chart), `mt-3` (Chart→Detail)
- KPI value PHẢI có `unit` prop hiển thị bên cạnh (tỷ / mục / người …)

---

## 9. Cross-references

- Chart visual + label rules → `chart-conventions.md` (§3.2.5 mandatory bar label)
- Color tokens → `color-system.md`
- Font tokens → `font-system.md`
- Border radius default vuông → `tailwind-conventions.md`
- Component reuse (Kit2) → `reuse-first.md`
- Clean code (1 file = 1 component) → `clean-code-standards.md`

---

## 10. Khi vi phạm

- Border faded `/40` `/60` → fail review
- Magic `p-[13px]` `calc(100vh-…)` → fail review
- Bar chart không có LabelList → **block merge** (xem chart-conventions §3.2.5)
- Số liệu KHÔNG `tabular-nums` trong bảng/KPI → fail review
- Dựng lại `.num-mono` / gắn `font-mono` cho SỐ → **revert** (§3.3.1)
- 4+ cấp nội dung lồng → **revert**, tách panel
- PRIMARY chiếm < 30% diện tích → **revert** (mất focus)
