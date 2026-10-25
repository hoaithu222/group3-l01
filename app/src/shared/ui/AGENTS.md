# Bộ component giao diện (`src/shared/ui/`)

Dựng theo design system **BIDV SmartBanking v2.0** (Figma
`JKRCweXTvHehczYn87NOWK`, section "Bản update mới").

Đọc `docs/rules/styling-nativewind.md`, `docs/rules/mobile-ux.md` và
`docs/rules/code-style.md` trước. File này chỉ nói phần RIÊNG của bộ component.

## Nguyên tắc số một

> **Số đo lấy từ Figma. Màu lấy từ token.**

Bản thiết kế đưa ra cỡ chữ, bo góc, giãn cách, chiều cao — chép đúng.
Nhưng mã màu trong Figma thì **KHÔNG chép vào code**: mọi màu đã có token tương
ứng, và chỉ token mới đổi được theo chế độ sáng/tối. Thấy mã màu chủ đạo trong
Figma thì viết `bg-action-base`, không viết `bg-[#hex]`.

## Cấu trúc thư mục

```
src/shared/ui/
  <nhóm>/            kebab-case: button/ · input/ · bottom-sheet/
    <Tên>.tsx        PascalCase, 1 file = 1 component export
    index.ts         cửa ngõ public của nhóm
```

✅ **Thêm một nhóm mới thì PHẢI nối vào `src/shared/ui/index.ts`** — cùng lượt,
không để lại sau.

⚠️ Luật cũ ở đây là "đừng đụng vào barrel tổng", có lý do của nó lúc nhiều
nhánh dựng song song. Nhưng cái giá đã hiện ra: `DatePicker` dựng xong, có
`index.ts` riêng, mà **không ai nối vào barrel** — nên nó vô hình với người
dùng bộ component suốt một thời gian, và ai cần chọn ngày thì tự viết lấy. Giai
đoạn dựng song song đã xong; giờ nhóm nào thêm thì nhóm đó nối.

## Biến thể → luôn dùng `tv()`

```ts
import { tv } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

const button = tv(
  {
    slots: { root: 'flex-row items-center justify-center', label: 'text-label-lg' },
    variants: {
      variant: {
        primary: { root: 'bg-action-base', label: 'text-action-fg' },
        outline: { root: 'border-hairline border-border-brand', label: 'text-fg-brand' },
      },
      size: {
        md: { root: 'h-control-md rounded-2xs px-md' },
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
  { twMergeConfig }, // ⛔ BẮT BUỘC, xem docs/rules/styling-nativewind.md
);
```

Prop `className` luôn nhận từ ngoài và gộp bằng `cn()` hoặc truyền vào slot —
component nào cũng phải cho phép nơi gọi chỉnh vài lớp mà không phải fork.

## Token có sẵn (dùng ĐÚNG tên này)

> ⛔ **Tên token ≠ tên class.** Tiện ích là `<thuộc tính>-<tên token>`, nên token
> `bg-1` viết thành **`bg-bg-1`**, `bg-nav` → **`bg-bg-nav`**, `fg-1` →
> `text-fg-1`, `border-1` → `border-border-1`. Viết `bg-nav` là đòi một màu tên
> `nav` — không có, và NativeWind bỏ qua ÂM THẦM (mất nền, không lỗi nào báo).

**Nền**: `bg-base` `bg-1`…`bg-4` `bg-input` `bg-popup`
`bg-nav` `bg-dialog` `bg-skeleton` `bg-ink-light`

⚠️ `bg-4` không có nơi nào dùng làm `className` hiện tại — vẫn giữ vì
`tests/theme/dark-palette.test.ts` khoá cả thang `bg-base…bg-4` làm bất biến
chiều sâu của chế độ tối. Cần một lớp nổi sâu hơn `bg-3` thì dùng nó, đừng xoá.

**Nền phủ nhạt theo ngữ cảnh** (đặc, cho alert/badge/chip):
`surface-primary` `surface-secondary` `surface-success`
`surface-info` `surface-warning` `surface-error` `surface-neutral`

**Nền phủ có độ trong** (nhìn xuyên được, 10% — đúng nấc `Opacity/*/Op10` của
thiết kế): `bg-primary` `bg-success`
`bg-warning` `bg-error`.
⛔ Nhóm này KHÔNG dùng được modifier `/50`.

**Chữ**: `fg-1` (chính) `fg-2` (phụ) `fg-3` (mờ — chỉ cho placeholder, tương
phản 2.96:1 nên ⛔ không dùng cho nội dung) `fg-4` `fg-5` `fg-inverse`
`fg-brand`

⛔ `text-fg-3` · `text-fg-4` · `text-fg-5` **làm màu chữ nội dung** (giờ, chú thích, mô tả,
lý do, trạng thái…) bị `npm run check:contrast` chặn ở MỌI file — phần "chữ mờ" của trình
soát tính từ `colors.json` rằng ba token đó không đạt 4.5:1 trên nền nào (`fg-3` tối đa
2.96:1, `fg-4` 1.73:1) nên bắt được mà không cần biết nền. Chữ phụ dùng **`text-fg-2`** (≥ 5:1).
Chữ giữ chỗ THẬT khai ở `scripts/contrast-manifest.json` mục `mutedText.allow` kèm `why`.
`fg-on-nav` `fg-on-nav-muted` `fg-on-popup` `fg-on-dialog`

**Ngữ nghĩa** (một màu, cho chữ + icon): `success` `info` `warning` `error` `link`

**Hành động** (nút, control — bám đúng token `Background/*` của thiết kế):

- Thương hiệu: `action-base` `action-press` `action-fg`
  `action-tint` `action-tint-strong`
- Vàng/nâu: `action-accent` `action-accent-fg`
- Mực / xám / trắng: `action-ink` `action-ink-press`
  `action-ink-fg` `action-grey` `action-grey-press`
  `action-white` `action-white-press` `action-white-light`
- Ngữ cảnh: `action-error` `action-error-press`
  `action-error-fg` · `action-warning` `action-warning-press`
  `action-warning-fg` · `action-success`
  `action-success-press` `action-success-fg` · `action-info`
  `action-info-press` `action-info-fg`
- Khoá: `action-disabled` `action-disabled-ink` `action-disabled-fg`

⛔ Không có bậc `*-hover`: di động không có con trỏ chuột (xem "React Native
không có `:hover`" bên dưới) — bộ token cố ý bỏ trạng thái này khỏi mọi họ
`action-*`/`border-*`.

⛔ Chữ trên nền hành động phải dùng token `*-fg` tương ứng, đừng mặc định
`fg-inverse`. Trắng trên nền vàng `action-accent` chỉ đạt 3.35:1 — đó là lý do
`action-accent-fg` là màu MỰC. Ở chế độ tối, nền nút là màu SÁNG và chữ là màu
TỐI (đảo chiều), nên viết cứng `text-white` là hỏng chế độ tối.

⛔ **Cùng cái bẫy đó cho HÌNH VẼ, không chỉ chữ.** Đặt `neutral-0` / `white-10`
lên bất kỳ nền `action-*` nào — lõi chấm tròn, dấu tick, núm công tắc — thì ở
chế độ tối đo được **1.95:1** trên `action-base`, và không tông `action-*` nào
vượt **2.8:1**: hình biến mất hoàn toàn. Nền `action-*` là màu SÁNG ở chế độ
tối. Luôn dùng `action-*-fg`.

### Luật khi thiết kế và tương phản đá nhau

Bản thiết kế của ngân hàng có vài chỗ không đạt AA. Cách xử ở đây tách làm hai,
và ranh giới là **màu** hay **cặp màu**:

- **Một MÀU do thiết kế chỉ định thì giữ nguyên.** `warning` = `#D35801` đúng
  `Foreground/Warning/Default`, đo được 4.06:1 trên nền trắng và 3.61:1 trên
  `surface-warning` — dưới ngưỡng 4.5 của chữ thường. Vẫn giữ: đổi màu nhận
  diện của ngân hàng là việc của ngân hàng, không phải của lập trình viên. Bù
  bằng cách dùng: cỡ chữ ≥ 16 + `font-semibold`, và luôn kèm biểu tượng — đừng
  để MÀU là dấu hiệu duy nhất.
- **Một CẶP màu (chữ đặt lên nền) thì đổi phần CHỮ.** Thiết kế vẽ chữ trắng
  trên nền vàng `action-accent`, đo được 3.35:1 — nên `action-accent-fg` ở đây
  là màu MỰC (5.20:1). Nền giữ đúng màu thương hiệu, chỉ chữ đổi.

Toàn bộ chế độ TỐI là suy ra (thiết kế không định nghĩa), nên ở đó không có
ràng buộc này — mọi cặp đều đã kéo lên ≥ 6:1 (thấp nhất: `surface-error` +
`error` = 6.21:1). Nguyên tắc của bảng màu tối: `docs/rules/styling-nativewind.md`.

⛔ **Đừng thêm ngoại lệ mới bằng cách nới ngưỡng.** `npm run check:contrast`
tính lại mọi cặp từ `colors.json` ở CẢ hai chế độ mỗi lần chạy; ngoại lệ khai
trong `scripts/contrast-manifest.json`, mỗi mục bắt buộc có `why` và một `floor`
— tụt dưới `floor` thì ngoại lệ tự hết hiệu lực. Đó là chỗ giữ cho những con số
đo tay rải trong chú thích khỏi mục lặng lẽ khi ai đó sửa bảng màu.

Hiện có đúng **ba** ngoại lệ thật, và cả ba đều theo luật trên:

| Cặp                                    | Sáng | Vì sao giữ                                                                                                                                                                                 |
| -------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `surface-warning` + `warning`          | 3.61 | Màu do thiết kế chỉ định. Bù bằng cỡ ≥ 16 + semibold + icon.                                                                                                                               |
| `action-warning` + `action-warning-fg` | 4.06 | Cùng lý do.                                                                                                                                                                                |
| `surface-success` + `success`          | 4.45 | Thiếu 0.05. `info` (7.45) và `error` (5.29) đều đạt ⇒ đây là ca RIÊNG của `success`, không phải chính sách chung. Bù: `Alert` luôn có icon theo tông, `Badge` soft luôn có viền `-subtle`. |

⚠️ Nhãn thanh tab dưới dùng **trắng 100%**, icon dùng trắng 80% (hình phi văn
bản chỉ cần 3:1). ⛔ Đừng hạ nhãn về 80% "cho đúng bản vẽ": trạng thái vẫn phân
biệt bằng độ ĐẬM của font. (Trước đổi màu chủ đạo sang tím, `nav-from` — TÂM
dải toả tròn, chỗ tab GIỮA đứng lên — từng chỉ đạt 4.35:1 với trắng 100% và
cần một ngoại lệ riêng trong `contrast-manifest.json`; bảng tím hiện tại đạt dư
ngưỡng nên ngoại lệ đó đã bỏ. Đổi lại `nav-from` sẫm hơn thì kiểm tra lại
`npm run check:contrast` trước khi tin số cũ.)

**Viền**: `border-1` `border-2` `border-strong` `border-brand`
`border-brand-press` `border-brand-subtle` `border-ink`
`border-ink-press` `border-ink-disabled` `border-white`
`border-white-medium` `border-error` `border-error-subtle`
`border-warning` `border-warning-subtle` `border-info` `border-info-subtle`
`border-success` `border-success-subtle` `divider-1` `divider-2`

⚠️ Bậc `-subtle` là viền NHẠT (bậc 300 của thang) — alert và badge dùng nó, đừng
lấy `border-error` đậm cho viền của khối cảnh báo.

**Khác**: `overlay` `disabled-1` `disabled-2`
`nav-from` `nav-to` `header-from`
`header-to` `header-border`

**Thang màu** (khi cần bậc cụ thể): `primary-1`…`primary-10` · `ink-1`…`ink-10` ·
`neutral-0`…`neutral-10` · `white-1`…`white-10`.
⚠️ Thang màu GIỐNG NHAU ở hai chế độ — cái đổi theo sáng/tối là token vai trò ở
trên. Nút bấm, nền thẻ, chữ: dùng token vai trò. Thang màu chỉ cho những chỗ
thiết kế gọi đích danh một bậc (ví dụ đốm màu thương hiệu nhạt `primary-3`).

⛔ Tám họ thang số `secondary` `tertiary` `success` `info` `warning` `error`
`gray` `black` đã bị GỠ (không bậc nào từng được dùng, không có nhánh phái sinh
nào cần tới). Bản trần một màu (`success` `info` `warning` `error`) vẫn còn —
đó là token VAI TRÒ, khác thang số. Cần một bậc cụ thể của các họ này thì tra
lại giá trị hex trong file Figma nguồn rồi thêm token mới vào `colors.json`.

## Cỡ chữ (thang BIDV)

`text-display` (36/47) · `text-header-lg` (28/37) · `text-header-md` (24/32) ·
`text-header-sm` (18/24) · `text-body-lg` (16/24) · `text-body-md` (14/20) ·
`text-label-lg` (16/24) · `text-label-md` (14/20) · `text-label-sm` (12/16) ·
`text-label-xs` (10/16) · `text-caption-lg` (13/17) · `text-caption-sm` (12/16) ·
`text-link-lg` (16/21) · `text-link-md` (14/20) · `text-overline` (12/18, IN HOA)

Độ đậm: `font-regular` `font-medium` `font-semibold` `font-bold`.

⚠️ Bốn `lineHeight` nhích lên **1–7px** so với Figma (28/36 → 28/37, 13/16 →
13/17, 16/20 → 16/21, và 36/40 → 36/47 — riêng `display` nhích 7px). Không phải sai sót: dưới 1.3× thì Android **cắt
cụt dấu tiếng Việt**, và trình sinh thang chữ chặn cứng. Cỡ chữ thì đúng y bản
thiết kế.

## Hình học

- Bo góc: `rounded-none` (0) `rounded-3xs` (4) `rounded-2xs` (8) `rounded-xs` (12)
  `rounded-sm` (16) `rounded-md` (24) `rounded-lg` (32) `rounded-full`.
  ⚠️ Thang mặc định của Tailwind đã bị THAY — `rounded-sm` ở đây là **16dp**.
- Giãn cách: dùng thang số quen thuộc (`p-4` = 16dp) hoặc tên token
  (`gap-3xs` 2 · `2xs` 4 · `xs` 8 · `sm` 12 · `md` 16 · `lg` 20 · `xl` 24 ·
  `2xl` 28 · `3xl` 32 · `4xl` 40 · `5xl` 48 · `6xl` 64).
- Chiều cao control: `h-control-xs` (32) `h-control-sm` (40) `h-control-md` (48)
  `h-control-lg` (56).
- Nét viền: `border-hairline` (1dp) · `border-medium` (1.5dp) ·
  `border-thick` (2dp).
- Số đo thô cho prop không nhận className: `RADIUS`, `SPACING`, `CONTROL_HEIGHT`,
  `ICON_SIZE` từ `@/shared/theme`.

⚠️ Ba cái bẫy đã đo được, đừng mất thời gian phát hiện lại:

1. **`rounded-lg` giờ là 32dp**, không phải 8dp như Tailwind gốc. Class vẫn hợp
   lệ nên nó sai ÂM THẦM. Muốn 8dp thì viết `rounded-2xs`.
2. **`min-h-control-*` KHÔNG tồn tại.** `tailwind.config.js` chỉ nối
   `height: layout.height`, mà Tailwind 3.4 lấy `minHeight`/`maxHeight` từ
   `theme('spacing')` chứ không kế thừa từ `height`. Dùng `min-h-12`/`min-h-14`,
   hoặc `h-control-md` khi chiều cao cố định.
3. **`bg-white` / `bg-black` không sinh ra class.** Hai họ `white-*`/`black-*`
   ghi đè `white`/`black` mặc định của Tailwind và không có bậc `DEFAULT`. Cố ý:
   màu trắng đen cứng không đổi theo theme. Cần trắng thì dùng `fg-inverse`,
   `action-white`, hoặc `white-10`.

## Icon

```tsx
import { Icon } from '@/shared/ui/icon';

<Icon name="arrow-right" />                        // 24dp, màu fg-1
<Icon name="alert-warning" color="error" size="sm" />
<Icon name="setting" variant="twotone" />
<Icon name="bank/bidv" size={32} />                // logo, không nhuộm
```

Tên icon nằm trong `IconName` (`src/shared/ui/icon/icon-names.generated.ts`) nên
gõ sai là `tsc` đỏ. ⛔ Đừng dùng `@expo/vector-icons` trong bộ component mới —
nét của Ionicons lệch hẳn với bản thiết kế.

⚠️ **Tên icon theo bộ của ngân hàng, không theo thói quen đặt tên phương Tây.**
Tra danh sách thật bằng `ls assets/icons/system` trước khi đoán. Vài ca hay gõ
nhầm:

| Định gõ            | Tên thật                                |
| ------------------ | --------------------------------------- |
| `close` · `x`      | `cancel` (hoặc `clear-circle`)          |
| `check`            | `checkmark-circle` · `checkmark-square` |
| `plus` · `trash`   | `add` · `delete`                        |
| `eye` · `eye-off`  | `view` · `hide`                         |
| `chevron-down`     | `arrow-down-small`                      |
| `info` · `warning` | `alert-information` · `alert-warning`   |

Icon cần mà chưa có: dùng tên gần nhất và **ghi vào báo cáo**; ⛔ đừng tự vẽ
`<Path>`, đừng tự thêm file `.svg` — bộ icon xuất từ Figma, thêm tay là lần xuất
sau ghi đè mất.

## React Native không có `:hover`

Thiết kế có 5 trạng thái (Default · Hover · Press · Disable · Active). Trên di
động:

| Figma   | Ở đây                                                      |
| ------- | ---------------------------------------------------------- |
| Default | trạng thái thường                                          |
| Hover   | ⛔ BỎ — không có con trỏ chuột                             |
| Press   | `<Pressable>` + `({ pressed })`                            |
| Disable | prop `disabled` + token `action-disabled`                  |
| Active  | trạng thái chọn/bật của chính component (`selected`, `on`) |

⛔ **`className` KHÔNG nhận hàm.** `Pressable` cho prop `style` nhận
`({ pressed }) => …`, nhưng NativeWind chỉ nhận CHUỖI ở `className` — viết hàm
vào đó là `tsc` đỏ (`Type '({ pressed }) => string' is not assignable to type
'string'`). Lấy `pressed` ở **children** thay vì ở `className`:

```tsx
<Pressable
  accessibilityRole="button"
  accessibilityState={{ disabled }}
  className={styles.pressable()}
  disabled={disabled}
  onPress={onPress}
>
  {({ pressed }) => <View className={styles.root({ pressed })}>{/* … */}</View>}
</Pressable>
```

⚠️ Bản `useState` + `onPressIn`/`onPressOut` cũng CHẠY ĐÚNG — đã đọc lại máy
trạng thái trong `node_modules/react-native/Libraries/Pressability/Pressability.js`:
`LEAVE_PRESS_RECT` chuyển sang `RESPONDER_ACTIVE_PRESS_OUT` và `_deactivate()`
vẫn gọi `onPressOut`, kể cả khi ngón tay trượt ra ngoài rồi mới nhấc. Lý do dùng
render-prop nhẹ hơn thế: bớt một state + hai handler cho mỗi component, và
`pressed` luôn đồng bộ với chính `Pressable` chứ không phải một bản sao.

## Chuyển động — `Animated.View` và `className` KHÔNG đi chung

Đã đo được: NativeWind gộp class và `style` vào **một** object. Reanimated thấy
khoá `viewDescriptors` trong object đó liền coi cả object là handle animation và
**vứt sạch style đến từ class** — component thành vô hình, không lỗi nào báo.

```tsx
// ❌ mất hết style của className
<Animated.View className="bg-bg-1 rounded-md" style={animatedStyle} />

// ✅ truyền thẳng SharedValue qua style, class ở lớp bọc ngoài
<View className="bg-bg-1 rounded-md">
  <Animated.View style={{ opacity: progress }} />
</View>
```

Nếu buộc phải đặt class lên `Animated.View` thì phải khai
`cssInterop(Animated.View, { className: 'style' })` trước — `Animated.View`
không nằm trong danh sách interop sẵn của NativeWind.

⛔ **`cssInterop` CHỈ đủ khi `style` là object thường** (như `opacity: SharedValue`
ở `Skeleton`). Với **handle của `useAnimatedStyle`** thì vẫn hỏng: NativeWind gộp
class + handle thành một object mang khoá `viewDescriptors`, Reanimated coi cả object
là handle và chỉ lấy `initial.value` — class rơi hết (`h-* w-* bg-* rounded-*`), thẻ
0×0, vô hình, không lỗi nào báo. Đã hỏng thật ở `Toggle` (núm biến mất: chỉ còn viên
ray). Luật: thẻ mang `useAnimatedStyle` thì **không** mang `className` — lồng một
`<View className>` bên trong (mẫu: `Toggle.tsx`, `SliderDotItem.tsx`).

## Bắt buộc về khả năng tiếp cận

- Mọi thứ bấm được: `accessibilityRole` + nhãn (chữ trong nút, hoặc
  `accessibilityLabel` khi nút chỉ có icon).
- Vùng chạm ≥ 44dp. Control nhỏ hơn thì `hitSlop`, đừng phóng to hình.
- `accessibilityState` phải phản ánh đúng `disabled` / `checked` / `selected` /
  `busy` — trình đọc màn hình không nhìn thấy màu.
- Mọi chữ nằm trong `<Text>`.

## Giới hạn

- 1 file `.tsx` = 1 component export, **≤ 200 dòng**. Vượt thì tách sub-component
  vào cùng thư mục.
- ⛔ Không `any`, không `@ts-expect-error`.
- Chú thích viết **VÌ SAO**, tiếng Việt, dùng dấu hiệu `⛔` `⚠️` `✅` `❌` như
  phần còn lại của repo.
- Xong việc: `npx tsc --noEmit` và `npx eslint <file bạn sửa>` phải sạch.

## Test

Mỗi nhóm component một file `tests/ui/<nhóm>.test.tsx`, test **hành vi** chứ
không phải hình thức (NativeWind không biên dịch trong Jest — `style` luôn rỗng,
xem `docs/rules/testing.md`). Đủ dùng: render được, `onPress` được gọi, `disabled`
chặn được, nhãn cho trình đọc màn hình có mặt.

⚠️ `render()` của RNTL 14 là **bất đồng bộ** — phải `await`.
