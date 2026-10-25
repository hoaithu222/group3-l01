# Quy định hiển thị màn hình webview

⚠️ **Đây là tài liệu THAM CHIẾU, không phải luật của base.** Repo này là base
dùng lại cho nhiều dự án; bộ quy định dưới đây bóc từ bản vẽ của một ngân hàng
cụ thể để làm mẫu cho loại màn webview. Dự án mới thì đối chiếu lại với bản vẽ
của chính nó — phần đáng giữ là **cách chia bố cục và các ca biên đã được nghĩ
tới**, không phải mấy con số.

Bóc từ bộ slide **"Quy định hiển thị các màn hình webview — Ứng dụng BIDV
SMARTBANKING"** (Figma `JKRCweXTvHehczYn87NOWK`, section `193:25214` "Tổng quan",
9 slide). Mỗi con số dưới đây đều ghi kèm slide gốc — đừng làm tròn lại, đừng
"cho đẹp hơn".

**Phạm vi**: mọi màn hình webview nhúng trong app SMB, **áp dụng cho giao diện
MASS + PREMIER** (slide 1). Không phải một chức năng riêng lẻ — là mặc định cho
**mọi** webview do đối tác hay do nội bộ dựng.

Vì sao có bộ quy định này: webview là chỗ dễ lộ nhất. Người dùng không biết mình
vừa rời khỏi native, nên một màn webview lệch font/lệch màu/lệch header đọc ra
thành "app hỏng" chứ không thành "trang của đối tác". Slide 2 nói thẳng: mục tiêu
là **đồng bộ giao diện và trải nghiệm với toàn App**.

---

## Cấu trúc chung — ba tầng, đúng thứ tự này

> Slide 2 (`193:25215`), "Cấu trúc chung"

Thiết kế từng chức năng khác nhau, nhưng khung thì cố định:

| #   | Tầng                     | Chứa gì                                                              |
| --- | ------------------------ | -------------------------------------------------------------------- |
| 01  | **Phần Header**          | Logo đối tác (nếu có), tên chức năng, Avatar, icon thao tác (nếu có) |
| 02  | **Vùng thông tin chính** | Banner/Video quảng cáo, thông tin khách hàng, form đăng ký…          |
| 03  | **Thanh điều hướng**     | Icon chức năng / button truy cập nhanh, **luôn ở chân trang**        |

Vùng 02 **sắp theo mức độ quan trọng, ưu tiên từ trên xuống dưới**. Đây là quy
tắc xếp thứ tự, không phải gợi ý: trên điện thoại phần dưới màn hình gần như
không ai cuộn tới.

### Hành vi của thanh điều hướng

Slide 2 ghi rõ ba trạng thái:

- Mặc định: **hiển thị** thanh điều hướng
- Vuốt lên: **ẩn** thanh điều hướng
- Vuốt xuống: **hiển thị** thanh điều hướng

⚠️ Vuốt lên = người dùng đang đọc nội dung, nhường chỗ cho nội dung. Vuốt xuống =
họ đang tìm đường ra, trả thanh lại ngay. Ẩn/hiện theo hướng cuộn chứ không theo
vị trí cuộn.

### Hành vi của HEADER — cùng luật, và có thêm một điều cấm

> Ghi chú thiết kế `DES-GUIDE`, hai bản giống nhau ở hai section khác nhau
> (`259:97527` và `433:28569`) ⇒ đây là luật cho toàn app, không phải cho một màn.

⛔ **Ẩn hết tiêu đề (title) trên header của mọi màn HTML.** Tên chức năng đã nằm
trong chính nội dung trang; để thêm một tiêu đề ở header là lặp lại, và trên màn
375dp thì đó là một dòng chữ ăn chỗ mà không nói thêm gì.

Header ẩn/hiện **cùng luật với thanh điều hướng**: vuốt lên thì ẩn, vuốt xuống
thì hiện. ⚠️ Hai thứ này phải chạy **đồng bộ** — ẩn thanh dưới mà giữ header là
người dùng thấy khung nhảy một nửa.

⚠️ Vì tiêu đề bị ẩn, **nút quay lại là lối ra DUY NHẤT** ở header. ⛔ Đừng ẩn nó
theo cuộn cùng với phần còn lại.

### Vùng an toàn

Thanh điều hướng nằm trên **Home Indicator** (đo được 21dp trên máy mẫu, slide
7). Nhưng đó là số của **đúng chiếc iPhone dựng bản vẽ**.

⛔ Đừng viết cứng chiều cao đáy. Lấy `insets.bottom` lúc chạy — xem
[`mobile-ux.md`](./mobile-ux.md), mục "Vùng an toàn". Cùng lý do cho `insets.top`
ở header: 54dp thanh trạng thái trên slide là tai thỏ của máy mẫu, Android mỏng
hơn hẳn.

---

## Cấu trúc chi tiết

### 01 · Background

> Slide 3 (`193:25298`)

- Dùng **background gradient đã build sẵn ở thư viện** để đồng bộ với toàn App.
- **Trường hợp đặc biệt** mới dùng nền trắng `#FFFFFF`.

Slide vẽ hai máy cạnh nhau đúng để so: gradient là mặc định, trắng là ngoại lệ.

```tsx
<Screen gradient>            {/* ✅ mặc định */}
<Screen gradient={false}>    {/* chỉ khi bản vẽ chức năng gọi đích danh nền trắng */}
```

⛔ Đừng để trang web bên trong tự đổ nền trắng của nó lên trên gradient của
`Screen` — thành hai mảng màu chồng nhau và mép nối hiện ra thành một đường ngang
không có trong thiết kế.

### 02 · Phần Header

> Slide 3 (`193:25298`)

Dùng **Form Header chung đã quy định sẵn trong thư viện**, áp dụng với **tất cả**
chức năng trên App. Chi tiết hiệu ứng xem component **App Bar**.

**Khoảng hở dưới header: `8px`** (slide 3 ghi `8px` trên cả ba mẫu, giữa App Bar
và vùng nội dung).

Ba biến thể slide vẽ ra:

1. Nút quay lại một hàng riêng + **Title xuống dòng dưới** (tiêu đề lớn)
2. Nút quay lại + **Title cùng hàng**
3. Nút quay lại + **logo đối tác** + số dư (`0đ`) + **Avatar**

Số đo lấy từ chính instance App Bar trên slide 3:

| Thành phần                           | Số đo                         |
| ------------------------------------ | ----------------------------- |
| Thanh trạng thái (máy mẫu)           | 54                            |
| Hở thanh trạng thái → hàng nội dung  | 8                             |
| Hàng nội dung                        | 56 = padding 16 × 2 + icon 24 |
| Padding ngang                        | 16                            |
| Icon quay lại                        | 24                            |
| Tiêu đề biến thể lớn                 | 24 / 32, Semibold             |
| **Tổng biến thể tiêu đề cùng hàng**  | **118**                       |
| **Tổng biến thể tiêu đề xuống dòng** | **150**                       |

**Quy định về size logo** (slide 3, nguyên văn):

- Max Height: **28px**
- Weight: **Scale theo tỷ lệ (không làm co kéo ảnh)**

⛔ Logo đối tác **không được kéo méo**. Chiều cao chặn ở 28, chiều ngang tự do
theo tỷ lệ gốc. Logo méo là thứ đối tác nhìn ra đầu tiên.

**Quy định về size Avatar / Icon** (slide 3, nguyên văn):

- Mặc định sử dụng **Avatar size: 40**
- Icon: dùng theo Components đã build sẵn (size icon tắt/bật icon)

### 03 · Vùng thông tin chính

> Slide 4 (`193:25366`)

Thứ tự ưu tiên **cố định**, tính từ ngay dưới header:

1. **Banner / Ảnh quảng cáo**
2. **Thông tin Đặc quyền khách hàng**
3. **Form đăng ký thông tin**

**Banner / video / hình ảnh quảng cáo**

- Vị trí: **đầu tiên, ngay dưới header**.
- Kích thước: **chỉ dùng đúng `343×192px`** (slide 4).
- Có **từ 2 ảnh trở lên** ⇒ **hiển thị thêm slider ở dưới ảnh/banner**.

**Ảnh nội dung** (nội dung được thiết kế dưới dạng các ảnh nối tiếp nhau)

- Tỉ lệ: **1:1**.
- Vị trí: **dưới các mục ưu tiên bên trên**.
- Cách nhau **16px** (`Gap = 16px`, slide 4).

**Form đăng ký / thông tin khách hàng**

⛔ Ô input, tab, search, button… **bắt buộc dùng đúng components đã gửi** về màu
sắc, size, loại. Slide 4 dùng chữ "yêu cầu bắt buộc". Đây là chỗ webview hay
trượt nhất: trang web tự vẽ một cái input bo góc khác, cao khác, và cả màn lộ ra
ngay là "không phải của app".

### 03b · Layout card thông tin — chỉ có HAI loại

> Slide 5 (`193:25737`)

Tuỳ nhu cầu, mục đích và mức độ thông tin: **dùng 1 trong 2 loại Card với size đã
quy định**. Không có loại thứ ba.

|            | **Loại 1**        | **Loại 2**        |
| ---------- | ----------------- | ----------------- |
| Bề rộng    | **W: 276px**      | **W: 165.5px**    |
| Chiều cao  | **theo nội dung** | **theo nội dung** |
| Ảnh/banner | **276×170px**     | **Vuông 1:1**     |
| Bố cục     | cuộn ngang, 1 cột | lưới 2 cột        |

**Padding và giãn cách trong cả hai loại: `12px`** (slide 5 ghi `12px` ở cả bốn
phía của "Vùng text nội dung, điều hướng", giữa hai cột và giữa hai hàng).

⚠️ `165.5px` không phải lỗi gõ. Đó là hai cột trên khung 375: `(375 − 16×2 −
12) / 2 = 165.5`. Nên **đừng viết cứng 165.5** — tính theo bề rộng khung trừ
padding trừ gap, nếu không màn 360dp sẽ tràn.

### 04 · Text nội dung (list item)

> Slide 6 (`193:25481`)

"Tuỳ thuộc vào số lượng, loại nội dung, thành phần cấu thành và mức độ chính phụ
sẽ lựa chọn cách sắp xếp phù hợp." Slide vẽ hai họ sắp xếp:

- **Horizontal** — nhãn trái / giá trị phải, mỗi bên có thể kèm support text; hoặc
  nhãn trái + **Action** ở phải.
- **Vertical** — Main Text / Support text / Left Text xếp dọc, Action nằm phải.

**Thang chữ và màu cho đoạn văn bản/nội dung** (slide 6, nguyên văn):

| Vai trò     | Figma                   | Màu              |
| ----------- | ----------------------- | ---------------- |
| Tiêu đề màn | `Header/T24 – Semibold` | Ink500 `#1A1A1A` |
| Tiêu đề cụm | `Label/T16 – Semibold`  | Ink500 `#1A1A1A` |
| Nội dung    | `Body/T14 – Regular`    | Ink400 `#666666` |

**Giãn cách** (slide 6):

- **16px** phía trên mỗi tiêu đề cụm mới (khoảng cách giữa hai cụm thông tin)
- **8px** giữa tiêu đề cụm và phần body của nó

Ánh xạ sang token của repo — ⛔ đừng viết hex, xem
[`styling-nativewind.md`](./styling-nativewind.md):

```tsx
<Text className="text-header-md font-semibold text-fg-1" />  {/* T24 · Ink500 */}
<Text className="text-label-lg font-semibold text-fg-1" />   {/* T16 · Ink500 */}
<Text className="text-body-md text-fg-2" />                  {/* T14 · Ink400 */}
// giãn cách: mt-md (16) trước tiêu đề cụm, gap-xs (8) trong cụm
```

⚠️ **Slide 6 và bản THỰC THI không khớp nhau ở tiêu đề cụm.** Slide ghi
`Label/T16 – Semibold` màu mực; các màn feature dựng sau (`822:28747`) dùng
`HEADER/T18-Semibold` màu **brand** `Foreground/Primary/Default` — tức là
`<Section tone="brand">` của bộ component, và cả khe cũng khác (12 thay vì 8).

Bảng trên giữ nguyên vì nó là **nguyên văn slide**. Nhưng khi dựng màn mới:

- Màn **webview theo đúng bộ slide** ⇒ theo bảng trên.
- Màn **feature bình thường** ⇒ theo bản thực thi, dùng `<Section>` —
  xem [`screen-layout.md`](./screen-layout.md).

⛔ Đừng "sửa" bên nào cho giống bên nào trước khi hỏi thiết kế. Ghi nhận ở đây
để người sau khỏi tưởng một trong hai là lỗi.

### 05 · Thanh điều hướng — bốn ca

> Slide 7 (`193:25410`)

Slide vẽ đúng bốn ca, không có ca thứ năm:

| Ca                                         | Đáy màn hình                                                                                                                                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phổ biến — 1 button**                    | một nút primary tràn ngang                                                                                                                                                                                |
| **Đính kèm xác nhận điều kiện điều khoản** | checkbox "Tôi đã đọc, đồng ý với các **Điều kiện, điều khoản** giao dịch chung và tìm hiểu về **lưu ý cài đặt các dịch vụ sử dụng xác thực bằng sinh trắc học**" + **hai** nút (outline trái, solid phải) |
| **Ít hơn 4 action**                        | thanh icon, các mục chia đều                                                                                                                                                                              |
| **Nhiều hơn 4 action**                     | 3 action đầu + mục thứ 4 là **"Xem thêm"**                                                                                                                                                                |

⛔ **Không bao giờ nhồi quá 4 mục vào thanh icon.** Mục thứ 4 phải là "Xem thêm",
mở bottom sheet — xem mục 06 bên dưới.

Số đo của thanh icon (đo từ instance trên slide 7, đã quy về khung 375):

| Thành phần              | Số đo                               |
| ----------------------- | ----------------------------------- |
| Padding thanh           | 12                                  |
| Gap giữa các mục        | 8                                   |
| Icon chức năng (có nền) | 40 (glyph 20 ở giữa)                |
| Hở icon → nhãn          | 4                                   |
| Nhãn                    | 12 / 16, Semibold, Ink500 `#1A1A1A` |
| Chiều cao khối nội dung | 84                                  |
| Home Indicator          | 21                                  |
| **Tổng vùng đáy**       | **105** trên máy mẫu                |

Nền thanh: **trắng 90% + backdrop blur 4**, đổ bóng lên trên
(`0 −2 4 rgba(0,0,0,.04)` + `0 −1 16 rgba(0,0,0,.06)`).

⚠️ React Native không có backdrop blur. `BottomActionBar` của repo đổ **nền đặc**
trùng màu nền màn hình thay vì làm mờ — nội dung cuộn phía sau vẫn bị che kín,
đúng ý thiết kế. Đừng đi cài thư viện blur cho riêng ca này.

### 06 · Bottom sheet hiển thị thông tin

> Slide 8 (`193:25636`) và slide 9 (`193:25705`)

Hai kiểu slide gọi tên:

- **BTS dạng list các thông tin** — chọn thông tin từ ô input (slide 8). Có ô
  `Search…` ngay dưới tiêu đề, mục đang chọn có dấu tích.
- **BTS dạng list các thao tác** — mở từ **"Xem thêm"** của thanh điều hướng khi
  có **trên 4 thao tác** (slide 9).

**Các trường hợp khác: dùng loại BTS phù hợp với từng mục đích** (slide 9, ghi
bằng chữ đỏ — tức là đừng ép mọi thứ vào hai kiểu trên).

**Chiều cao** (slide 9, chữ IN HOA trên bản vẽ):

- **MAX HEIGHT: 742PX**
- **MIN HEIGHT: 200PX**

⚠️ 742 đo trên khung **812**. Giữ theo **tỉ lệ** `742/812` chứ đừng viết cứng
742 — trên máy 667pt tấm sẽ tràn khỏi màn. `BottomSheet` của repo đã làm đúng
(`SHEET_MAX_HEIGHT_RATIO` trong `bottom-sheet.styles.ts`).

**Design Note trên slide 8** (nguyên văn):

1. Chạm **vùng ngoài / nút close / Indicator** để tắt bottom sheet.
2. Khi chứa nhiều dữ liệu (bottom sheet đạt max height 742px), khi scroll thì:
   - **Bên trên**: Fixed position vùng Header bottom sheet với **padding dưới
     16px**
   - **Bên dưới**: Fixed position **Home indicator hoặc button**

Nói cách khác: chỉ **danh sách** cuộn. Tiêu đề + ô tìm kiếm dính trên, nút dính
dưới.

⛔ Đừng cho cả tấm cuộn thành một khối. Người dùng cuộn tới mục thứ 30 rồi không
còn thấy ô tìm kiếm lẫn nút xác nhận, và cách duy nhất họ nghĩ ra là vuốt tấm
xuống — mất luôn lựa chọn vừa chọn.

---

## Điều cấm — gom lại một chỗ

| ⛔                                                                                                | Nguồn   |
| ------------------------------------------------------------------------------------------------- | ------- |
| Không dùng nền khác gradient của thư viện, trừ ca đặc biệt dùng `#FFFFFF`                         | slide 3 |
| Không tự dựng header riêng cho webview — dùng Form Header chung, áp dụng cho **tất cả** chức năng | slide 3 |
| Không kéo méo logo đối tác; max height 28px, bề ngang scale theo tỷ lệ                            | slide 3 |
| Không dùng size banner khác `343×192px`                                                           | slide 4 |
| Không tự vẽ input/tab/search/button — **bắt buộc** dùng components đã gửi                         | slide 4 |
| Không tạo loại card thứ ba; chỉ `276px` hoặc `165.5px`                                            | slide 5 |
| Không quá 4 mục trên thanh điều hướng — mục thứ 4 là "Xem thêm"                                   | slide 7 |
| Bottom sheet không vượt `742px`, không thấp hơn `200px`                                           | slide 9 |
| Khi bottom sheet chạm max height: header và nút **fixed**, chỉ list cuộn                          | slide 8 |

---

## ⚠️ Bản vẽ KHÔNG nói gì về những thứ này

Bộ slide này bàn về **bố cục và thành phần**, không bàn về vòng đời tải trang. Ba
thứ dưới đây **không có trong 9 slide** — đừng trích dẫn bản vẽ cho chúng:

- **Thanh tiến trình tải trang.** Không slide nào vẽ. Trong khi chờ, dùng
  `Skeleton` theo hình dạng nội dung sắp hiện (banner + đoạn văn), đừng vòng quay
  giữa màn — người dùng không đoán được sắp có gì.
- **Trạng thái lỗi / mất mạng của webview.** Không slide nào vẽ. Luật chung của
  repo vẫn áp dụng: câu lỗi phải nói rõ là lỗi **kết nối**, và ⛔ đừng đăng xuất
  người dùng vì một lỗi mạng — xem [`mobile-ux.md`](./mobile-ux.md), mục "Trạng
  thái mạng là chuyện THƯỜNG XUYÊN".

  ⚠️ **Đính chính:** bộ SLIDE không vẽ, nhưng **màn feature `822:32193` thì có
  vẽ đầy đủ** trạng thái rỗng/lỗi. Giải phẫu và giọng văn đã bóc sang
  [`screen-layout.md`](./screen-layout.md), mục "Trạng thái rỗng và lỗi" — đọc
  ở đó trước, ⛔ đừng tự chế.
- **Nút đóng (✕) trên chính màn webview.** Bản vẽ chỉ có **nút quay lại** ở
  header (slide 3) và nút close ✕ trên **bottom sheet** (slide 8). Đừng suy ra
  một nút ✕ cho màn hình.

Cần một trong ba thứ trên ⇒ hỏi thiết kế, đừng tự chế rồi ghi là "theo Figma".

---

## Ánh xạ sang bộ component

Xem [`src/shared/ui/index.ts`](../../src/shared/ui/index.ts) cho danh sách đầy đủ.

| Quy định                                                                          | Component                                                                             | Ghi chú                                                                                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Background gradient / nền trắng ca đặc biệt (slide 3)                             | `Screen`                                                                              | `gradient` mặc định BẬT. ⚠️ Có gradient thì `AppBar` phải trong suốt — đừng truyền `opaque`.                       |
| Phần Header, ba biến thể (slide 3)                                                | `AppBar`                                                                              | `variant="compact"` = tiêu đề cùng hàng (118); `variant="large"` = tiêu đề xuống dòng (150). Số đo đã khớp bản vẽ. |
| Logo đối tác + số dư + Avatar trên header (slide 3)                               | `AppBar leading` / `actions` + `Avatar`                                               | Hai khe nhận `ReactNode`. Logo max-height 28 phải tự chặn ở nơi dùng.                                              |
| Slider dưới banner khi ≥ 2 ảnh (slide 4)                                          | `SliderDot`                                                                           | Chỉ là chấm chỉ vị trí.                                                                                            |
| Card thông tin loại 1 / loại 2 (slide 5)                                          | `Card`                                                                                | Có `title`/`footer`/`onPress`. ⚠️ Không có biến thể `276` / `165.5` sẵn — nơi dùng tự đặt bề rộng.                 |
| Text nội dung, list item ngang/dọc (slide 6)                                      | `ListItem`                                                                            | Cặp nhãn–giá trị + support text + action.                                                                          |
| Thanh điều hướng 1–2 button (slide 7, ca "phổ biến" và ca "điều kiện điều khoản") | `BottomActionBar` + `Button` + `Checkbox`                                             | Vùng nút cố định đáy, đã cộng `insets.bottom`.                                                                     |
| Thanh điều hướng dạng icon ≤ 4 mục (slide 7)                                      | `BottomNav`                                                                           | `BottomNavItem` có `icon`/`activeIcon`/`label`/`badge`.                                                            |
| Bottom sheet list thông tin có ô tìm kiếm (slide 8)                               | `BottomSheet` + `SearchInput` + `ListItem`                                            | `SHEET_MAX_HEIGHT_RATIO = 742/812` đã đúng slide 9.                                                                |
| Bottom sheet list thao tác "Xem thêm" (slide 9)                                   | `BottomSheet` + `ListItem`                                                            |                                                                                                                    |
| Khung xương lúc tải                                                               | `Skeleton`, `SkeletonParagraph`, `SkeletonParagraphWithIcon`, `SkeletonBottomBarItem` | Không có trong bản vẽ — xem mục cảnh báo ở trên.                                                                   |
| Trạng thái rỗng / lỗi                                                             | `EmptyState`                                                                          | Không có trong bản vẽ — xem mục cảnh báo ở trên.                                                                   |

### Bản vẽ đòi mà bộ component CHƯA CÓ

1. **Component webview** — không có gì bọc `react-native-webview` trong
   `src/shared/ui/`. Cả bộ quy định này chưa có chỗ để gắn vào.
2. **Banner / ảnh quảng cáo `343×192`** — không có `Banner` hay `ImageView`. Kể
   cả ô ảnh giữ chỗ (placeholder) mà slide 4, 5, 7 đều vẽ cũng chưa có.
3. **Carousel ngang cho banner ≥ 2 ảnh** — chỉ có `SliderDot` (phần chấm). Phần
   cuộn-và-bắt-trang thì chưa.
4. **Lưới card 2 cột `165.5px` và hàng card ngang `276px`** — `Card` là hộp
   trống, chưa có biến thể "Loại 1 / Loại 2" của slide 5 (ảnh trên, khối text 12px
   dưới).
5. **`BottomNav` với mục "Xem thêm" mở bottom sheet** (slide 7 ca > 4 action) —
   `BottomNav` và `BottomSheet` đều có, nhưng chưa có thứ nối hai cái lại; hiện
   mỗi nơi dùng phải tự nối.
6. **Ẩn/hiện thanh điều hướng theo hướng vuốt** (slide 2) — `BottomNav` không có
   prop nào cho việc này.
7. **Header có logo đối tác + số dư** (slide 3, biến thể 3) — `AppBar` nhận
   `ReactNode` nên dựng được, nhưng chưa có biến thể sẵn, và luật "logo max-height
   28, không co kéo" chưa được component nào bảo đảm.

---

## Nguồn

| Slide | Node id     | Tiêu đề                                                                        |
| ----- | ----------- | ------------------------------------------------------------------------------ |
| 1     | `193:25873` | Trang bìa — "Quy định hiển thị các màn hình webview"                           |
| 2     | `193:25215` | Cấu trúc chung                                                                 |
| 3     | `193:25298` | Cấu trúc chi tiết — 01 Background · 02 Phần Header                             |
| 4     | `193:25366` | Cấu trúc chi tiết — 03 Vùng thông tin chính                                    |
| 5     | `193:25737` | Cấu trúc chi tiết — 03 Vùng thông tin chính (layout card)                      |
| 6     | `193:25481` | Cấu trúc chi tiết — 04 Quy định về hiển thị Text nội dung (List item)          |
| 7     | `193:25410` | Cấu trúc chi tiết — 05 Thanh điều hướng                                        |
| 8     | `193:25636` | Cấu trúc chi tiết — 06 Một số màn hình hiển thị thông tin (BTS list thông tin) |
| 9     | `193:25705` | Cấu trúc chi tiết — 06 Một số màn hình hiển thị thông tin (BTS list thao tác)  |

Số đo ghi "slide N" là chữ in trên bản vẽ. Số đo trong hai bảng chi tiết của App
Bar và thanh điều hướng lấy từ chính instance component trên slide, đã quy về
khung 375 (bản vẽ đặt máy mẫu ở tỉ lệ thu nhỏ).
