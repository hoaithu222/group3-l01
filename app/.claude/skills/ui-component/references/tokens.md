# Chọn token — bảng tra khi phân vân

Nguồn sự thật: `src/styles/colors/colors.json` (147 token × 2 chế độ),
`typography.json` (15 vai trò), `layout.json` (bo góc · giãn cách · cỡ control ·
cỡ icon · bề dày viền).

⛔ Sửa JSON rồi chạy `npm run generate:styles`. Đừng sửa file `*.generated.*`.

---

## Câu hỏi quyết định

Hỏi đúng một câu: **"Nền này có ĐẶC và mang màu thương hiệu / màu ngữ cảnh không?"**

- **Có, và bấm được** → `action-*`
- **Có, chỉ là bề mặt** → `surface-*`
- **Không, chỉ là nền trung tính của app** → `bg-1..4`, `bg-base`, `bg-input`

Và: **chữ đặt trên nền `action-*` PHẢI dùng `*-fg` cùng cặp.** Đây là các cặp đã
được đo tương phản; ghép chéo là mất đúng phần đó.

---

## Bảng ánh xạ

| Vai trò trong bản vẽ                                         | Token                                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Nền nút chính, thẻ xanh đậm, bong bóng tooltip               | `action-base`                                                                                    |
| Nền nút lúc đang bấm                                         | `action-press`                                                                                   |
| Chữ / icon trên nền `action-base`                            | `action-fg`                                                                                      |
| Nền nhấn màu vàng                                            | `action-accent` · chữ trên nó: `action-accent-fg`                                                |
| Nền nút trạng thái                                           | `action-error` · `action-warning` · `action-success` · `action-info` (+ `-fg`)                   |
| Nền vô hiệu hoá                                              | `action-disabled` · chữ: `action-disabled-fg`                                                    |
| Nền nhạt theo ngữ cảnh (alert, chip đang chọn, badge)        | `surface-primary` · `-success` · `-info` · `-warning` · `-error` · `-neutral`                    |
| Nền phủ NHÌN XUYÊN được                                      | `bg-primary` · `bg-success` · `bg-warning` · `bg-error` (⛔ không dùng được `/50`)               |
| Viền mặc định                                                | `border-1` · đậm hơn: `border-2` · `border-strong`                                               |
| Viền màu thương hiệu                                         | `border-brand` (+ `-press` `-subtle`)                                                            |
| Viền khối cảnh báo                                           | `border-error-subtle` · `border-warning-subtle` · `border-info-subtle` · `border-success-subtle` |
| Chữ chính / phụ / mờ                                         | `fg-1` · `fg-2` · `fg-3` · `fg-4` · `fg-5`                                                       |
| Chữ màu thương hiệu                                          | `fg-brand`                                                                                       |
| Chữ + icon trạng thái                                        | `success` · `info` · `warning` · `error` · `link` (bản TRẦN, không có bậc số)                    |
| Nền màn / thẻ / chìm                                         | `bg-base` · `bg-1` · `bg-2` · `bg-3` · `bg-4`                                                    |
| Nền ô nhập                                                   | `bg-input`                                                                                       |
| Nền skeleton                                                 | `bg-skeleton` → class `bg-bg-skeleton`                                                           |
| Đường kẻ                                                     | `divider-1` · `divider-2`                                                                        |
| Chấm/vạch CHỈ BÁO mờ (chấm phân trang, núm công tắc lúc tắt) | `indicator-muted`                                                                                |
| Nền mờ sau lớp phủ                                           | `overlay`                                                                                        |
| Thanh điều hướng                                             | `bg-nav` · `fg-on-nav` · `fg-on-nav-muted` · `fg-on-nav-accent`                                  |

⛔ **Đừng dùng thang SỐ** (`primary-6`, `ink-5`, `neutral-0`, `white-10`) cho
nền hay chữ — chúng giống hệt nhau ở hai chế độ. Chỉ dùng làm viền rất nhạt hoặc
khi bạn CỐ Ý muốn một màu không đổi theo chế độ, và phải ghi rõ lý do.

⚠️ Chỉ còn bốn họ thang số: `primary` `ink` `neutral` `white`. Tám họ kia
(`secondary` `tertiary` `error` `warning` `info` `success` `gray` `black`) đã bị
gỡ vì không bậc nào được dùng — bản trần một màu (`success` `error`...) ở dòng
"Chữ + icon trạng thái" phía trên vẫn còn, đó là token khác.

---

## Thang chữ — bám tên style Figma

| Tên style Figma                     | class                                   | size/lineHeight               |
| ----------------------------------- | --------------------------------------- | ----------------------------- |
| `DISPLAY/T36`                       | `text-display`                          | 36 / 47                       |
| `HEADER/T28` · `T24` · `T18`        | `text-header-lg` · `-md` · `-sm`        | 28/37 · 24/32 · 18/24         |
| `BODY/T16` · `T14`                  | `text-body-lg` · `text-body-md`         | 16/24 · 14/20                 |
| `LABEL/T16` · `T14` · `T12` · `T10` | `text-label-lg` · `-md` · `-sm` · `-xs` | 16/24 · 14/20 · 12/16 · 10/16 |
| `CAPTION/T13` · `T12`               | `text-caption-lg` · `-sm`               | 13/17 · 12/16                 |
| `LINK/T16` · `T14`                  | `text-link-lg` · `-md`                  | 16/21 · 14/20                 |

⛔ Vai trò cũ (`text-body`, `text-label`, `text-caption`, `text-heading`,
`text-title`, `text-subheading`, `text-body-sm`) **đã bị gỡ**: chúng trùng số đo
với bảng trên, và hai bộ tên cho cùng một cỡ chữ nghĩa là đọc class không ra
đang bám style nào. Gõ lại tên cũ là class chết, `npm run check:classes` bắt được.

⚠️ `text-overline` thì VẪN CÒN — nó không trùng vai trò nào (12/18, IN HOA,
giãn chữ 0.6).

Cân nặng: `font-regular` 400 · `font-medium` 500 · `font-semibold` 600 · `font-bold` 700.

⛔ Chữ IN HOA **chỉ** dùng `text-overline`. Đó là vai trò duy nhất có `lineHeight`
được kiểm theo ngưỡng đo từ font (Plus Jakarta Sans: 1.5×). Viết `uppercase` lên
vai trò khác thì Android cắt mất dấu `Ẳ`/`Ộ`.

---

## Thang hình học

**Bo góc** (GHI ĐÈ Tailwind): `none` 0 · `3xs` 4 · `2xs` 8 · `xs` 12 · `sm` 16 ·
`md` 24 · `lg` 32 · `full`.

**Giãn cách** (THÊM tên, thang số vẫn chạy): `3xs` 2 · `2xs` 4 · `xs` 8 · `sm` 12 ·
`md` 16 · `lg` 20 · `xl` 24 · `2xl` 28 · `3xl` 32 · `4xl` 40 · `5xl` 48 · `6xl` 64.

**Chiều cao control** (chỉ cho `h-*`): `h-control-xs` 32 · `-sm` 40 · `-md` 48 ·
`-lg` 56.

**Bề dày viền**: `border-hairline` 1 · `border-medium` 1.5 · `border-thick` 2.

**Cỡ icon** (số thô, cho prop `size`): `ICON_SIZE` trong `@/shared/theme` —
`xs` 16 · `sm` 20 · `md` 24 · `lg` 32 · `xl` 40 · `2xl` 48 · `3xl` 56.

Số Figma không có trong thang (6dp, 10dp, 56dp cho `min-h`, 160dp) thì **giữ
nguyên thang số hoặc `[..]`** — ⛔ đừng ép về token gần nhất, đó là làm sai số đo.

---

## Màu ở nơi không nhận className

`<ActivityIndicator color>`, `fill`/`stroke` của `react-native-svg`,
`placeholderTextColor`, `tabBarActiveTintColor`, màu thanh trạng thái.

```tsx
const colors = useThemeColors();
<ActivityIndicator color={colors['action-fg']} />;
```

⛔ Đừng dùng `LIGHT_COLORS` để né hook, TRỪ KHI token đó thật sự giống nhau ở hai
chế độ (thang số). Đã hỏng thật một lần: nút đăng nhập đọc `LIGHT_COLORS['fg-inverse']`
với lý lẽ "nền xanh đậm ở cả hai chế độ" — lý lẽ đó chết ngay khi nền đổi sang
`action-base`, một token có đảo.

⛔ Và đừng gọi `useThemeColors()` chỉ để tô nền/chữ khi className làm được: mỗi
lần đổi theme, component gọi hook đều vẽ lại.
