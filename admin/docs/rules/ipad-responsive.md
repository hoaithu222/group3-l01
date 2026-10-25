# iPad / Máy tính bảng — Quy chuẩn Responsive & PWA (BẮT BUỘC)

> Áp dụng cho **mọi thay đổi giao diện nhắm tới máy tính bảng** trong `src/`.
> Mục tiêu: iPad thao tác mượt, không vỡ bố cục, không có phần tử đè lên nhau —
> **mà bố cục PC/laptop KHÔNG đổi một pixel nào**.
>
> Vi phạm các mục đánh dấu **⛔** → **block merge**.

Đọc kèm: `tailwind-conventions.md` (đơn vị + breakpoint) · `visual-hierarchy.md`
(padding/density) · `tv-display-mode.md` (bài học "phóng to là vỡ") ·
`widget-composition.md` (token tập trung).

---

## 0. Nguyên tắc tối cao

```
1. CHẠM ≠ HẸP        → Tách iPad khỏi laptop bằng `touch:`, KHÔNG bằng bề rộng.
2. CỘNG THÊM, KHÔNG SỬA → Chỉ THÊM bậc mới. Không đụng giá trị base/xl/2xl/wide.
3. CUỘN, KHÔNG ẨN    → Chật thì cho cuộn. Ẩn chức năng = người dùng mất đường đi.
4. KHÔNG PHÓNG TO    → `touch:` chỉ được SIẾT. Vùng chạm nới bằng ::after.
5. KHÔNG PHÓNG BỐ CỤC → Bài học TV mode: phóng root = vỡ. Chỉ nới VÙNG CHẠM.
6. `dvh` KHÔNG PHẢI `vh` → Safari iOS tính `100vh` lớn hơn vùng nhìn thấy.
7. VÙNG AN TOÀN      → Neo đáy phải cộng `--safe-b`, nếu không đè vạch Home.
```

---

## 1. ⛔ Vì sao KHÔNG tách iPad bằng bề rộng màn

Bảng viewport thật (CSS px, không phải pixel vật lý):

| Thiết bị | Dọc | Ngang |
|---|---|---|
| iPad mini | 744 | 1133 |
| iPad 10.2" / 10.9" | 768 · 820 | 1024 · 1180 |
| iPad Air 11" | 820 | 1180 |
| **iPad Pro 12.9"** | **1024** | **1366** |
| Laptop 14" | — | 1280 · 1366 · 1440 · 1512 |
| Laptop 16" | — | 1536 · 1728 |

Hai dòng in đậm là vấn đề: **iPad Pro nằm ngang = 1366px = trùng ĐÚNG laptop 14"**.
Không tồn tại mốc bề rộng nào tách được hai thứ đó. Mọi rule viết theo bề rộng
sẽ rơi vào một trong hai kết cục, cả hai đều sai:

- Đặt mốc ở 1279px → **bỏ sót** iPad Pro ngang và iPad Air ngang cỡ lớn.
- Đặt mốc ở 1366px → **đụng vào laptop 14"**, tức phá đúng thứ đang chạy tốt.

⇒ Bề rộng trả lời câu "màn rộng bao nhiêu", KHÔNG trả lời câu "người dùng đang
chạm bằng gì". Mà thứ quyết định cỡ nút bấm là ngón tay, không phải bề rộng.

---

## 2. ⛔ `touch:` — biến thể ĐÚNG (khai ở `globals.css`)

```css
@custom-variant touch (@media (hover: none) and (pointer: coarse));
@custom-variant standalone (@media (display-mode: standalone));
```

| Thiết bị / tình huống | `hover` | `pointer` | `touch:` khớp? |
|---|---|---|---|
| iPad chạm ngón | none | coarse | ✅ |
| iPad + bàn phím Magic (có trackpad) | hover | fine | ❌ — ĐÚNG: lúc đó có con trỏ thật |
| iPhone | none | coarse | ✅ |
| Laptop có màn cảm ứng (Windows) | hover | fine | ❌ — con trỏ vẫn là đầu vào chính |
| **Mọi PC / laptop** | hover | fine | ❌ **KHÔNG BAO GIỜ** |

**Đây là hàng rào an toàn của cả đợt làm iPad.** Rule gắn `touch:` về mặt vật lý
không thể chạm tới bố cục PC/laptop. Vì thế:

> ⛔ **Mọi thay đổi dành riêng cho máy tính bảng PHẢI đi qua `touch:`.**
> Nếu buộc phải dùng bề rộng, xem §2.2 và phải justify trong PR.

### 2.1. `standalone:` — chỉ khi chạy từ biểu tượng Màn hình chính

`@media (display-mode: standalone)` chỉ khớp khi app mở từ icon đã "Thêm vào Màn
hình chính", KHÔNG khớp trong tab Safari. Dùng cho thứ chỉ đúng ở chế độ toàn
màn (bỏ chỗ vốn dành cho thanh URL). Đa số trường hợp **không cần** — `--safe-*`
đã tự bằng 0 khi ở trong tab.

### 2.2. Khi nào ĐƯỢC dùng bề rộng thay vì `touch:`

Chỉ khi vấn đề **thật sự là chỗ hẹp**, không phải ngón tay:

- Bảng 8 cột không đủ chỗ ở 768px → đây là chuyện bề rộng → dùng `md:`/`lg:`.
- Chip tab cao 22px khó bấm → đây là chuyện ngón tay → dùng `touch:`.

Và khi dùng bề rộng, **BẮT BUỘC theo thang 6 bậc đã có** (`header.theme.ts`),
KHÔNG đẻ breakpoint mới:

```
base  390–639   điện thoại
sm:   640–767   điện thoại ngang / tablet nhỏ
md:   768–1023  TABLET DỌC        ← iPad 768 · 820 · 834
lg:  1024–1279  TABLET NGANG      ← iPad 1024 · 1180
xl:  1280–1535  LAPTOP 14"        ⛔ CHẠM VÀO ĐÂY LÀ ĐỤNG LAPTOP
2xl: 1536–1799  LAPTOP 16"        ⛔ ĐỪNG ĐỤNG
wide: ≥1800     MÀN NGOÀI 24"     ⛔ ĐỪNG ĐỤNG
```

⛔ **KHÔNG được sửa giá trị ở bậc `xl` / `2xl` / `wide`** với lý do "cho iPad".
iPad Pro ngang nằm ở `xl` — sửa `xl` là sửa laptop 14".

---

## 3. ⛔ Vùng chạm — nới HỘP NHẬN CHẠM, KHÔNG BAO GIỜ phóng to hình

Đầu ngón tay có vùng tiếp xúc ~44×44px (Apple HIG). Chuột nhắm trúng ô 22px dễ
dàng; ngón tay thì bấm 3 lần trượt 1 lần — và vì các control nằm sát nhau, **bấm
trượt không phải là "không ăn gì" mà là KÍCH HOẠT NHẦM control bên cạnh**.

### 3.0. ⛔ LUẬT TỐI CAO — `touch:` CHỈ ĐƯỢC SIẾT, KHÔNG ĐƯỢC NỚI

```
Mọi con số HÌNH HỌC ở bậc `touch:` phải ≤ con số nền.
Máy tính bảng dùng CHUNG cỡ với laptop. Không có ngoại lệ.
```

**Đây là quyết định của người dùng, không phải sở thích kỹ thuật.** Bản đầu của
đợt này làm đúng ngược lại — nâng chiều cao thanh header 44→48px, control
30→36px, chip 22→28px, nút icon 24→40px, dòng bảng 36→40px. Kết quả bị bác với
đúng một câu: *"các button các phần khác đang bị phóng to"*. Ba lý do nó hỏng:

1. **Trông như lỗi hiển thị.** Nút to giữa một thanh công cụ toàn chip nhỏ đọc
   ra như trang bị zoom nhầm, chứ không đọc ra "dễ bấm hơn".
2. **Ăn mất chỗ ở đúng máy thiếu chỗ nhất.** iPad có ÍT chiều cao nhất trong
   các thiết bị đang hỗ trợ; mỗi 4px/dòng là mất ~10% số dòng nhìn thấy.
3. **Lan ra như vết dầu.** Nâng một thứ thì thứ cạnh nó phải nâng theo cho khỏi
   so le — chỉ một control 30→36px kéo theo cả thanh, cả dãy icon, cả bảng tên.

**Cách đúng để nút vẫn bấm được:** nới hộp nhận chạm bằng lớp `::after` TRONG
SUỐT (§3.3). Hộp bấm rộng ra, hình vẽ không đổi một pixel nào.

### 3.1. Khi thật sự cần đổi cỡ — CHỈ ĐƯỢC HẠ

```ts
// ✅ ĐÚNG — máy tính bảng dùng chung cỡ với laptop
export const HEADER_CONTROL_HEIGHT = 'h-7.5 wide:h-10';
export const PAGE_CHIP_HEIGHT      = 'h-5.5 wide:h-7';

// ✅ ĐÚNG — SIẾT để chống tràn hàng (đệm ngang không giúp bấm trúng)
xl: 'h-11 px-5 touch:h-10 touch:px-3.5'

// ❌ SAI — nới ở bậc `touch:`. Đây chính là lỗi đã bị bác.
export const HEADER_CONTROL_HEIGHT = 'h-7.5 touch:h-10 wide:h-10';
export const PAGE_CHIP_HEIGHT      = 'h-5.5 touch:h-7  wide:h-7';
```

### 3.2. Bảng cỡ — máy tính bảng KHÔNG có cột riêng

| Loại control | Desktop | Máy tính bảng | Bấm trúng nhờ đâu |
|---|---|---|---|
| Nút kit2 `<Button>` | theo `size` | **hạ 1 bậc + siết đệm** | vốn đã ≥ 30px |
| Nút icon thanh header | 30px | **30px — y hệt** | `::after` nới dọc → 42px |
| Chip tab của trang | 22px | **22px — y hệt** | `::after` nới lên → 32px |
| Icon trong Dock | 44px | **40px** (chống tràn) | vốn đã rất to |
| Ô bảng / hàng chọn | tuỳ mật độ | **y hệt desktop** | hàng kéo hết bề ngang |
| Checkbox / radio trong bảng | 16px | **16px — y hệt** | `::after` nới → 32px |
| Tay nắm Splitter | 4px | **4px — y hệt** | `::after` nới → 16px |

### 3.3. ⛔ Nới vùng chạm = lớp `::after` trong suốt

Ô 16px phải giữ nguyên 16px; chỉ **hộp nhận chạm** rộng ra. Trình duyệt tính
vùng bấm theo cả hộp con, nên một `::after` trong suốt phủ rộng ra ngoài là đủ.

```tsx
// ✅ ĐÚNG — hình giữ nguyên, chỉ hộp nhận chạm rộng ra
<Checkbox className="relative touch:after:absolute touch:after:-inset-2 touch:after:content-['']" />

// ❌ SAI — `p-*` nới cả vùng tô nền: phần tử có `bg-*` sẽ TO RA THẬT
<Checkbox className="touch:p-2 touch:-m-2" />

// ❌ SAI — phóng cả ô, vỡ nhịp cột bảng
<Checkbox className="touch:size-8" />
```

**Ba cái bẫy của `::after`:**

- `content-['']` **BẮT BUỘC** — thiếu là pseudo-element không sinh ra và cả
  token im lặng thành vô tác dụng.
- Phần tử phải có `relative`, nếu không lớp phủ neo nhầm tổ tiên.
- **Đừng nới về phía có phần tử khác.** Hai vùng chạm chồng nhau thì cú bấm rơi
  vào phần tử nằm trên trong thứ tự vẽ — lỗi im lặng, rất khó lần ra. Control
  xếp hàng ngang cách nhau 4px thì chỉ nới DỌC; chip dính đáy thanh header thì
  chỉ nới LÊN TRÊN.

---

## 4. ⛔ Chật chỗ thì CUỘN, KHÔNG ẨN BỚT

Ẩn một mục điều hướng trên iPad = người dùng iPad **mất hẳn đường vào** chức năng
đó, không có gì thay thế. Trên màn hẹp, thứ tự ưu tiên:

```
1. Cho CUỘN NGANG (dải chip, dãy icon, thanh công cụ)
2. Rút gọn NHÃN (bỏ chữ, giữ icon + tooltip/aria-label)
3. Gom vào MENU "…" — chỉ khi 1 và 2 đều không đủ
4. ⛔ ẨN HẲN — CẤM, trừ khi là chi tiết TRANG TRÍ (sọc chéo, ngoặc góc)
```

### 4.0. Bậc 1 + 2 cho DẢI TAB của trang — đã có sẵn, ĐỪNG DỰNG LẠI

Dải tab trên thanh header (`<PageHeader nav={…}>`) đã cài sẵn **bậc 1 (cuộn)** và
**bậc 2 (rút gọn nhãn)**. Call-site không phải làm gì thêm.

| Thứ | Ở đâu |
|---|---|
| Chip tab | `PageHeaderNav` → `PageHeaderChip` (`src/shared/widgets/header/page-header/`) |
| Sàn chống-sập của ô nav | `pageHeaderStyles().navCell` — `max-lg:min-w-fit touch:min-w-fit` |
| Rút gọn nhãn | `PageHeaderNavItem.shortLabel` — render CẢ HAI nhãn, CSS chọn bằng `labelFull` / `labelShort` |
| Chia đôi dải quanh bảng tên | `PageHeader.navSplitAt` (mặc định cắt giữa) |
| Nới vùng chạm cho chip | `touch:after:*` trong `pageNavStyles` (§3.3) |

⛔ **Cả hai nhãn (`label` và `shortLabel`) cùng render, CSS chọn bản nào hiện.**
`hidden` = `display:none` nên bản bị ẩn rời khỏi cả thứ tự Tab lẫn cây trợ năng —
không có control trùng. Đừng đổi sang `useMediaQuery` trong JS: header sẽ nháy
một khung hình lúc mount và nháy lại mỗi lần xoay máy.

⛔ **Chip LUÔN in chữ**, kể cả bản rút gọn — KHÔNG được rút tab xuống icon-only.

> **Bậc 3 (gom dải tab vào một menu xổ) CHƯA có trong base.** Nếu một trang thật
> sự cần nó, dựng trong `page-header/` rồi cập nhật bảng này — đừng dựng bản cục
> bộ trong feature.

### 4.1. ⛔ Cuộn ngang PHẢI có `overscroll-x-contain`

```tsx
// ❌ SAI — vuốt hết dải là Safari hiểu thành "lùi lại trang trước" → thoát màn
<div className="overflow-x-auto scrollbar-hidden">

// ✅ ĐÚNG
<div className="overflow-x-auto overscroll-x-contain scrollbar-hidden">
```

Đây là lỗi im lặng khó chịu nhất trên iPad: người dùng vuốt xem hết dãy tab thì
bị đẩy ngược về màn trước, tưởng app tự thoát. Trên desktop thuộc tính này không
có tác dụng (chuột không sinh cử chỉ vuốt biên) → thêm vào là an toàn tuyệt đối.

### 4.2. Vùng cuộn lồng nhau

Vùng cuộn bên trong phải "nuốt" đà vuốt của chính nó, nếu không đà chuyển tiếp ra
vùng cha và cả trang trôi. `globals.css` đã đặt `overscroll-behavior: contain`
cho mọi `.overflow-*-auto/scroll` **dưới `@media (hover:none) and (pointer:coarse)`**
— không cần lặp lại ở từng component.

---


### 4.3. Dải KPI đầu màn — dùng component có sẵn, đừng tự khai lưới

> ⚠️ Không có file constants riêng cho pattern này (`kpi-strip.ts` không tồn
> tại trong `src/shared/constants/`) — dùng `<BoxGrid min={...}>` (xem
> `reuse-first.md` §3.4) để khai lưới KPI responsive thay vì tự viết
> `grid-cols-2 md:grid-cols-3` từng màn. Nếu pattern lặp lại ≥3 lần với cùng
> breakpoint, mới cân nhắc trích thành constants dùng chung.

Lý do: mỗi màn tự khai lưới riêng (`grid-cols-2 md:grid-cols-3`…) thì
ở dải 768–1023px số cột LUÔN nhỏ hơn số thẻ, dải tách thành 2-3 hàng và ăn thêm
56–112px chiều cao — đúng thứ máy tính bảng có ít nhất. `BoxGrid` tự suy số
cột theo `min` width thay vì hardcode breakpoint theo cột, nên hành vi nhất
quán hơn qua các dải màn hình — kiểm tra thực tế trên thiết bị đích trước khi
coi đây là giải pháp cuối cùng cho case cụ thể của bạn.
## 5. ⛔ Đơn vị chiều cao — `dvh`, không phải `vh`

Safari iOS tính `100vh` theo lúc thanh URL + thanh công cụ **đã thu lại**, tức
lớn hơn vùng thực sự nhìn thấy ~60–90px. Khung app cao `100vh` vì thế thò xuống
dưới thanh công cụ, kéo theo mọi thứ neo đáy (Dock, thanh hành động) **ra ngoài
màn — người dùng không thấy đâu**.

| Dùng cho | Class |
|---|---|
| Khung app toàn màn | `h-dvh` (KHÔNG `h-screen`) |
| Trang canh giữa (đăng nhập) | `min-h-dvh` (KHÔNG `min-h-screen`) |
| Vùng cuộn "viewport − header" | `HEADER_HEIGHT_CLASS.contentMaxHeight` |

Trên mọi trình duyệt máy tính `dvh === vh` (không có thanh công cụ co giãn) →
đổi sang `dvh` **không lệch một pixel nào trên PC/laptop**.

⚠️ `dvh` chỉ ổn định khi tài liệu KHÔNG cuộn (`body { overflow: hidden }` — app
này đã vậy). Nếu tài liệu cuộn được, `dvh` đổi theo thanh công cụ và gây giật;
khi đó dùng `svh`.

---

## 6. ⛔ Vùng an toàn (safe area)

`globals.css` gom về 4 biến, **luôn = 0px trên PC/laptop và trong tab trình
duyệt**, chỉ khác 0 khi chạy toàn màn trên máy có vạch Home (~20px):

```css
--safe-t · --safe-r · --safe-b · --safe-l
```

⛔ **Mọi phần tử neo đáy màn PHẢI cộng `--safe-b`.** Không cộng thì nó nằm chồng
lên vạch Home: vuốt lên để bấm hoá ra là cử chỉ thoát app.

```tsx
// ❌ SAI
<nav className="fixed bottom-4" />
style={{ bottom: '16px' }}

// ✅ ĐÚNG — `calc(16px + 0px)` = đúng 16px như cũ trên desktop
<nav className="fixed bottom-[calc(1rem+var(--safe-b,0px))]" />
style={{ bottom: 'calc(16px + var(--safe-b, 0px))' }}
```

⛔ **KHÔNG viết thẳng `env(safe-area-inset-*)` rải rác trong component** — gom về
`globals.css` để khi Apple đổi hành vi (đã đổi 3 lần từ iOS 11) chỉ sửa một chỗ.

⚠️ `--safe-*` chỉ khác 0 khi `index.html` có `viewport-fit=cover`. Gỡ thuộc tính
đó là toàn bộ mục này im lặng trở thành no-op.

---

## 7. ⛔ Hover trên cảm ứng — "sticky hover"

`:hover` trên iPadOS **không phải trạng thái thoáng qua**: chạm một phần tử là
WebKit gán `:hover` và **GIỮ NGUYÊN cho tới lần chạm kế tiếp ở chỗ khác**.

| Nguồn hover | Có tự an toàn không? |
|---|---|
| `hover:` của Tailwind | ✅ **CÓ** — Tailwind v4 tự bọc trong `@media (hover: hover)` |
| CSS viết tay (`.foo:hover {}`) | ❌ **KHÔNG** — phải tự bọc media query |
| Hiệu ứng dùng `:has()` / anh-em (`+`) | ❌ **KHÔNG** — và hỏng nặng nhất |

```css
/* ✅ ĐÚNG — vô hiệu hiệu ứng chỉ có nghĩa khi có con trỏ để rê */
@media (hover: none) and (pointer: coarse) {
  .mac-dock-container .mac-dock-item,
  .mac-dock-container .mac-dock-item:hover {
    transform: none;
  }
}
```

⛔ **KHÔNG đặt thông tin CHỈ hiện khi hover** (tooltip là nguồn duy nhất của một
nhãn, nút hành động chỉ hiện khi rê chuột vào hàng). Trên iPad người dùng không
bao giờ thấy được. Nhãn phải có `aria-label` + hiện thường trực ở `touch:`.

---

## 8. ⛔ Bẫy đã gặp — kiểm trước khi commit

| Bẫy | Triệu chứng trên iPad | Cách chữa |
|---|---|---|
| Thanh cố định rộng hơn màn + `left-1/2 -translate-x-1/2` | Cụt cả hai đầu, mất mục đầu/cuối, không với tới được | `max-lg:max-w-[calc(100vw-1rem)]` + cuộn ngang — gate theo **bề rộng**, xem §8.1 |
| `w-px` trong flex có cuộn | Vạch ngăn biến mất | thêm `shrink-0` |
| Thiếu `-webkit-text-size-adjust: 100%` | Xoay ngang → chữ tự phình → tràn ô cao cố định, các dòng đè nhau | đã đặt ở `html` trong `globals.css` |
| Thiếu `overscroll-behavior: none` ở `body` | Vuốt quá đáy → cả khung app trượt, lộ nền dưới → nhìn như vỡ layout | đã đặt ở `body` |
| `100vh` | Dock/thanh đáy nằm ngoài màn | `dvh` (§5) |
| Neo đáy không cộng `--safe-b` | Đè vạch Home, bấm ra thoát app | §6 |
| `:hover` CSS viết tay | Icon kẹt ở trạng thái phóng to sau khi bấm | §7 |
| Cuộn ngang thiếu `overscroll-x-contain` | Vuốt hết dải → bị đẩy về màn trước | §4.1 |
| Số điện thoại / mã dạng số | iOS tự biến thành link xanh, sai màu chữ | `<meta name="format-detection" content="telephone=no">` |
| `maximum-scale=1` / `user-scalable=no` | Không phóng được bảng số liệu dày | ⛔ CẤM khai |

### 8.1. ⛔ Chọn gate cho ĐÚNG loại vấn đề — đừng gộp làm một

Câu hỏi phải tự trả lời trước khi viết class: **"Nếu người dùng cắm chuột vào
iPad này thì vấn đề còn không?"**

| Vấn đề | Cắm chuột thì? | Gate ĐÚNG |
|---|---|---|
| Thanh 961px trên màn 768px | **Vẫn tràn y hệt** | `max-lg:` — chuyện BỀ RỘNG |
| Bảng 8 cột không đủ chỗ | **Vẫn chật y hệt** | `md:` / `lg:` — chuyện BỀ RỘNG |
| Chip 22px khó bấm | **Hết khó** (chuột nhắm tốt) | `touch:` — chuyện NGÓN TAY |
| Icon kẹt ở trạng thái hover | **Hết kẹt** | `touch:` — chuyện NGÓN TAY |

⛔ **Gate chuyện bề rộng bằng `touch:` là để lọt cảnh iPad dọc cắm chuột / bàn
phím Magic** — lúc đó `pointer: fine` nên `touch:` KHÔNG khớp, và bố cục vỡ y
như cũ. Đây là lỗi dễ mắc nhất khi mới dùng `touch:`.

Một thành phần có thể cần **cả hai gate cho hai việc khác nhau** — đó là bình
thường, không phải thừa. Xem `dock.theme.ts → DOCK_NARROW_FIT_CLASS` làm mẫu:
`max-lg:` lo giới hạn bề ngang + cuộn, `touch:` lo siết khe giữa icon.

⛔ **Và có ca cần cả hai gate cho CÙNG MỘT việc.** Sàn chống-sập của cụm tâm
header (`pageHeaderStyles.navCell` · `plate` · `cluster`) từng chỉ gate `touch:`,
nên **iPad dọc cắm chuột / bàn phím Magic** — `pointer: fine` ⇒ `touch:` không
khớp — mất sàn và chip đầu dải bị cắt 86px, không cuộn tới được. Đã bổ sung
`max-lg:` bên cạnh `touch:`. Khi viết sàn/`justify` cho vùng cuộn, hỏi lại câu
của bảng trên: *"cắm chuột vào thì vấn đề còn không?"* — còn thì phải có gate bề
rộng, kể cả khi đã có `touch:`.

---

## 9. Hạ tầng PWA — đã có gì, còn thiếu gì

| Thứ | Ở đâu | Trạng thái |
|---|---|---|
| Manifest | `public/manifest.webmanifest` | ✅ có (mảng `icons` còn RỖNG) |
| Meta `viewport-fit=cover` + cụm `apple-*` | `index.html` | ✅ có |
| Biến thể `touch:` / `standalone:` | `src/styles/globals.css` | ✅ có |
| Biến `--safe-*` | `src/styles/globals.css` (`:root`) | ✅ có |
| Chiều cao header 2 bậc (`h-11` → `wide:h-14`) + `contentMaxHeight` dùng `dvh` ở `touch:` | `src/shared/constants/layout.ts` | ✅ có |
| Cỡ control / chip header 2 bậc (`HEADER_CONTROL_HEIGHT`, `PAGE_CHIP_HEIGHT`) | `src/shared/widgets/header/header.theme.ts` | ✅ có |
| Dock vừa màn + an toàn đáy | `src/shared/widgets/dock/dock.theme.ts` | ✅ có |
| Icon PWA (192 · 512 · 512-maskable · apple-touch 180) | `public/icons/` | ⛔ **CHƯA CÓ** |

⛔ **Trước khi phát hành**: bỏ icon vào `public/icons/`, khai vào mảng `icons`
của manifest, và thêm `<link rel="apple-touch-icon" sizes="180x180">` vào
`index.html`. Thiếu icon thì "Thêm vào Màn hình chính" trên iOS lấy ảnh chụp
màn hình làm biểu tượng — trông như app hỏng.

**Chưa có (cố ý):** service worker. iOS **không cần** SW để chạy toàn màn —
manifest + cụm `apple-*` là đủ.

⛔ **Chỉ được đăng ký MỘT service worker ở scope `/`.** SW đăng ký sau chiếm
quyền của SW trước. Dự án nào thêm cả thông báo đẩy lẫn chạy offline thì phải
GỘP vào một file, đừng đăng ký hai.

---

## 10. ✅ Checklist trước khi commit thay đổi cho máy tính bảng

### Hàng rào an toàn
- [ ] Mọi thay đổi cho iPad đi qua `touch:` (hoặc `md:`/`lg:` nếu thật sự là chuyện bề rộng)?
- [ ] KHÔNG sửa bất kỳ giá trị nào ở bậc `xl` / `2xl` / `wide`?
- [ ] KHÔNG sửa giá trị `base` đang dùng chung với desktop?
- [ ] Chỉ THÊM class, không đổi/xoá class cũ?

### Vùng chạm
- [ ] KHÔNG có con số hình học nào ở `touch:` LỚN HƠN con số nền (§3.0)?
- [ ] Control nhỏ đã được nới vùng chạm bằng `::after` trong suốt (§3.3)?
- [ ] KHÔNG dùng `touch:p-2 touch:-m-2` cho phần tử có nền (§3.3)?
- [ ] Mọi `::after` đều có `content-['']` và phần tử cha có `relative` (§3.3)?

### Bố cục
- [ ] Không phần tử nào đè lên nhau ở 768 · 820 · 1024 · 1180 · 1366?
- [ ] Chật chỗ → cho cuộn, KHÔNG ẩn chức năng (§4)?
- [ ] Mọi `overflow-x-auto` có `overscroll-x-contain` (§4.1)?
- [ ] Không còn `h-screen` / `min-h-screen` / `100vh` ở khung toàn màn (§5)?
- [ ] Phần tử neo đáy đã cộng `--safe-b` (§6)?

### Cảm ứng
- [ ] CSS `:hover` viết tay đã bọc `@media (hover: none)` (§7)?
- [ ] Không có thông tin/hành động CHỈ hiện khi hover (§7)?

### Kiểm chứng
- [ ] `npx tsc --noEmit` exit 0
- [ ] `npx eslint {đường-dẫn}` không thêm error mới
- [ ] Xem lại ở **1280 · 1440 · 1536 · 1920** → **giống hệt trước khi sửa**
- [ ] Thử ở 768 (dọc) và 1024 (ngang) với chế độ giả lập cảm ứng của DevTools
      (⚠️ phải bật giả lập cảm ứng, nếu không `touch:` KHÔNG khớp và bạn đang
      xem nhầm bản desktop)

---

## 11. Khi vi phạm

- Sửa giá trị ở bậc `xl` / `2xl` / `wide` để "cho iPad" → **revert** (đụng laptop)
- Tách iPad bằng bề rộng thay vì `touch:` mà không justify → **revert**
- Ẩn chức năng/điều hướng ở màn hẹp thay vì cho cuộn → **block merge**
- `overflow-x-auto` thiếu `overscroll-x-contain` → **block merge**
- Neo đáy màn thiếu `--safe-b` → **block merge**
- `100vh` cho khung toàn màn → **block merge**
- Khai `maximum-scale` / `user-scalable=no` → **revert** (chặn trợ năng)
- Viết thẳng `env(safe-area-inset-*)` trong component thay vì `--safe-*` → fail review
- Bất kỳ con số hình học nào ở `touch:` LỚN HƠN con số nền → **revert** (§3.0)
- Đăng ký service worker mới ở scope `/` (đè SW thông báo đẩy) → **block merge**

---

## 12. Cross-references

- Đơn vị + breakpoint → `tailwind-conventions.md`
- Thang 6 bậc bề rộng (nguồn chuẩn) → `src/shared/widgets/header/header.theme.ts`
- Bài học "phóng to là vỡ bố cục" → `tv-display-mode.md`
- Padding / mật độ → `visual-hierarchy.md`
- Token tập trung ở widget → `widget-composition.md`
- Kit2 catalog → `reuse-first.md`
