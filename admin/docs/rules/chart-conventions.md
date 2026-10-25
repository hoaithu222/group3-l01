# Chart & Dashboard Conventions (BẮT BUỘC)

> Áp dụng cho **mọi chart Recharts** + **mọi dashboard / command-center / màn hình lớn**
> trong `src/features/**`. Mục tiêu: chart đồng bộ visual với hệ thống token,
> dashboard layout fit viewport (hạn chế scroll), padding gọn, sửa 1 chỗ → đổi
> toàn bộ. Vi phạm các quy tắc đánh dấu **⛔** → **block merge**.

---

## 0. Stack & quy tắc tối cao

| Layer                        | BẮT BUỘC                                                                          | KHÔNG                                                |
| ---------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Chart library                | **Recharts**                                                                      | KHÔNG dùng chart.js, nivo, victory, apexcharts       |
| Color                        | Token qua `tokenVar()` → `var(--color-*)`                                         | KHÔNG hex / oklch / rgb hardcode                     |
| Font (axis, legend, tooltip) | font-size px **chỉ trong recharts props**, lấy từ thang mật độ §1.5 — phần khác dùng `text-{scale}` | KHÔNG `text-sm`/`text-xs` raw cho UI bên ngoài chart; KHÔNG hardcode `fontSize` |
| Section wrapper              | Kit2 `<SectionHeader>` hoặc local section component                               | KHÔNG raw `<div>` + tự build header                  |
| KPI card                     | `<CompactKpiCard>` (kit2)                                                         | KHÔNG raw `<div>` card / KHÔNG fork Hud-card style   |
| Icon trong chart UI          | `<SystemIcon name="...-bold" />`                                                  | KHÔNG inline `<svg>` / import icon component trực tiếp                 |

---

## 1. ⛔ Token contract — KHÔNG NEGOTIABLE

### 1.1. Hạ tầng chart — `@/shared/charts` là nguồn DUY NHẤT

⛔ Feature **KHÔNG** tự khai palette / thang mật độ / helper token. Mọi thứ import
từ `@/shared/charts`. Fork ra feature = drift ngay lần sửa bug đầu tiên.

| File | Chứa | Vì sao tách |
|------|------|-------------|
| `constants/chart-palette.constants.ts` | `CHART_SERIES_TOKENS`, `CHART_SEMANTIC`, `CHART_STATUS`, `CHART_CHROME` | Nguồn màu DUY NHẤT (§1.2) |
| `constants/chart-density.constants.ts` | `ChartDensity`, `CHART_DENSITY_SCALE`, breakpoints | Bảng cỡ chữ/nét theo bậc (§1.5) |
| `utils/chart-tokens.ts` | `tokenVar`, `tokenVarAlpha`, `tokenAtStep`, `areaGradientPair`, `seriesTokenAt`, `labelInt`, `fmt3`, `barSizeByCount` | Helper thuần, không phụ thuộc React |
| `utils/chart-style.utils.ts` | `chartDensityFor(height)`, `buildChartStyles(density)` | Sinh style object theo bậc |
| `utils/chart-axis.utils.ts` · `chart-center-label.utils.ts` · `chart-arc-label.utils.ts` | Trục, nhãn tâm donut, nhãn cung | Tính toán hình học dùng lại |
| `hooks/useChartMetrics.ts` | Đo vùng vẽ → chọn bậc → trả style | Mắt xích làm "phóng to = đọc rõ hơn" |

Cái feature ĐƯỢC phép tự khai: `constants/{feature}.constants.ts` (ánh xạ
`CHART_COLORS` cho series của riêng nó, §1.2) và `mock/` + `types/` (§4).

Helper màu bắt buộc giữ nguyên chữ ký:

```ts
export function tokenVar(token: string): string {
  return `var(--color-${token})`;
}

export function tokenVarAlpha(token: string, alpha: number): string {
  const pct = Math.round(Math.max(0, Math.min(1, alpha)) * 100);
  return `color-mix(in srgb, var(--color-${token}) ${pct}%, transparent)`;
}

/** Đổi BẬC, giữ nguyên hue: 'info-5' + 6 → 'info-6'. Dùng dựng gradient §1.3. */
export function tokenAtStep(token: string, step: number): string {
  return `${token.replace(/-\d+$/, '')}-${step}`;
}
```

**Quy tắc:**

- KHÔNG fork tooltip / legend / axis style giữa các chart
- Đổi visual tooltip / legend → **chỉ sửa `buildChartStyles`** → tất cả chart đồng bộ
- KHÔNG khai `fontSize` bằng số trực tiếp trong file chart (xem §1.5)

### 1.5. ⛔ Thang cỡ chữ & nét theo MẬT ĐỘ — KHÔNG hardcode `fontSize`

**Vấn đề của cách cũ (hằng số `fontSize: 10`):** cỡ chữ không phụ thuộc kích
thước vùng vẽ, nên bấm **xem toàn màn hình chỉ giãn khoảng trắng — chữ và nét y
nguyên**, phóng to không hề giúp đọc rõ. Trên màn TV/4K phòng điều hành, 10px
gần như không đọc nổi từ xa. Đây là lỗi hệ thống, không phải lỗi từng chart.

Chart **PHẢI** đo chính mình rồi lấy bậc tương ứng. Luôn truyền `uiScale` từ
`useDisplayStore(selectEffectiveUiScale)` — quên tham số này thì chart lờ
luôn chế độ TV (mặc định `uiScale = 1`), xem `tv-display-mode.md §4`:

```tsx
const uiScale = useDisplayStore(selectEffectiveUiScale);
const [chartRef, m] = useChartMetrics<HTMLDivElement>(uiScale);

<div ref={chartRef} className="h-full w-full">
  <ResponsiveContainer width="100%" height="100%">
    <LineChart …>
      <CartesianGrid {...m.grid} vertical={false} />
      <XAxis tick={m.axisTick} axisLine={m.axisLine} tickLine={false} />
      <YAxis tick={m.axisTick} width={m.scale.yAxisWidth} axisLine={false} tickLine={false} />
      <Tooltip contentStyle={m.tooltip} itemStyle={m.tooltipItem} labelStyle={m.tooltipLabel} />
      <Legend wrapperStyle={m.legend} />
      <Line strokeWidth={m.scale.lineWidth} dot={{ r: m.scale.dotRadius }} />
    </LineChart>
  </ResponsiveContainer>
</div>
```

Bậc chọn theo **chiều cao thực của vùng vẽ** (đã trừ header + padding panel):

| Bậc | Chiều cao | axis | legend | tooltip | nhãn cột | nét line | YAxis width |
|-----|-----------|------|--------|---------|----------|----------|-------------|
| `compact` | < 200px | 11 | 11 | 12 / 11 | 11 | 2 | 36 |
| `base` | 200–359px | 12 | 12 | 13 / 12 | 13 | 2 | 42 |
| `large` | 360–519px | 14 | 13 | 14 / 13 | 15 | 3 | 50 |
| `xlarge` | ≥ 520px | 16 | 15 | 16 / 15 | 18 | 4 | 58 |

**Quy tắc cứng:**

- **Sàn 11px.** Dưới mức đó chữ mất nét trên nền tối có gradient. `fontSize={9}`
  hay `fontSize={10}` trong file chart → **block merge**.
- **Nét thẳng (line, grid, leader) phải SỐ NGUYÊN.** Nét lẻ (2.5, 3.5) bị trình duyệt 
  khử răng cưa thành vệt xám 2px — hình chart trông "chưa nét". `dotRadius` được phép lẻ 
  (bán kính hình tròn). Giữ cứng: `lineWidth` ∈ `[2, 2, 3, 4]`, `gridWidth` luôn `1` ở MỌI bậc, kể cả TV (lưới là chrome, phải lùi sau dữ liệu).
- KHÔNG viết `fontSize` bằng số trong file chart — luôn qua `m.scale.*`.
- Chart nào cũng phải có `ref` đo được; quên `ref` thì chart kẹt ở bậc mặc định.
- Chart HERO lấp trọn trang (cao vì BỐ CỤC, không phải vì người dùng bấm phóng to)
  chặn trần bằng tham số thứ hai: `useChartMetrics(uiScale, 'large')` — không thì trên
  laptop nó tự nhảy `xlarge` (trục 16px, nét 4px) và chữ trục to hơn cả chữ bảng. Xem
  `features/dashboard/components/ActivityTrendChart.tsx`.
- ⛔ **Nhãn số trên chart KHÔNG ép font mono.** Dùng `tabular-nums` (căn cột số)
  + weight 600, font để KẾ THỪA font sans của app. Xem §1.8.

### 1.6. ⛔ Lưới và trục phải NHÌN THẤY ĐƯỢC

```tsx
// ❌ SAI — alpha 8%, gần như vô hình ở cả 2 theme
<CartesianGrid stroke={tokenVar('divider-white-10')} />

// ✅ ĐÚNG — border-1 (#DDE6EF sáng / #345677 tối)
<CartesianGrid {...m.grid} />   // stroke = CHART_CHROME.grid = 'border-1'
```

Lưới là mốc để người đọc ước lượng giá trị. Lưới không nhìn thấy = chart chỉ còn
là hình trang trí. `divider-white-10` (alpha 8%) chỉ dùng cho separator trang
trí, **KHÔNG** cho lưới/trục/track.

### 1.7. ⛔ KHÔNG tô CHỮ bằng màu series

```tsx
// ❌ SAI — success-5 #00E676 làm màu chữ trên bg-base sáng: contrast ~1.5:1
<text fill={tokenVar('success-5')} fontSize={12}>{pct}%</text>

// ✅ ĐÚNG — chữ dùng foreground; danh tính màu series nằm ở chấm/cung/nét
<text fill={tokenVar('fg-1')} fontSize={m.scale.pieLabel}>{pct}%</text>
<circle fill={tokenVar('success-5')} r={3} />
```

Token `-5` sinh ra để tô MẢNG và NÉT, không phải để làm màu chữ. Chữ tô màu
series fail WCAG ở light theme trong hầu hết trường hợp.

### 1.8. ⛔ SỐ KHÔNG DÙNG FONT MONO — `.num-mono` ĐÃ BỊ XOÁ

Recipe `.num-mono` / `.num-mono-light` (JetBrains Mono, weight 600, slashed-zero)
từng được áp cho **mọi** con số của app — KPI, ô bảng, nhãn chart, mốc thời gian.
Đã **gỡ khỏi toàn bộ codebase** và **xoá định nghĩa** trong `globals.css`.

**Vì sao bỏ:**

| Vấn đề | Hệ quả thấy được |
| ------ | ---------------- |
| Số mono nằm cạnh nhãn sans trong CÙNG một dòng | Đọc ra như hai hệ chữ ghép vào nhau — nhãn "Còn lại:" font sans, số "4,45 tỷ" font mono |
| JetBrains Mono ở cỡ 10–12px | Nét MỎNG hơn font sans cùng cỡ trên nền tối → chữ số nhoè, đúng thứ nó định chống |
| `.num-mono` khoá cứng `font-weight: 600` trong một CSS rule | Nuốt sạch `weight` của component; SVG presentation attribute (`fontWeight={700}`) xếp DƯỚI CSS rule nên bị bỏ qua — đã gây bug mất tín hiệu "lát active" ở donut Máy thiết bị |
| Digit mono rộng ~0.6em | Cùng một con số chiếm nhiều bề ngang hơn — tốn chỗ ở đúng chỗ khan hiếm nhất (ô bảng, nhãn chart) |

**Thay bằng gì:** `tabular-nums`. Đó mới là thứ giải quyết vấn đề thật (cột số
thẳng hàng) và nó **không đụng tới font-family lẫn font-weight**.

```tsx
// ❌ SAI — class đã xoá, viết lại là dựng lại đúng recipe vừa gỡ
<span className="num-mono tabular-nums text-fg-1">{value}</span>
<span className="num-mono-light">{value}</span>

// ❌ SAI — ép mono cho SỐ bằng đường vòng
<text fontFamily="var(--font-mono)" fontSize={12}>{value}</text>
<span className="font-mono tabular-nums">{value}</span>
<LabelList style={{ fontFamily: 'var(--font-mono)' }} />

// ✅ ĐÚNG — số dùng font sans của app, chỉ căn cột bằng tabular-nums
<span className="tabular-nums text-fg-1">{value}</span>
<LabelList {...m.barLabel} />   // m.barLabel KHÔNG còn fontFamily
```

**`font-mono` còn được dùng ở đâu?** CHỈ cho chuỗi KHÔNG PHẢI số liệu, nơi mono
mang nghĩa thật: địa chỉ IP, độ phân giải, mã/ID, đoạn cấu hình, phím tắt `<kbd>`.
Dấu hiệu nhận biết: **hễ đi kèm `tabular-nums` thì đó là SỐ → bỏ `font-mono`.**

### 1.2. ⛔ `CHART_COLORS` constants — CHỈ DÙNG SCALE `-5`

Tất cả series màu **PHẢI** declare trong `constants/{feature}.constants.ts` và
**BẮT BUỘC chỉ chọn token thuộc scale `-5`** từ palette dưới đây. KHÔNG dùng
`-3`/`-4`/`-6`/`-7`… cho chart series — gây xung đột tone giữa các dashboard.

#### Palette CHART chuẩn (13 token series)

> ⛔ **Hex dưới đây được đối chiếu với `src/shared/theme/colors.generated.ts`
> (dark theme) ngày 2026-08-02.** Source of truth là file generated đó, KHÔNG
> phải bảng này. Sửa màu → sửa `colors-theme.json` → `npm run generate:colors`
> → cập nhật lại bảng này. **KHÔNG BAO GIỜ chép hex từ bảng này vào code.**
>
> Lưu ý bẫy đặt tên: `primary` trong hệ này là **XANH LÁ**, không phải cyan.
> Hệ **không có họ `cyan`** — vai trò cyan do `secondary` / `teal` / `sky` đảm nhiệm.
> 4 cặp alias trùng hex 100%: `blue`=`info` · `red`=`error` · `green`=`success` · `yellow`=`accent`.

| Token         | Hex       | Vai trò gợi ý                 |
| ------------- | --------- | ----------------------------- |
| `primary-5`   | `#22C55E` | Series chính / nhấn (xanh lá) |
| `secondary-5` | `#22B5D8` | Series cyan                   |
| `accent-5`    | `#FFB700` | Highlight (label, milestone)  |
| `indigo-5`    | `#818CF8` | Series cool                   |
| `purple-5`    | `#A855F7` | Series violet (premium)        |
| `teal-5`      | `#2DD4BF` | Series mint (operations, ESG) |
| `fuchsia-5`   | `#E879F9` | Series magenta                |
| `pink-5`      | `#F472B6` | Series pink (nhân sự)         |
| `azure-5`     | `#0284C7` | Series azure (baseline)  |
| `success-5`   | `#00E676` | Success / actual / approved   |
| `info-5`      | `#1A94FF` | Info / planned / baseline     |
| `warning-5`   | `#FC820A` | Warning / pending / forecast  |
| `error-5`     | `#FF424E` | Error / overdue / risk-high   |

Ví dụ chuẩn:

```ts
export const CHART_COLORS = {
  // Cặp kế hoạch / thực tế (đường luỹ kế, baseline vs actual)
  planned: 'info-5', // info-5 (baseline / kế hoạch)
  actual: 'success-5', // success-5 (thực tế)
  forecast: 'warning-5', // warning-5 (dự báo)

  // Phân nhóm dữ liệu (nhóm A / B / C)
  groupA: 'azure-5',
  groupB: 'warning-5',
  groupC: 'purple-5',

  // Risk / status
  riskHigh: 'error-5',
  riskMed: 'warning-5',
  riskLow: 'success-5',

  // Cost
  budget: 'info-5',
  spent: 'primary-5',
  approved: 'success-5',
  pending: 'warning-5',
  overdue: 'error-5',
} as const;

/** Donut palette — xoay vòng (chỉ tokens -5). */
export const DONUT_TOKENS = [
  'primary-5',
  'success-5',
  'warning-5',
  'error-5',
  'purple-5',
  'teal-5',
] as const;
```

Dùng trong chart:

```tsx
<Line stroke={tokenVar(CHART_COLORS.planned)} />
<Bar fill={tokenVar(CHART_COLORS.groupA)} />
```

**KHÔNG được phép:**

```tsx
// ❌ SAI — magic string ngoài constants
<Bar fill={tokenVar('primary-5')} />

// ❌ SAI — dùng scale ≠ 5 cho series
export const CHART_COLORS = {
  planned: 'sky-4',     // ⛔ KHÔNG — phải là *-5
  budget:  'sky-7',     // ⛔ KHÔNG — phải là *-5
  actual:  'blue-4',    // ⛔ KHÔNG — phải là *-5
};

// ❌ SAI — hex / oklch / rgb hardcode
<Bar fill="#60A5FA" />
<Line stroke="oklch(0.78 0.11 75)" />

// ✅ ĐÚNG
<Bar fill={tokenVar(CHART_COLORS.groupA)} />  // CHART_COLORS.groupA = 'azure-5'
```

> **Ngoại lệ duy nhất** chấp nhận scale ≠ 5: `border-1`, `fg-*`, `bg-*` cho axis,
> grid, tooltip surface (xem §1.1) — đây là **chrome** của chart, không phải
> series data.

### 1.3. ⛔ Tô MẢNG LỚN trên nền tối — gradient cùng hue `-6 → -5`

**Vấn đề đo được:** trên nền navy (`bg-chart #03101F` / `bg-1 #0A1D30`), token
`-5` có lightness OKLCH ~0.72–0.85 — vượt xa dải an toàn 0.48–0.67 của dark mode
(`teal-5` L=0.785 · `sky-5` L=0.754 · `secondary-5` L=0.717 · `accent-5` L=0.825).
Contrast rất cao (7–12:1) nhưng đó CHÍNH LÀ vấn đề: mảng lớn ở L>0.75 gây
**bloom/halation** — nhoè cạnh, chói, mỏi mắt khi nhìn lâu trên màn hình lớn.

| Vai trò của màu | Dùng bậc | Ví dụ |
| --------------- | -------- | ----- |
| **Mảng lớn** (cung donut, thân bar, area fill) | gradient `-6` → `-5` cùng hue | `<stop offset="62%" stopColor={tokenVar('info-6')} /><stop offset="100%" stopColor={tokenVar('info-5')} />` |
| **Danh tính series** (config, legend dot, text giá trị) | `-5` | `CHART_COLORS.x = 'info-5'` |
| **Hover / active / stroke mảnh** | `-5` | `stroke={tokenVar('info-5')}` |

Cách dựng gradient từ token `-5` có sẵn (KHÔNG khai thêm token vào config):

```tsx
const family = color.replace(/-\d+$/, '');   // 'info-5' → 'info'
<radialGradient id={id} cx="50%" cy="50%" r="50%">
  <stop offset="62%"  stopColor={tokenVar(`${family}-6`)} />
  <stop offset="100%" stopColor={tokenVar(`${family}-5`)} />
</radialGradient>
```

**Quy tắc cứng:**
- Gradient **CHỈ đổi bậc, KHÔNG đổi hue** — biên độ tối đa 2 bậc (`-7`→`-5`).
  Gradient đa hue (vd `#1d54f7 → #68eaf9`) phá vỡ danh tính màu của series.
- Điều này **KHÔNG vi phạm §1.2**: config vẫn khai `-5`, `-6` chỉ là biến thể
  render của chính token đó.

### 1.4. ⛔ Cyan/teal là TÔNG THƯƠNG HIỆU, không phải DẢI PHÂN LOẠI

Đã kiểm bằng ΔE + mô phỏng mù màu: dải "thuần xanh"
`teal-6 → secondary-6 → azure-5 → blue-5 → indigo-6` **FAIL** từ lát thứ 4
(`azure-5 #0284C7` ↔ `secondary-6 #0F88A6` chỉ ΔE 5.5 — mắt thường cũng khó phân biệt).

- Muốn dashboard "tông xanh" → cho xanh giữ **slot 1** (series chính) và
  **slot cuối** ("Khác"), chèn hue XA vào giữa.
- Dải 6 slot đã kiểm PASS (ΔE mù màu ≥ 13.5, contrast ≥ 3:1 trên navy):
  `teal-6 · indigo-6 · accent-7 · pink-6 · blue-5 · primary-6`.
- **Trần 8 series.** Quá 8 → gom "Khác", KHÔNG sinh hue thứ 9.
- **Thứ tự slot là cơ chế an toàn màu, KHÔNG được xáo.** Filter bỏ series thì
  series còn lại GIỮ NGUYÊN màu, không tô lại theo thứ hạng mới.

---

## 2. ⛔ Chart skeleton chuẩn (Recharts)

### 2.1. Wrapper

Mọi chart `.tsx` file PHẢI:

```tsx
import { useChartMetrics } from '@/shared/charts';
import { useDisplayStore, selectEffectiveUiScale } from '@/app/store';

const FooChart = memo(function FooChart() {
  const data = useMemo(() => MOCK_FOO, []);
  const uiScale = useDisplayStore(selectEffectiveUiScale);
  const [chartRef, m] = useChartMetrics<HTMLDivElement>(uiScale);

  return (
    <div ref={chartRef} className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <SomeChart
          data={data}
          margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
        >
          {/* … */}
        </SomeChart>
      </ResponsiveContainer>
    </div>
  );
});

export default FooChart;
```

**Quy tắc:**

- `<ResponsiveContainer width="100%" height="100%">` — chart luôn fill parent
- Wrapper `<div ref={chartRef} className="h-full w-full">` — vừa cho parent chiều
  cao xác định, vừa là thứ `useChartMetrics` ĐO để chọn bậc mật độ. Quên `ref` là
  chart kẹt ở bậc mặc định, phóng to không làm chữ to lên.
- `margin.left = -20` để legend / Y-axis không thừa khoảng trắng trái
- `margin.bottom = 0` mặc định (legend tự padding 4px top)
- `data` luôn `useMemo` từ mock / props — KHÔNG inline

> **Mọi ví dụ từ đây trở xuống giả định `m`** là giá trị thứ hai của
> `useChartMetrics()` trong chính component đó.

### 2.2. Axis

```tsx
<XAxis
  dataKey="day"
  tick={m.axisTick}
  tickLine={false}
  axisLine={m.axisLine}
  interval={4}  // tránh nhồi nhét tick trên dataset dài
/>
<YAxis
  tick={m.axisTick}
  tickLine={false}
  axisLine={false}
  width={m.scale.yAxisWidth}   // theo bậc mật độ — KHÔNG số cứng
  tickFormatter={(v) => `${v}%`}  // hoặc unit khác
/>
```

**KHÔNG:**

- Đặt `tickLine={true}` (mặc định tick line chật)
- Quên `width={m.scale.yAxisWidth}` khi YAxis có tickFormatter — chart thừa whitespace trái

### 2.3. CartesianGrid

```tsx
<CartesianGrid
  {...m.grid}
  vertical={false} // line chart / area chart — chỉ ngang
  // horizontal={false} // horizontal bar — chỉ dọc
/>
```

### 2.4. Tooltip

```tsx
<Tooltip
  contentStyle={m.tooltip}
  itemStyle={m.tooltipItem}
  labelStyle={m.tooltipLabel}
  cursor={{ fill: tokenVarAlpha('primary-5', 0.08) }} // bar/area
  // hoặc
  cursor={{ stroke: tokenVar('primary-5'), strokeWidth: 1 }} // line
  formatter={(v: number) => `${v} tỷ`} // optional unit format
/>
```

### 2.5. Legend

```tsx
<Legend
  wrapperStyle={m.legend}
  // donut: layout="vertical" verticalAlign="middle" align="right" iconType="circle"
  // line:  iconType="line"
/>
```

---

## 3. Loại chart cụ thể

### 3.1. ⛔ Donut / Pie — Stroke giữa slice

**Mặc định KHÔNG có vách ngăn đen** giữa các slice. Set `stroke="none"`:

```tsx
<Pie
  data={data}
  dataKey="value"
  nameKey="name"
  cx="38%" // center bên trái nếu có center-label, hoặc "50%"
  cy="50%"
  innerRadius="56%"
  outerRadius="86%"
  stroke="none" // ⛔ KHÔNG stroke giữa slice
  strokeWidth={0}
  paddingAngle={0} // 0 = liền mạch; nếu cần khoảng nhỏ thì 1
>
  {data.map((slice) => (
    <Cell key={slice.name} fill={tokenVar(slice.colorToken)} />
  ))}
</Pie>
```

**Khi nào thêm stroke / paddingAngle:**

| Tình huống                     | Stroke                           | paddingAngle |
| ------------------------------ | -------------------------------- | ------------ |
| Mặc định (no separator)        | `"none"`                         | `0`          |
| Cần phân tách rõ slice nhỏ     | `tokenVar('bg-1')` strokeWidth 1 | `1-2`        |
| Slice quá ít (≤ 2) — KHÔNG cần | `"none"`                         | `0`          |

### 3.1.5. ⛔ Donut TỈ LỆ (progress ring) — track ring BẮT BUỘC

Áp dụng cho donut chỉ có 2 lát "đạt / thiếu" (vòng tiến độ 1 chỉ tiêu).

**KHÔNG tô lát "thiếu" bằng màu nền** (`bg-2`/`bg-3`): trên card cùng tông,
phần thiếu tàng hình → **mọi donut trông như đạt ~100%**. Thay bằng **track
ring**: 1 `<Pie>` phủ 360° vẽ TRƯỚC, và lát "thiếu" để `transparent`.

```tsx
{/* Track — CHROME, cố ý contrast thấp (không mang dữ liệu) */}
<Pie data={[{ value: 1 }]} dataKey="value"
     innerRadius="64%" outerRadius="92%"
     fill={tokenVar('divider-1')} stroke="none" strokeWidth={0}
     isAnimationActive={false} />

{/* Cung dữ liệu — phần còn lại trong suốt để track lộ qua */}
<Pie data={[{ key:'done', value: num }, { key:'rest', value: den - num }]}
     dataKey="value" innerRadius="64%" outerRadius="92%"
     stroke="none" strokeWidth={0} cornerRadius={3}
     startAngle={90} endAngle={-270}
     style={{ filter: `drop-shadow(0 0 5px ${tokenVarAlpha(color, 0.45)})` }}>
  <Cell fill={`url(#${gradId})`} />
  <Cell fill="transparent" />
</Pie>
```

| Thuộc tính | Giá trị | Vì sao |
| ---------- | ------- | ------ |
| `innerRadius` / `outerRadius` | `64%` / `92%` | Vành đủ dày để lát nhỏ đọc được; chừa lề cho glow + vùng hit. **KHÔNG `80%/100%`** (vành mảnh 12px + chạm mép SVG) |
| Track fill | `divider-1` | Chrome — cố ý dưới 3:1. Vành RỖNG đọc ra "0%", vành MẤT đọc ra "lỗi" |
| `cornerRadius` | `2–4` | >8 làm méo lát nhỏ và vỡ vùng hit tooltip. Donut < 80px → `0` |
| Cung dữ liệu | gradient `-6`→`-5` (§1.3) | Chống bloom |
| Glow | **đúng 1 phần tử**, cùng màu series | Glow đại trà = bloom, mất hết cạnh. KHÔNG dùng bóng xám `rgba(40,40,40,…)` |

**Trạng thái bắt buộc có:**

| Trạng thái | Hiển thị |
| ---------- | -------- |
| Mẫu số = 0 | CHỈ track ring + `—` (`fg-5`) + caption "Chưa có dữ liệu". Khoá hover |
| Đang refetch kỳ mới | **Giữ nguyên hình cũ ở `opacity-50`** — KHÔNG nháy skeleton, KHÔNG hiện 0% (đọc nhầm là dữ liệu thật) |
| Có dữ liệu | `%` ở tâm + `đạt/tổng` **kèm ĐƠN VỊ** (người / thiết bị / hồ sơ…) |

**Chú giải phải nói thật:** ô màu "Thiếu" trong tooltip/legend BẮT BUỘC dùng
đúng màu track (`divider-1`). Chú giải một màu mà vành vẽ màu khác → legend nói dối.

### 3.2. Center label cho Donut

```tsx
<div className="relative h-full w-full">
  <ResponsiveContainer>
    <PieChart>
      <Pie cx="38%" cy="50%" ...>{cells}</Pie>
      <Legend layout="vertical" verticalAlign="middle" align="right" iconType="circle" />
    </PieChart>
  </ResponsiveContainer>
  <div
    className="pointer-events-none absolute inset-y-0 left-0 grid place-items-center"
    style={{ width: '38%' }}  // match cx
  >
    <div className="flex flex-col items-center text-center">
      <Text size="extraTiny" className="uppercase tracking-wider text-fg-4">
        {totalLabel}
      </Text>
      <Heading size="medium" className="text-fg-1 tabular-nums">
        {total.toLocaleString('vi-VN')}
      </Heading>
      <Text size="extraTiny" className="text-fg-4">
        {totalUnit}
      </Text>
    </div>
  </div>
</div>
```

**Quy tắc:** width của overlay = % của cx để label center đúng vào tâm donut.

### 3.2.5. ⛔ Bar / Line CHART luôn HIỂN THỊ SỐ — Integer label + Decimal tooltip

Mục tiêu: **user nhìn 1 phát thấy số liệu** (kiểu chart chứng khoán), không cần
hover. Hover chỉ để xem chi tiết.

#### Quy tắc cứng

| Chart type                  | Trên đỉnh element (LabelList)             | Trên hover (Tooltip)  |
| --------------------------- | ----------------------------------------- | --------------------- |
| `<Bar>` (luôn)              | **BẮT BUỘC** integer + thousand separator | Decimal đầy đủ + unit |
| `<Line>` lũy kế / KPI chính | Khuyến nghị (số nguyên) — bỏ khi quá dày  | Decimal đầy đủ + unit |
| `<Line>` mini sparkline     | Bỏ (chỉ trend, không cần số)              | Decimal đầy đủ + unit |
| `<Area>` stacked            | Bỏ (dùng tổng từ legend / KPI strip)      | Decimal đầy đủ + unit |

#### Helper formatter — chuẩn (đặt ở `utils/chart-format.utils.ts`)

```ts
/** Label trên đỉnh cột — SỐ NGUYÊN + dấu phân tách hàng nghìn. Ẩn 0/null. */
export function labelInt(v: number | null | undefined): string {
  if (v == null || v === 0) return '';
  return Math.round(v).toLocaleString('en-US');
}

/** Tooltip — đầy đủ thập phân (mặc định 3) + đơn vị. */
export function fmt3(v: number | null | undefined): string {
  if (v == null || v === 0) return '';
  return (Math.round(v * 1000) / 1000).toLocaleString('en-US', {
    maximumFractionDigits: 3,
  });
}
```

#### Bar label skeleton chuẩn (BẮT BUỘC)

```tsx
<Bar dataKey="value" fill={tokenVar(CHART_COLORS.actual)} ...>
  <LabelList
    {...m.barLabel}                            // ⛔ cỡ chữ theo bậc mật độ (§1.5)
    dataKey="value"
    position="top"                             // ⛔ KHÔNG "inside"
    fill={tokenVar(CHART_COLORS.actual)}       // cùng tone với bar
    formatter={(v) => labelInt(Number(v))}     // integer
  />
</Bar>
```

`m.barLabel` = `{ fontSize (theo bậc), fontWeight: 600, letterSpacing: '-0.01em' }`.
⛔ KHÔNG có `fontFamily` — nhãn số kế thừa font sans của app (§1.8).

**⛔ KHÔNG dùng `stroke` + `paintOrder` cho LabelList.** Bản trước của rule này
yêu cầu viền `bg-base` 3px để tách chữ khỏi nền. Trên nền tối, viền đó vẽ ra một
**quầng ĐEN quanh mỗi con số** — trông như bóng chữ bẩn và làm chữ nhoè, đúng
thứ nó định ngăn. Nhãn đặt `position="top"` vốn nằm NGOÀI thân cột, trên nền
panel sạch, nên không có gì để tách.

Bù độ đọc bằng `tabular-nums` (cột số thẳng hàng) + weight 600 — **KHÔNG** font
mono, xem §1.8.
Chỉ khi buộc phải đặt `position="inside"` (bar rất cao, hết chỗ phía trên) thì
mới cân nhắc viền — và khi đó viền lấy màu chính thân bar, không phải `bg-base`.

#### Tooltip skeleton chuẩn (BẮT BUỘC)

```tsx
<Tooltip
  contentStyle={m.tooltip}
  itemStyle={m.tooltipItem}
  labelStyle={m.tooltipLabel}
  cursor={{ fill: tokenVarAlpha('primary-5', 0.08) }}
  formatter={(v, name) => [
    `${fmt3(Number(v)) || '0'} tỷ`, // ⛔ đơn vị BẮT BUỘC cuối chuỗi
    String(name),
  ]}
/>
```

#### Anti-patterns

| ❌ Sai                                | ✅ Đúng                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------ |
| Bar không có `<LabelList>`            | `<LabelList formatter={labelInt} ... />`                                 |
| LabelList có `stroke` viền `bg-base`  | Bỏ đi — sinh quầng đen trên nền tối. Dùng `{...m.barLabel}`              |
| Label format full decimal `"123.456"` | `labelInt` → `"123"`                                                     |
| Tooltip không có đơn vị               | `formatter={(v) => [`${fmt3(Number(v))} tỷ`, name]}`                     |
| Tooltip cũng integer (= label)        | Tooltip = `fmt3` (decimal) — phải KHÁC label để có giá trị bổ sung       |
| `fontSize={9}` / `fontSize={10}` / bất kỳ số cứng | `{...m.barLabel}` — sàn 11px, theo bậc mật độ (§1.5)         |
| `fontWeight={400/500}`                | Tối thiểu `600`                                                          |
| `toLocaleString('en-US')` trong app tiếng Việt | `'vi-VN'` — trộn locale làm cùng tập số hiện 2 kiểu dấu        |

#### Khi nào label gây nhiễu → ẩn?

- Bar dày đặc (> 24 bar/chart) → ẩn label, **bắt buộc** giữ tooltip
- Sparkline (chart nhỏ < 80×40) → ẩn label
- Stacked bar có > 3 segment → ẩn label segment (chỉ giữ label total nếu có)

#### ⚠️ Stacked bar — TOTAL label pattern (LIMITATION của Recharts)

Recharts `LabelFormatter` signature **chỉ nhận 1 arg `(value) => string`** —
KHÔNG truy cập được payload/datum khác. Vì thế, để hiển thị TỔNG stack trên
top segment, **PHẢI pre-compute** `__total` vào data:

```tsx
// ❌ SAI — formatter không nhận entry/payload, sẽ TypeError ở build
<LabelList formatter={(_, entry) => labelInt(sumStack(entry))} />

// ❌ SAI — gắn nhãn vào series CUỐI: cột nào series đó vắng mặt (hoặc = 0) là
// mất luôn nhãn tổng. Xem §3.4.1 — đây là bug đã gặp ở biểu đồ Nhân sự.
<Bar dataKey="c" stackId="a">
  <LabelList dataKey="__total" position="top" />
</Bar>

// ✅ ĐÚNG — pre-compute __total + treo nhãn trên CỘT NEO trong suốt
const data = useMemo(
  () => MOCK.map((d) => ({ ...d, __total: d.a + d.b + d.c, __anchor: 0 })),
  []
);

<Bar dataKey="a" stackId="a" ... />
<Bar dataKey="b" stackId="a" ... />
<Bar dataKey="c" stackId="a" ... />
<Bar
  dataKey="__anchor"
  stackId="a"
  fill="transparent"
  minPointSize={1}          // ⛔ BẮT BUỘC — xem §3.4.1
  legendType="none"
  tooltipType="none"
  isAnimationActive={false}
>
  <LabelList
    dataKey="__total"        // ⛔ trỏ vào pre-computed field
    position="top"
    {...m.barLabel}
    fill={tokenVar('fg-1')}
    formatter={(v) => labelInt(Number(v))}
  />
</Bar>
```

**Quy tắc:**

- Total field PHẢI prefix `__` (vd `__total`) — phân biệt với data field thật
- Nhãn tổng treo trên **cột neo** `__anchor`, KHÔNG trên series cuối (§3.4.1)
- Tooltip vẫn dùng `formatter={(v) => ...}` cho từng segment riêng — không cần show total

#### ⛔ 3.4.1. Vì sao phải có cột neo — Recharts LỌC BỎ rect cao 0

`computeBarRectangles` (recharts 3.x, `lib/cartesian/Bar.js`) có đoạn:

```js
if (x == null || y == null || width == null || height == null ||
    (!hasCustomShape && (width === 0 || height === 0))) {
  return null;   // ← rồi .filter(Boolean)
}
```

Và `BarLabelListProvider` dựng danh sách nhãn **từ chính mảng rect đã lọc đó**.

Hệ quả: series nào ở một cột có giá trị **0 hoặc thiếu key** → rect cao 0 → bị lọc
→ **cột đó mất nhãn**. Với stack sắp theo tổng giảm dần, series trên cùng chính là
series nhỏ nhất / rải rác nhất, nên phần lớn cột mất nhãn — nhìn như chart hỏng.

Cột neo `__anchor` luôn có mặt ở MỌI cột nên nhãn không bao giờ hụt. Phải kèm
`minPointSize={1}`: giá trị 0 cho rect cao 0 và bị lọc y hệt; `minPointSize` đẩy
lên 1px (trong suốt, không nhìn thấy) để rect sống sót.

`tooltipType="none"` + `legendType="none"` để cột neo không lọt vào tooltip và
chú giải — cả `DefaultTooltipContent` lẫn `DefaultLegendContent` đều bỏ qua entry
có `type === 'none'`.

### 3.3. Bar chart (vertical)

```tsx
<BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
  <CartesianGrid
    {...m.grid}
    vertical={false}
  />
  <XAxis
    dataKey="name"
    tick={m.axisTick}
    tickLine={false}
    axisLine={m.axisLine}
    interval={0} // hiện hết label
    angle={-15} // xoay nhẹ nếu label dài
    textAnchor="end"
    height={42} // thêm chiều cao axis cho label xoay
  />
  <YAxis tick={m.axisTick} tickLine={false} axisLine={false} />
  <Tooltip cursor={{ fill: tokenVarAlpha('primary-5', 0.08) }} />
  <Legend wrapperStyle={m.legend} />
  <Bar dataKey="budget" name="Ngân sách" fill={tokenVar(CHART_COLORS.budget)} />
  <Bar dataKey="spent" name="Đã chi" fill={tokenVar(CHART_COLORS.spent)} />
</BarChart>
```

**KHÔNG dùng `radius={[2, 2, 0, 0]}`** trừ khi design yêu cầu — mặc định bar VUÔNG.

### 3.4. Stacked bar

```tsx
<Bar dataKey="approved" stackId="a" name="Đã duyệt" fill={tokenVar(CHART_COLORS.approved)} />
<Bar dataKey="pending"  stackId="a" name="Chờ"      fill={tokenVar(CHART_COLORS.pending)} />
<Bar dataKey="overdue"  stackId="a" name="Quá hạn" fill={tokenVar(CHART_COLORS.overdue)} />
```

**Quy tắc:** cùng `stackId` cho stack chung; thứ tự trong JSX = thứ tự stack bottom→top.

### 3.5. Horizontal bar

```tsx
<BarChart
  data={data}
  layout="vertical"
  margin={{ top: 4, right: 12, left: 4, bottom: 0 }}
>
  <CartesianGrid
    {...m.grid}
    horizontal={false}
  />
  <XAxis
    type="number"
    tick={m.axisTick}
    tickLine={false}
    axisLine={false}
  />
  <YAxis
    type="category"
    dataKey="name"
    tick={m.axisTick}
    tickLine={false}
    axisLine={m.axisLine}
    width={Math.max(m.scale.yAxisWidth, 66)} // nhãn category dài
  />
  <Bar dataKey="value">
    {data.map((_, i) => (
      <Cell key={i} fill={tokenVar(DONUT_TOKENS[i % DONUT_TOKENS.length])} />
    ))}
  </Bar>
</BarChart>
```

**Quy tắc:** `layout="vertical"` đảo XY; `horizontal={false}` trên grid.

### 3.6. Area chart (stacked)

```tsx
<AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
  <defs>
    <linearGradient id="gradGroupA" x1="0" y1="0" x2="0" y2="1">
      <stop
        offset="0%"
        stopColor={tokenVar(CHART_COLORS.groupA)}
        stopOpacity={0.55}
      />
      <stop
        offset="100%"
        stopColor={tokenVar(CHART_COLORS.groupA)}
        stopOpacity={0.05}
      />
    </linearGradient>
    {/* … 1 gradient / series */}
  </defs>
  <Area
    type="monotone"
    dataKey="groupA"
    stackId="1"
    stroke={tokenVar(CHART_COLORS.groupA)}
    strokeWidth={1.5}
    fill="url(#gradGroupA)"
  />
</AreaChart>
```

**Quy tắc:**

- 1 `<linearGradient>` cho mỗi series (id prefix theo feature để tránh clash giữa 2 chart cùng trang)
- `stopOpacity` chuẩn: top 0.55 → bottom 0.05
- `type="monotone"` mặc định (mượt); dùng `step` nếu cần bậc thang

### 3.7. Line chart (đường luỹ kế / kế hoạch vs thực tế)

```tsx
<LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
  <CartesianGrid
    {...m.grid}
    vertical={false}
  />
  <XAxis
    dataKey="month"
    tick={m.axisTick}
    tickLine={false}
    axisLine={m.axisLine}
  />
  <YAxis
    tick={m.axisTick}
    tickLine={false}
    axisLine={false}
    tickFormatter={(v) => `${v}%`}
    width={m.scale.yAxisWidth}
  />
  <Tooltip cursor={{ stroke: tokenVar('primary-5'), strokeWidth: 1 }} />
  <Legend iconType="line" wrapperStyle={m.legend} />
  <Line
    type="monotone"
    dataKey="planned"
    name="Kế hoạch"
    stroke={tokenVar(CHART_COLORS.planned)}
    strokeWidth={2}
    strokeDasharray="6 4" // kế hoạch / dự báo → dashed
    dot={false}
  />
  <Line
    type="monotone"
    dataKey="actual"
    name="Thực tế"
    stroke={tokenVar(CHART_COLORS.actual)}
    strokeWidth={2.5} // emphasize thực tế
    dot={{ r: 2.5, fill: tokenVar(CHART_COLORS.actual) }}
    connectNulls={false} // gap = chưa có dữ liệu
  />
</LineChart>
```

**Quy tắc convention dashed:**

- Kế hoạch / dự báo → `strokeDasharray="6 4"` hoặc `"4 4"`
- Thực tế → solid (`strokeWidth` lớn hơn 0.5 để emphasize)

### 3.8. Sparkline (mini area, không axis)

```tsx
<div className="-mx-1 min-h-14 flex-1">
  <ResponsiveContainer>
    <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
      <defs>
        <linearGradient id="gradSpark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tokenVar('green-5')} stopOpacity={0.5} />
          <stop offset="100%" stopColor={tokenVar('green-5')} stopOpacity={0} />
        </linearGradient>
      </defs>
      <Tooltip contentStyle={m.tooltip} ... />
      <Area dataKey="value" stroke={tokenVar('green-5')} fill="url(#gradSpark)" strokeWidth={1.5} />
    </AreaChart>
  </ResponsiveContainer>
</div>
```

**KHÔNG đặt axis/grid/legend** trong sparkline — chỉ trend line.

---

## 4. Mock data — Vị trí + cấu trúc

### 4.1. Vị trí

```
src/features/{feature}/
├── types/{feature}.types.ts          # CHỈ types
├── constants/{feature}.constants.ts  # PHASE_META, CHART_COLORS, DONUT_TOKENS
└── mock/{feature}.mock.ts            # MOCK_*** data arrays
```

**KHÔNG:**

- ⛔ Fork `chart-tokens.ts` / `chart-style.utils.ts` / bảng màu vào feature —
  `tokenVar`, `tokenVarAlpha`, style tooltip / legend / axis **chỉ** đến từ
  `@/shared/charts` (§1.1)
- Inline mock data trong component file
- Để chart constant rải module-scope của chart component
- Để `MOCK_*` trong `constants/` (constants = config; data = mock/)

### 4.2. Cấu trúc mock

```ts
// mock/foo.mock.ts
import type { KpiItem, SCurvePoint, ... } from '../types/foo.types';

export const MOCK_KPIS: KpiItem[] = [...];
export const MOCK_SCURVE: SCurvePoint[] = MONTHS.map((m, i) => ({ ... }));
```

**Quy tắc:**

- 1 file `mock/{feature}.mock.ts` cho tất cả mock (data file → không giới hạn dòng)
- Mock function gen `Array.from({length: N}).map(...)` — OK để procedural
- Type-safe: import types, không `any`

---

## 5. Dashboard / Màn hình lớn — Layout

### 5.1. ⛔ Page skeleton

```tsx
// pages/FooPage.tsx
const FooPage = memo(function FooPage() {
  return (
    <div className="flex h-full flex-col gap-2.5 overflow-auto p-2.5">
      <PageHeader title="Tiêu đề" tone="sky" /> {/* portal lên thanh header, không chiếm hàng */}
      <FooKpiGrid /> {/* shrink-0 */}
      {/* Hàng chính — flex-1 + min-h-0 → fill space còn lại */}
      <div className="grid min-h-[360px] flex-1 grid-cols-1 gap-2.5 xl:grid-cols-[1fr_280px]">
        <FooMainPanel />
        <FooAlertFeed />
      </div>
      {/* Strip 4 panel — shrink-0 auto-rows-[220px] */}
      <div className="grid w-full shrink-0 auto-rows-[220px] grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <FooSection title="Panel 1">
          <Chart1 />
        </FooSection>
        {/* … */}
      </div>
    </div>
  );
});
```

**Quy tắc:**

- Outer: `h-full flex flex-col overflow-auto p-2.5 gap-2.5`
- Padding gọn `p-2.5` hoặc `p-3` — KHÔNG `p-4`/`p-6`
- Hàng chính: `flex-1 min-h-0` + `min-h-[360px]` (chặn sập)
- Strip chart: `shrink-0 auto-rows-[220px]` — đều chiều cao
- `min-h-0` BẮT BUỘC khi parent là flex column và child có chart fill

### 5.2. ⛔ Section wrapper compact

**Trước hết thử `<BoxPanel>` (kit2)** — nó đã là "header + body có scroll nội bộ"
với `title` · `headerRight` · `headerClassName` · `bodyClassName`. Chỉ khi
`<BoxPanel>` không đủ (cần khung/nét riêng của dashboard) mới dựng wrapper cục bộ
theo mẫu dưới, và wrapper đó phải dùng `<SectionHeader>` chứ không tự build header:

```tsx
// components/FooSection.tsx
const FooSection = memo(function FooSection({
  title,
  right,
  children,
  bodyClassName = 'p-2',
}: Props) {
  return (
    <section className="flex h-full flex-col overflow-hidden border border-border-1 bg-bg-1">
      <SectionHeader title={title} className="shrink-0 py-1.5" right={right} />
      <div className={cn('min-h-0 flex-1 overflow-hidden', bodyClassName)}>
        {children}
      </div>
    </section>
  );
});
```

**Quy tắc:**

- Header `py-1.5` (compact) — KHÔNG `py-3`/`py-4`
- **KHÔNG description** trong header dashboard compact (chỉ title)
- Body `p-2` default — pass `p-0 overflow-hidden` khi con tự quản lý padding
- `overflow-hidden` ở body — nếu cần scroll → chart tự responsive, KHÔNG cho body scroll

### 5.3. KPI strip

```tsx
const FooKpiGrid = memo(function FooKpiGrid() {
  return (
    <div className="grid shrink-0 grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
      {MOCK_KPIS.map((item) => (
        <CompactKpiCard
          key={item.id}
          color={item.color}
          icon={item.icon}
          label={item.label}
          value={item.value}
          unit={item.unit}
          trailing={
            item.delta ? (
              <Badge
                color={item.deltaDir === 'up' ? 'success' : 'error'}
                variant="tinted"
              >
                {item.delta}
              </Badge>
            ) : undefined
          }
        />
      ))}
    </div>
  );
});
```

**Quy tắc:**

- Dùng `<CompactKpiCard>` (kit2) — KHÔNG raw card / Hud-card fork
- Grid responsive: 2 → 4 → 8 cột (KPI nhiều); 2 → 3 → 6 (KPI vừa)
- `shrink-0` để không co theo flex parent

### 5.4. Panel có nội dung fill tuyệt đối (viewer, canvas, danh sách + chi tiết)

Khi nội dung panel phải chiếm ĐÚNG phần còn lại và tự cuộn bên trong (không kéo
giãn panel cha):

```tsx
<DashboardSection
  title={`Danh sách (${filtered.length}/${items.length})`}
  right={<StatusChipFilter ... />}
  bodyClassName="relative p-0 overflow-hidden"
>
  <div className="absolute inset-0 grid grid-cols-1 grid-rows-1 gap-px bg-border-1 lg:grid-cols-[260px_1fr]">
    <div className="hidden min-h-0 flex-col overflow-hidden bg-bg-1 lg:flex">
      <ItemList items={filtered} ... />
    </div>
    <div className="relative bg-bg-2">
      <DetailCanvas className="absolute inset-0" />
    </div>
  </div>
</DashboardSection>
```

**Quy tắc:**

- Body `relative p-0 overflow-hidden` — nội dung fill bằng `absolute inset-0`
- ⛔ KHÔNG đặt `min-h-[420px]` trên ô con → ép cell cao hơn body (gây overflow)
- Sidebar `min-w-[240px]` đến `300px` tuỳ mật độ
- Chip filter đặt ở `right` slot của section header, KHÔNG nhét vào body

### 5.5. Reuse hook / list giữa 2 feature cùng module

Khi feature mới cần CÙNG dữ liệu + hành vi danh sách với feature anh em:

```tsx
// ✅ ĐÚNG — reuse hook + list của feature cùng module cha
import { useOverviewItems } from '@/features/{module}/overview/hooks/useOverviewItems';
import OverviewItemList from '@/features/{module}/overview/components/OverviewItemList';
```

**Quy tắc:** rule "no cross-feature import" (`feature-structure.md`) RELAX khi 2
feature **cùng module cha** VÀ cần parity dữ liệu. Dùng ở feature THỨ BA →
promote hook/list lên `@/shared/widgets/`, KHÔNG chuỗi import xuyên feature.

---
## 6. Anti-patterns — danh sách đen

### 6.1. Color / styling

| ❌ Sai                                                    | ✅ Đúng                                                           |
| --------------------------------------------------------- | ----------------------------------------------------------------- |
| `stroke="oklch(0.5 0.04 235)"`                            | `stroke={tokenVar('fg-4')}`                                       |
| `fill="#22c55e"`                                          | `fill={tokenVar(CHART_COLORS.groupA)}`                             |
| `style={{ fontSize: '11px', color: '#fff' }}`             | `contentStyle={m.tooltip}` từ `useChartMetrics`              |
| `<Cell fill="oklch(0.7 0.18 30)" />`                      | `<Cell fill={tokenVar(DONUT_TOKENS[i])} />`                       |
| `<Bar fill="rgba(56,189,248,0.55)" />`                    | `<Bar fill={tokenVarAlpha('primary-5', 0.55)} />`                 |
| `CHART_COLORS.planned = 'sky-4'` (scale ≠ 5 cho series)   | `CHART_COLORS.planned = 'info-5'` (chỉ scale `-5`)                |
| `CHART_COLORS.budget = 'sky-7'`                           | `CHART_COLORS.budget = 'info-5'`                                  |
| `DONUT_TOKENS = ['blue-5','green-5','sky-4']` (mix scale) | `DONUT_TOKENS = ['primary-5','success-5','warning-5']` (chỉ `-5`) |

### 6.2. Layout

| ❌ Sai                               | ✅ Đúng                                           |
| ------------------------------------ | ------------------------------------------------- |
| `<HudCard>` raw từ POC               | Kit2 `<SectionHeader>` + custom wrapper compact   |
| `h-[calc(100vh-12rem)]` magic number | `flex-1 min-h-0` (hàng chính)                     |
| `p-4` / `p-6` panel header           | `py-1.5` (compact) hoặc `py-2`                    |
| Description trong header dashboard   | Title only (compact mode)                         |
| `overflow-y-auto` body khi có chart  | `overflow-hidden` + chart `<ResponsiveContainer>` |

### 6.3. Chart

| ❌ Sai                                                             | ✅ Đúng                                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `<Pie stroke="#000" strokeWidth={2} paddingAngle={2}>`             | `stroke="none"` `strokeWidth={0}` `paddingAngle={0}`                     |
| Inline `margin={{ top: 6, right: 8, left: -18, bottom: 0 }}` magic | Comment + `tick={m.axisTick}`, margin chuẩn `top:4,right:8,left:-20` |
| `radius={[2, 2, 0, 0]}` mặc định mọi bar                           | Default vuông; chỉ add khi design yêu cầu                                |
| `<XAxis interval="preserveStartEnd" />` cho dataset 30 ngày        | `interval={4}` (1 tick / 5 ngày)                                         |
| Hardcode `width={42}` / `width={48}` mọi nơi                       | YAxis `width={m.scale.yAxisWidth}`; nhãn category dài thì `Math.max(m.scale.yAxisWidth, 66)` |
| Quên `<ResponsiveContainer>`                                       | Bọc luôn `<ResponsiveContainer width="100%" height="100%">`              |
| Quên `width="100%" height="100%"` props                            | BẮT BUỘC để fill parent                                                  |

### 6.4. Data / Mock

| ❌ Sai                            | ✅ Đúng                            |
| --------------------------------- | ---------------------------------- |
| Mock array inline trong component | `mock/{feature}.mock.ts`           |
| Mock function gen mỗi render      | `useMemo(() => MOCK_FOO, [])`      |
| Mock data trong `constants/`      | `mock/` riêng (data ≠ config)      |
| `any[]` cho mock                  | Type-safe import từ `types/`       |
| Magic month/day inline            | `const MONTHS = [...]` ở mock file |

---

## 7. Performance

- **memo BẮT BUỘC** mỗi chart component (`memo(function Foo() { ... })`)
- **useMemo** cho data biến đổi nặng (filter, map, sort)
- KHÔNG inline arrow `data={[...]}` mỗi render — `useMemo` hoặc import const
- `<ResponsiveContainer>` chỉ re-render khi parent resize — không cần memo riêng
- Chart không nên có `useEffect` — data từ React Query hook ở parent, pass xuống props

---

## 8. Checklist trước khi commit chart/dashboard

### Mỗi file chart

- [ ] `memo(function FooChart() { ... })` — KHÔNG raw arrow
- [ ] `<div ref={chartRef} className="h-full w-full">` wrapper CÓ ref đo
- [ ] `const [chartRef, m] = useChartMetrics<HTMLDivElement>(uiScale)` — có
  truyền `uiScale` từ `useDisplayStore(selectEffectiveUiScale)`, KHÔNG gọi
  không tham số (mặc định `uiScale=1` → lờ chế độ TV)
- [ ] `<ResponsiveContainer width="100%" height="100%">`
- [ ] `margin={{ top: 4, right: 8, left: -20, bottom: 0 }}` (hoặc lý do thay đổi)
- [ ] `tokenVar()` cho mọi màu — KHÔNG hex / oklch
- [ ] **KHÔNG có `fontSize` là số cứng** — mọi cỡ chữ qua `m.scale.*` / `m.barLabel` (§1.5)
- [ ] Lưới/trục dùng `m.grid` / `m.axisLine` — KHÔNG `divider-white-10` (§1.6)
- [ ] Chữ KHÔNG tô bằng màu series (§1.7)
- [ ] `YAxis width={m.scale.yAxisWidth}` — KHÔNG số cứng
- [ ] Series `CHART_COLORS.xxx` từ constants — KHÔNG magic string
- [ ] Cặp KH/TT dùng đúng `CHART_SEMANTIC` (plan `info-5` dashed · actual `success-5` solid)
- [ ] `toLocaleString('vi-VN')` — KHÔNG trộn `en-US`
- [ ] **Mọi token series ∈ scale `-5`** (primary-5 / secondary-5 / accent-5 / indigo-5 / purple-5 / teal-5 / fuchsia-5 / pink-5 / azure-5 / success-5 / info-5 / warning-5 / error-5) — KHÔNG `-4`/`-6`/`-7`
- [ ] `useMemo` cho data
- [ ] Donut `stroke="none"` `paddingAngle={0}` (trừ khi cần phân tách)

### Mỗi page dashboard

- [ ] `flex h-full flex-col gap-2.5 p-2.5` outer
- [ ] `<PageHeader title tone>` (`@/shared/widgets/header`) làm tiêu đề — KHÔNG `<TitleScreen>` (`reuse-first.md` §3.4)
- [ ] KPI strip `shrink-0` với `<CompactKpiCard>`
- [ ] Hàng chính `flex-1 min-h-0` + `min-h-[360px]`
- [ ] Strip chart `shrink-0 auto-rows-[220px]`
- [ ] Section header `py-1.5` không description
- [ ] Body `overflow-hidden p-2` (hoặc `p-0` khi con tự quản lý padding)
- [ ] `npx tsc --noEmit` exit 0

### Mỗi feature

- [ ] Đủ bộ 5 file nền tảng chart (xem §1.1)
- [ ] `constants/chart-palette.constants.ts` là nguồn màu DUY NHẤT — module KHÔNG tự khai token màu
- [ ] `constants/{feature}.constants.ts` chứa `CHART_COLORS`
- [ ] `mock/{feature}.mock.ts` chứa tất cả `MOCK_*`
- [ ] `types/{feature}.types.ts` chứa point types
- [ ] Section wrapper compact ở `components/{Feature}Section.tsx`

---

## 9. Cross-references

- Token rules: `color-system.md` · `font-system.md` · `icon-conventions.md`
- Kit2 components (CompactKpiCard, SectionHeader): `reuse-first.md` · `kit2-architecture.md`
- Tiêu đề trang `<PageHeader>` (`@/shared/widgets/header`): `reuse-first.md` §3.4
- Hạ tầng chart dùng chung: `@/shared/charts` (§1.1)
- Tailwind / `cn()`: `tailwind-conventions.md`
- Clean code (1 file = 1 component, line limits): `clean-code-standards.md`
- Performance: `code-optimization.md`

---

## 10. ⛔ TV Display Mode — Cỡ chữ ×1.1 / 1.2 / 1.3 (KHÔNG phóng bố cục)

### 10.1. Cơ chế TV hiện tại

**Design cũ (đã bỏ):** `--ui-scale: 1.8` phóng root font-size → tất cả utility (padding,
kích thước) giãn 1.8× → panel tràn, bảng vỡ layout ở TV.

**Design mới (hiện tại):** `--ui-scale` (1.1 mặc định · 1.2 · 1.3, trần 1.3) nhân
**riêng token typography** trong `generated-font.css` → chữ to lên, khung GIỮ
NGUYÊN → không vỡ, xem TV được.

⛔ **Chart là NGOẠI LỆ: CSS var KHÔNG với tới được.** Recharts đặt `fontSize`
làm **thuộc tính SVG tính bằng px** trong JS, không phải class Tailwind — nên
`--ui-scale` không chạm được vào nó. Vì thế `useChartMetrics` **nhân bằng code**:

```ts
// useChartMetrics.ts — đúng như code hiện tại
const uiScale = useDisplayStore(selectEffectiveUiScale); // 1 khi TV tắt
const density = chartDensityFor(size.height);            // height THỰC, KHÔNG chia
return { ...buildChartStyles(density, uiScale), density, uiScale, ... };
```

**Dòng chảy chart ở TV:**
1. Chiều cao thực: `size.height` (⛔ KHÔNG chia `uiScale`)
2. Bậc mật độ: `chartDensityFor(height)` → compact / base / large / xlarge
3. Cỡ chữ: `buildChartStyles(density, uiScale)` nhân trong JS
4. Kết quả (bậc `base`, ×1.1): axis 12 → 13, barLabel 13 → 14; **lưới giữ 1px**
   (`scaleStroke` có sàn `Math.max(1, …)` và làm tròn, 1 × 1.3 vẫn ra 1)

**Cơ chế cũ (BỎ):**
```ts
// ❌ KHÔNG LÀM — thường thấy trong code cũ:
const density = chartDensityFor(height / uiScale);  // SAI — chia chiều cao
// Lý do bỏ: khi design KHÔNG phóng bố cục, khung chart không phình theo
// `uiScale` nữa, nên chia là tự bóp slot 220px thành 200px và tụt bậc oan.
```

⛔ `uiScale` truyền vào `buildChartStyles` PHẢI là **scale HIỆU LỰC**
(`selectEffectiveUiScale`), KHÔNG phải `state.uiScale`: store vẫn nhớ hệ số TV
lúc đang ở chế độ standard, đọc thẳng là chart to lên cả khi TV đang tắt.

### 10.2. Anti-pattern TV — BLOCK MERGE

| ❌ Sai | ✅ Đúng |
|-------|--------|
| Chia `height / uiScale` → chọn bậc | `chartDensityFor(size.height)` — height THỰC |
| Đọc thẳng `state.uiScale` | `useDisplayStore(selectEffectiveUiScale)` |
| Tự nhân `fontSize` trong file chart | `buildChartStyles` đã nhân — file chart chỉ đọc `m.scale.*` |
| Phóng `barSize` / `radius` theo `uiScale` | KHÔNG — khung cứng, kích thước px giữ nguyên |
| Dùng `TV_GRID_WIDTH = 2` / `TV_MIN_FONT = 18` constant | BỎ HẲN — design cũ, không dùng |
| Tô phần thiếu donut bằng `bg-*` | Track ring chuẩn + phần còn lại **`transparent`** (§3.1.5) |

---

## 11. Khi vi phạm

- PR có chart hex/oklch hardcode → **revert**
- PR có `fontSize` là số cứng trong file chart (đặc biệt `9`/`10`) → **block merge** (§1.5)
- PR có nét (lineWidth, gridWidth) lẻ (2.5, 3.5) → **revert** (§1.5)
- PR có lưới/trục tô `divider-white-10` → **block merge** (§1.6)
- PR tô CHỮ bằng token series `-5` → **revert** (§1.7)
- PR có token series ngoài scale `-5` (vd `sky-4`, `sky-7`, `blue-4`, `red-6`…) → **revert**
- PR có `<Pie stroke="#xxx" paddingAngle>2` mà không có lý do design → **revert**
- Dashboard có `p-4/p-6` header section → fail review
- Dashboard có description trong header compact mode → fail review
- Chart KHÔNG có `<ResponsiveContainer>` → **block merge**
- Mock data trong component file → fail review
- **TV mode**: Chia `height / uiScale` hoặc nhân lại ở code → **revert** (bỏ, CSS var lo)
- **TV mode**: Phóng `barSize` / kích thước chart element theo `uiScale` → **revert** (khung cứng)
