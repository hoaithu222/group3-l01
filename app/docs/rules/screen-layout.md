# Lưới màn hình và định dạng nội dung

⚠️ **Đây là tài liệu THAM CHIẾU, bóc từ bản vẽ của một ngân hàng cụ thể.** Con số
ở đây đo từ chính các màn feature (`822:28161`, `220:8253` — đo trên instance,
không phải chữ in trên slide). Dự án mới phải đối chiếu lại với bản vẽ của chính
nó; ⛔ đừng chép số ở đây vào code như thể chúng là hằng số của base.

Hai thứ file này chịu trách nhiệm, và không file nào khác đang giữ: **lưới màn
hình** và **cách viết nội dung tiếng Việt**. Mọi thứ khác đã có nhà —
`styling-nativewind.md` (token), `ui-components.md` (dùng component),
`responsive.md` (co giãn), `webview.md` (màn HTML), `mobile-ux.md` (hành vi di động).

---

## Lưới — sáu con số, và chỉ MỘT con được viết cứng

Cây số đo này lặp y hệt trên 9 màn, nên nó là lưới chứ không phải trùng hợp.

| Số đo                     | Giá trị | Suy ra từ         | Viết thế nào |
| ------------------------- | ------- | ----------------- | ------------ |
| Bề rộng khung máy         | 375     | khung Figma       | — không phải token |
| **Lề ngang**              | **16**  | `x=16` mọi khối   | `px-md` |
| Bề rộng nội dung          | 343     | `375 − 16×2`      | ⛔ đừng viết cứng |
| Hở AppBar → khối đầu      | 8       | `y=8`             | `py-xs` ở khối đầu của MÀN — ⚠️ `Screen` KHÔNG tự chừa khe này nữa (trước có `pt-xs`, cộng `py-xs` của màn thành 16 ⇒ "topbar cách xa nội dung"); hàng `AppBar` cao 48 chứ không phải 56 của Figma |
| **Khe giữa hai khối**     | **24**  | đo giữa 4 khối    | `gap-xl` |
| **Tiêu đề nhóm → thẻ**    | **12**  | tiêu đề 24, thẻ `y=36` | `gap-sm` |
| **Đệm trong thẻ**         | **16**  | `Padding/Pa16`    | `p-md` |
| Bề rộng list item         | 311     | `343 − 16×2`      | ⛔ đừng viết cứng |
| **Khe giữa hai list item**| **12**  | `y=16 → 60`, item cao 32 | `gap-sm` |

⛔ **Chỉ số `16` (lề) được viết thẳng.** `343`, `311`, `165.5`, `276` là **kết quả
phép trừ trên khung 375**, không phải hằng số. Máy 320–360dp thì `w-[343px]` tràn
mép phải — đây đã là điều cấm trong `responsive.md`, ở đây chỉ nêu lại đúng những
con số hay bị chép.

```tsx
<Screen padded>                        {/* px-md = lề 16 */}
  <View className="gap-xl">            {/* 24 giữa hai khối */}
    <Section title="Thông tin đơn hàng">   {/* Section tự lo khe 12 xuống thẻ */}
      <Card>                           {/* p-md = 16, gap-sm = 12 giữa các dòng */}
        <ListItem label="Ngày đặt hàng" value="17/04/2026" />
        <ListItem label="Số tiền thanh toán" value="89.500.000 VND" />
      </Card>
    </Section>
  </View>
</Screen>
```

⛔ **Lề 16 chỉ có MỘT chủ.** `<Screen padded>` (mặc định) đã cho vùng nội dung `px-md`; khối con
tự thêm `px-md`/`p-md` là chữ thụt vào 32dp, kẻ `border-b` và nền của hàng thụt theo. Màn toàn
danh sách/ô tìm kiếm/tab tự có lề thì `<Screen padded={false}>`; hàng tự có `px-md` lẫn trong màn
`padded` thì bọc `-mx-md`; khung xương cùng chủ lề với nội dung thật. Chi tiết:
`ui-components.md` §5 "`Screen padded` + khối tự có `px-md`".

⚠️ **Ba con số 24 · 12 · 12 nằm rất gần nhau và cực dễ hoán vị.** Đặt nhầm khe
khối thành 12 hay khe dòng thành 24 thì mắt thường không bắt được trên một màn —
chỉ lộ ra khi đặt hai màn cạnh nhau.

---

## Bo góc theo CẤP, không theo cảm giác

| Cấp                         | Bo góc                          |
| --------------------------- | ------------------------------- |
| Chip · badge · viên thuốc   | `rounded-sm` (16) hoặc `rounded-full` |
| Thẻ, khối nội dung          | `rounded-md` (24)               |
| Ô nhập, nút                 | theo component, ⛔ đừng đè       |

`Border/Bo16` và `Border/Bo24` là hai biến RIÊNG trong Figma, không phải hai lần
chọn ngẫu nhiên. Trộn hai cấp trên cùng một màn là thứ lộ ra ngay khi chụp màn
đặt cạnh bản vẽ.

⚠️ Nhắc lại cái bẫy vấp nhiều nhất: `rounded-sm` ở đây là **16dp**, không phải
2px như Tailwind gốc, và `rounded-lg` là **32dp** chứ không phải 8px. Xem
`styling-nativewind.md`.

---

## Định dạng nội dung — tiếng Việt của ngân hàng

| Loại              | Viết thế nào                             | Ví dụ                        |
| ----------------- | ---------------------------------------- | ---------------------------- |
| **Số tiền**       | dấu **chấm** ngăn hàng nghìn, đơn vị `VND` viết hoa, cách một dấu cách | `89.500.000 VND` |
| Ngày              | `DD/MM/YYYY`, **có số 0 đứng đầu**       | `17/04/2026`                 |
| Dung lượng tệp    | `formatFileSize` — dấu **phẩy** thập phân, nhãn `KB`/`MB`/`GB` | `1,5 MB` · `128 MB` |
| CCCD / hộ chiếu   | ⛔ **không** nhóm, ⛔ **không** che        | `038399999999`               |
| Số điện thoại     | ⛔ **không** nhóm, ⛔ **không** che        | `0999999999`                 |
| Mã đơn / mã SP    | nguyên văn                                | `202610120` · `KHS5C`        |
| Đơn vị vàng       | `chỉ` viết thường, tuổi vàng `24K`, độ tinh khiết trong ngoặc, gạch ngang `–` | `5 chỉ – 24K (999.9)` |
| Nhãn, tiêu đề     | **sentence case** — chỉ hoa chữ đầu       | `Phương thức nhận hàng`      |
| Xưng hô           | ngôi thứ hai là **"Quý khách"**           | `Quý khách vui lòng kiểm tra lại.` |

### Tiền — dùng `formatCurrency`, ⛔ đừng tự nối chuỗi

```tsx
import { formatCurrency, formatNumber } from '@/shared/utils/format/currency.utils';

formatCurrency(89500000);                    // '89.500.000 VND'
formatCurrency(null, { fallback: '—' });     // '—'  ⛔ không bịa ra '0 VND'
formatNumber(5, { unit: 'chỉ' });            // '5 chỉ'
```

Dung lượng tệp: `formatFileSize(1536)` → `1,5 KB` (`@/shared/utils/format/file-size.utils`;
thiếu số thì truyền `{ fallback: '—' }`). ⛔ Đừng `(bytes / 1048576).toFixed(1)` — ra `3.4 MB` (dấu chấm)
trong khi chỗ khác ra `3,4 MB`: cùng một tệp hiện hai kiểu trên hai màn.

⛔ **Không dùng `toLocaleString()` / `Intl.NumberFormat` trần.** Hermes cắt bớt
ICU: `Intl` có mặt nên code chạy, nhưng dữ liệu ngôn ngữ khác nhau giữa Android
và iOS ⇒ **cùng một số tiền hiện ra hai kiểu trên hai máy**, không lỗi nào báo.
Đúng lý do `date.utils.ts` chọn dayjs thay `Intl.DateTimeFormat`.

⚠️ **Dấu phân cách là chỗ code CỐ Ý LỆCH bản vẽ.** Figma ghi `89,500,000 VND`
bằng dấu **phẩy** ở cả 4 chỗ có số tiền; quy ước Việt Nam là dấu **chấm**. Người
dùng Việt đọc `89,5` là "tám mươi chín phẩy năm", nên ở đây quy ước quốc gia
thắng bản vẽ. Chốt tại đúng một hằng số `THOUSANDS_SEPARATOR` — đổi là sửa một
dòng, ⛔ đừng rải dấu phân cách vào chỗ khác.

### Che dữ liệu — chỉ khi được yêu cầu

```tsx
import { maskAccountNumber } from '@/shared/utils/format/mask.utils';
maskAccountNumber('1234567890');   // '•••• 7890'
```

⛔ **Bản vẽ hiện NGUYÊN số CCCD và số điện thoại.** Tự thêm che là **đổi yêu cầu
nghiệp vụ**, không phải cải tiến giao diện. Chỉ che ở màn nào bản vẽ vẽ che.

⚠️ Ký tự `•` không đọc lên được, nên mọi chỗ dùng mặt nạ phải kèm
`accessibilityLabel` nói đủ nghĩa ("Tài khoản đuôi 7890").

### Viết hoa — là ràng buộc KỸ THUẬT, không phải khẩu vị

⛔ Nhãn viết **sentence case**. `text-overline` là vai trò IN HOA **duy nhất**
được trình sinh thang chữ kiểm `lineHeight` theo ngưỡng chữ hoa 1.5×. Viết hoa ở
vai trò khác thì dấu tiếng Việt chồng hai tầng (`Ẳ`, `Ộ`) bị Android **cắt cụt** —
iOS thì không, nên nó lọt qua review.

---

## Số dòng — đừng cắt cái không được cắt

Đo được trên màn chi tiết: nhãn trái xuống tối đa **2 dòng**, giá trị phải xuống
tối đa **3 dòng**, và cả hai **tự đẩy chiều cao** (list item cao 28 / 32 / 56 / 80
tuỳ nội dung).

⛔ **Đừng đặt `numberOfLines` ở list item chi tiết.** Cắt `Đồng xu Kim Gia Bảo
Hoa Sen, loại 5 chỉ – 24K (999.9)` thành một dòng là giấu mất tuổi vàng — thông
tin người dùng đang cần để đối chiếu.

✅ Chỗ ĐƯỢC cắt: nhãn nút (một dòng, giữ nút không cao lệch bản vẽ), tiêu đề
AppBar, và tên trong danh sách dài.

---

## Trạng thái rỗng và lỗi

```
EmptyState
├ minh hoạ    160
├ khe         16
├ tiêu đề
├ khe         8
├ mô tả       (2 dòng)
└ nút hành động
```

Giọng văn:

- Tiêu đề là **"Thông báo"**. ⛔ Không "Oops", không dấu chấm than.
- Mô tả **2 dòng**, xưng **"Quý khách"**.
- ⛔ Không giọng hoảng hốt: đây là app ngân hàng, người dùng đang nghĩ tới tiền
  của họ. "Đã có lỗi xảy ra!" đọc như tiền có vấn đề.

Lỗi **kết nối** thì phải nói rõ là lỗi kết nối, không phải app hỏng — xem
`mobile-ux.md`, mục "Trạng thái mạng".

---

## Nguồn và điểm chưa chốt

Bóc từ section `822:28161` và `220:8253` (bản vẽ) cùng bộ 9 slide `193:25214`
(đã bóc đầy đủ vào `webview.md`).

⚠️ **Section `220:8253` và `822:*` trỏ vào THƯ VIỆN CŨ**: cùng tên biến
`BgHeaderScreen1` nhưng giá trị `#BBDCDBE5`, khác `#A6CDCC @90%` mà repo đang
dùng. **Đo bố cục ở đó thì được, đo MÀU thì không** — màu phải lấy từ section
"Bản update mới".

Hai chỗ bản vẽ tự mâu thuẫn, ghi ra để người sau khỏi mất buổi chiều đi dò:

| Chỗ                    | Mâu thuẫn                                | Đã chốt |
| ---------------------- | ---------------------------------------- | ------- |
| Khoảng cách số ↔ đơn vị| `100,000VND` (slide 6) vs `100,000 VND` (slide 5) | **có dấu cách** |
| Đơn vị tiền            | `0đ` (header slide 3) vs `VND` mọi nơi khác | **`VND` viết hoa** |
