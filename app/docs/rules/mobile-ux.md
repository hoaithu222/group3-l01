# Quy ước giao diện di động

Những thứ ở đây KHÔNG phải sở thích. Mỗi mục là một lỗi đã gặp trên máy thật.

## Vùng chạm tối thiểu 44dp

Apple và Google cùng khuyến nghị 44dp. Dưới mức đó người dùng bấm trượt và họ
đổ lỗi cho app chứ không cho ngón tay mình.

Biểu tượng nhỏ (20–24dp) thì **nới vùng chạm bằng `hitSlop`**, đừng phóng to
hình vẽ:

```tsx
<Pressable hitSlop={12} onPress={...}>
  <Icon name="view" size="sm" />
</Pressable>
```

⚠️ **Tính ra, đừng cảm tính**: vùng chạm = cỡ icon + 2 × `hitSlop`. `hitSlop={8}` là con số người
ta viết theo phản xạ — và icon 18dp + 16 = **34dp**, thiếu 10. Icon 16 cần `hitSlop` ≥ 14, icon 20
cần ≥ 12, icon 24 cần ≥ 10. Nút CHỈ có chữ nhỏ (liên kết "Thử lại", cao ~20dp) thì nới dọc bằng
`hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}` — ngang chỉ vừa đủ để hai liên kết kề nhau
KHÔNG chồng vùng chạm (bấm "Sửa" mà trúng "Xoá" là mất dữ liệu). `npm run check:touch-targets`
soát ca nút chỉ-icon; chữ nhỏ thì người review phải để mắt.

## Vùng an toàn — lấy từ `useSafeAreaInsets()`, không viết số cứng

Máy Android có thanh ba nút, máy khác dùng thanh vuốt mỏng, máy khác không có
gì. iPhone có tai thỏ hoặc đảo động. Số cứng thì hoặc thừa một dải trống, hoặc
nút nằm ngay dưới thanh vuốt và hệ điều hành nuốt mất cú chạm.

```tsx
const insets = useSafeAreaInsets();
<View style={{ paddingBottom: insets.bottom + 16 }} />;
```

## Bàn phím — `KeyboardAwareScrollView`, không `KeyboardAvoidingView`

`KeyboardAvoidingView` của React Native hành xử **khác nhau giữa hai nền tảng**
(`behavior="padding"` đúng trên iOS, `"height"` đúng trên Android, không giá trị
nào đúng cả hai), nên mọi dự án đều có một đoạn `Platform.select` chép qua chép
lại mà vẫn còn ca lệch.

`KeyboardAwareScrollView` của `react-native-keyboard-controller` đo bàn phím ở
tầng native nên giống nhau trên cả hai, và tự cuộn ô đang nhập vào vùng nhìn
thấy. Xem `AuthScreenLayout.tsx`.

Thêm `keyboardShouldPersistTaps="handled"` cho màn hình có nút: mặc định, cú
chạm đầu tiên chỉ đóng bàn phím và **không tới được nút**.

Cần một thanh phụ NẰM TRÊN bàn phím (nút "Xong" để đóng, hoặc vài nút tắt) thì
dùng **`KeyboardBar`** của bộ chung — ⛔ đừng tự bọc `KeyboardStickyView` nữa,
và ⛔ đừng dùng `InputAccessoryView` của React Native: nó **chỉ chạy trên iOS**,
mà đây là base Android.

⚠️ Thanh đó nằm trên bàn phím, ⛔ **không cộng `insets.bottom`** — cộng vào là
thừa một dải trống đúng bằng vạch gạt ngang.

## Ô nhập — bốn prop hay quên

```tsx
<TextInput
  autoCorrect={false} // bàn phím tự sửa e-mail thành từ tiếng Việt gần giống
  autoCapitalize="none" // iOS mặc định viết hoa chữ đầu → "Abc@x.com"
  autoComplete="email" // để trình quản lý mật khẩu nhận ra ô
  textContentType="emailAddress"
  returnKeyType="next" // nút bàn phím nói đúng bước tiếp theo
/>
```

Thiếu `autoComplete`/`textContentType` thì người dùng phải gõ tay mật khẩu 20 ký
tự trên bàn phím điện thoại.

## `<Modal>` phải khai `supportedOrientations`

Trên iOS, `<Modal>` dựng một view controller riêng. Không khai thì nó rơi về
portrait, và vì nằm trên cùng nên **cả app hết xoay** chừng nào modal còn mở.
ESLint chặn cứng.

## Thanh cuộn — TẮT ở mọi vùng cuộn

Quyết định sản phẩm (2026-10-01): app không hiện thanh cuộn ở đâu cả. Mặc định
của React Native là BẬT; Android vẽ một vệt dày, đục đè lên mép phải nội dung và
lên dải gradient của `AppBar` — trông như lỗi vẽ hơn là tín hiệu "còn nội dung".
Cuộn là cử chỉ đã quen tay trên di động; muốn báo "còn nữa" thì để hàng cuối
lấp ló (peek), không cần vệt chỉ báo.

Mọi `ScrollView`, `FlatList`, `FlashList`, `SectionList`,
`KeyboardAwareScrollView`, `Animated.*`, `WebView`, `Pdf` khai **cả hai**, ghi
thẳng `={false}`:

```tsx
<FlashList
  data={items}
  renderItem={renderItem}
  showsHorizontalScrollIndicator={false}
  showsVerticalScrollIndicator={false}
/>
```

- **Cả hai**, kể cả danh sách dọc: WebView/PDF cuộn được hai chiều, và
  `horizontal={cond}` đổi chiều lúc chạy. Một luật "đủ cả hai" thì không ai phải
  nhớ ca nào cần cái nào.
- Có `{...props}` thì đặt hai prop này SAU spread — đặt trước là nơi gọi bật lại
  được.
- Component bọc riêng (`Screen`, `BottomSheet scrollable`, `Tabs scrollable`,
  `InvertedVirtualList`, `EditorWebView`…) đã tự tắt bên trong; nơi dùng không
  phải lặp lại.
- ⛔ Không có chỗ đặt mặc định TOÀN CỤC: React 19 đã bỏ `defaultProps` cho
  component hàm, còn vá `ScrollView` trong `node_modules` thì mỗi lần nâng RN là
  mất. Nên mỗi vùng cuộn tự khai, và **ESLint #12** (`eslint.config.js`) chặn
  vùng cuộn quên tắt.
- ⚠️ Trang HTML bên trong WebView có phần tử con tự cuộn (`overflow: auto` —
  khối mã, bảng) thì hai prop trên KHÔNG tới được nó: phải ẩn bằng CSS của chính
  trang (`scrollbar-width: none` + `::-webkit-scrollbar { display: none }`).

## Trạng thái mạng là chuyện THƯỜNG XUYÊN

Thang máy, hầm gửi xe, công trường, tàu điện. Trên web mất mạng là ca hiếm; ở
đây là ca phổ biến nhất.

- Câu lỗi phải nói rõ là lỗi **kết nối**, không phải app hỏng —
  `NETWORK_ERROR_MESSAGE` trong `shared/constants/error-codes.ts`.
- `retry: 1` và `refetchOnReconnect: true` đã đặt sẵn ở `query-client.ts`.
- ⛔ Đừng đăng xuất người dùng vì một lỗi mạng. Xem ba nhánh của
  `refreshSession()`.

## Khoá nút khi đang gửi

Không khoá thì người dùng bấm lần thứ hai vì lần đầu chưa thấy gì xảy ra, và
backend tạo hai bản ghi. Trên điện thoại ca này phổ biến hơn web nhiều: mạng
chậm hơn, và không có con trỏ chuột đổi hình để báo "đang xử lý".

Vòng quay nên **thay cho** nhãn chứ không nằm cạnh — giữ nguyên bề rộng nút để
bố cục không giật đúng lúc người dùng đang nhìn vào nó.

## Trợ năng

- `accessibilityRole` cho mọi thứ bấm được.
- `accessibilityLabel` cho nút chỉ có biểu tượng.
- `accessibilityState={{ busy }}` khi nhãn bị thay bằng vòng quay — nếu không,
  trình đọc màn hình mất hết thông tin và người dùng khiếm thị tưởng nút hỏng.

## Chữ tiếng Việt

Dấu chồng hai tầng (`Ẳ`, `Ộ`) cần **hơn 45% chiều cao** so với chữ Latin cùng
font. Dùng thang chữ theo vai trò; đừng đặt `lineHeight` bằng tay. Chi tiết ở
README, mục "Thang chữ".
