# Style — NativeWind

## Luôn dùng token, không dùng giá trị thô

```tsx
<View className="bg-bg-1 border-border-1" />     {/* ✅ */}
<Text className="text-body-lg text-fg-2" />       {/* ✅ */}

<View className="bg-white border-gray-200" />     {/* ❌ không đổi theo theme */}
<Text className="text-[17px]" />                  {/* ❌ ESLint chặn */}
<View style={{ backgroundColor: '#FFF' }} />      {/* ❌ */}
```

Ba file nguồn, sửa xong chạy `npm run generate:styles`. ⛔ Đừng sửa file
`*.generated.*`.

| Nhóm     | Nguồn                                   | Lệnh sinh             | Chứa gì                                                                      |
| -------- | --------------------------------------- | --------------------- | ---------------------------------------------------------------------------- |
| màu      | `src/styles/colors/colors.json`         | `generate:colors`     | 264 token × 2 chế độ                                                         |
| chữ      | `src/styles/typography/typography.json` | `generate:typography` | 15 vai trò × 4 độ đậm + tên họ font                                          |
| hình học | `src/styles/layout/layout.json`         | `generate:layout`     | 37 số đo (bo góc · giãn cách · cỡ control · cỡ icon · nét viền · breakpoint) |

⛔ **Mỗi nhóm một thư mục, và đừng gộp lại.** Ba nhóm đổi vì lý do khác nhau:
màu đổi theo nhận diện thương hiệu và phải đủ cặp sáng/tối; chữ đổi theo thang
thiết kế và bị kiểm lineHeight theo số đo font thật; hình học đổi theo bản vẽ và
giống nhau ở mọi theme. Gộp chung thì chỉnh một con số bo góc cũng phải mở file
có 264 mã màu.

Bảng màu lấy từ design system **BIDV SmartBanking v2.0**: MaGreen → `primary`,
MaBrown → `secondary`, MaYellow → `tertiary`, Red/Orange/Blue/Green semantic →
`error`/`warning`/`info`/`success`, Ink + Grey → `ink`/`gray`/`neutral`.

⛔ **`text-fg-3` · `text-fg-4` · `text-fg-5` KHÔNG dùng làm màu chữ nội dung.** Đo trên `colors.json`:
`fg-3` tối đa 2.96:1, `fg-4` 1.73:1, `fg-5` 1.41:1 ở chế độ sáng — chữ giờ/ghi chú/mô tả/lý do
viết bằng chúng gần như không đọc được. Chữ phụ dùng **`text-fg-2`** (≥ 5:1). `fg-3` chỉ cho
placeholder/chữ giữ chỗ. `npm run check:contrast` chặn ở mọi file (phần "chữ mờ" — tính từ bảng màu,
không cần biết nền); ngoại lệ thật khai ở `scripts/contrast-manifest.json` mục `mutedText.allow`.

⚠️ **Thang màu GIỐNG NHAU ở hai chế độ.** Chỉ token VAI TRÒ (`bg-*`, `fg-*`,
`surface-*`, `action-*`, `border-*`, `divider-*`, `overlay`…) mới đổi theo
sáng/tối. Nên nút bấm, nền thẻ, chữ **phải** dùng token vai trò; `primary-5`
chỉ dùng khi bản thiết kế gọi đích danh một bậc. Danh sách đầy đủ:
`src/shared/ui/AGENTS.md`.

### Ba nguyên tắc của bảng màu TỐI

Chế độ tối vừa được dựng lại toàn bộ (127 token vai trò). Ba điều dưới đây là lý
do của lần dựng lại đó — thêm hay sửa token `dark` thì phải giữ cả ba.

1. **Nền tối có ám màu thương hiệu, và các LỚP phải tách nhau ≥ 1.2:1.**
   `bg-base` → `bg-1` → `bg-2` → `bg-3` → `bg-4` là năm bậc ngả teal
   (#070A0A → #1E2826 → #2A3734 → #354441 → #40504D), mỗi bậc hơn bậc trước
   1.20–1.22:1 và thẻ `bg-1` nổi khỏi nền màn 1.31:1. ⛔ Đừng hạ chênh lệch
   xuống: bảng cũ xếp năm lớp xám cách nhau 1.05:1 và cái thẻ chìm hẳn vào nền —
   người dùng không thấy đâu là thẻ, đâu là màn hình. Viền `border-1` đi cùng
   luật này: 1.67:1 trên thẻ, không phải 1.38:1 "gần như vô hình" như bản cũ.

2. **Màu hành động ở chế độ tối là bậc SÁNG + BÃO HOÀ — nút sáng, chữ tối.**
   `action-base` = #3ECFB2 (S≈60%), chữ đi cùng là `action-fg` #04231D ⇒
   8.53:1. ⛔ Đừng "làm dịu" bằng cách hạ bão hoà: bản cũ dùng #B8D0CE (S=20%)
   và đó chính là thứ làm cả giao diện tối trông nhạt nhoà, xám xịt, mất hẳn màu
   nhận diện. Cùng luật cho `action-accent` (#F0B84B) và bốn tông ngữ nghĩa.

3. **"Nhấn" ở chế độ tối là phủ SÁNG hơn, ngược với chế độ sáng.**
   `action-press` #57DBC1 **sáng hơn** `action-base` #3ECFB2, trong khi ở chế
   độ sáng `action-press` #003730 tối hơn `action-base` #00453C. ⛔ Làm tối hơn
   ở chế độ tối là kéo nền nút về phía nền màn hình, và chữ `action-fg` (vốn là
   màu mực) chìm theo.

⚠️ Mọi con số ở trên do `npm run check:contrast` tính lại từ `colors.json` mỗi
lần chạy. Sửa một token `dark` thì chạy nó, đừng chép số cũ.

## Khi prop KHÔNG nhận className

Có thật và không ít: `tabBarActiveTintColor`, `headerTintColor`,
`<ActivityIndicator color>`, `<RefreshControl tintColor>`, `fill`/`stroke` của
`react-native-svg`, màu thanh trạng thái.

```tsx
const colors = useThemeColors();
<ActivityIndicator color={colors['fg-2']} />;
```

⛔ Đừng dùng hook đó thay cho className. Mỗi lần đổi theme, mọi component gọi
hook đều vẽ lại; component dùng className thì không.

⚠️ **Kéo-để-làm-mới của danh sách** là ca hay bị bỏ sót: `FlashList`/`FlatList` có
`refreshing`+`onRefresh` trần thì React Native dựng `RefreshControl` MẶC ĐỊNH (xám iOS /
xanh Material, không theo token) — ở chế độ tối gần như biến mất. `Screen` tự chữa cho vùng
cuộn của nó; danh sách tự cuộn (`scrollable={false}`) đi qua **`useListRefreshControl`**
(`@/shared/ui/screen`) rồi truyền `refreshControl={…}`. ESLint chặn `onRefresh` trần trên
`FlatList`/`FlashList`/`SectionList`.

## Thang chữ theo VAI TRÒ

Thang của BIDV (tên gắn với cỡ trong Figma):

`text-display` (36/47) · `text-header-lg` (28/37) · `text-header-md` (24/32) ·
`text-header-sm` (18/24) · `text-body-lg` (16/24) · `text-body-md` (14/20) ·
`text-label-lg` (16/24) · `text-label-md` (14/20) · `text-label-sm` (12/16) ·
`text-label-xs` (10/16) · `text-caption-lg` (13/17) · `text-caption-sm` (12/16) ·
`text-link-lg` (16/21) · `text-link-md` (14/20) · `text-overline` (12/18, IN HOA)

⛔ Tên cũ (`text-title`, `text-heading`, `text-subheading`, `text-body`,
`text-body-sm`, `text-label`, `text-caption`) **đã bị gỡ khỏi thang**. Chúng
trùng số đo với vai trò ở trên, và để hai bộ tên song song thì mỗi người viết
một kiểu cho cùng một cỡ chữ. Gõ lại tên cũ bây giờ là class chết —
`npm run check:classes` bắt được.

⛔ **Không** dùng `text-xs`/`text-lg`… — thang mặc định đã bị THAY THẾ, chúng
không tồn tại.

⚠️ **Bản vẽ có `BODY/T15.5` — thang này CỐ Ý không có bậc đó.** Các màn feature
dựng sau dùng `BODY/T15.5-Regular` / `-Semibold` (15.5/24) cho cặp nhãn–giá trị,
trong khi thang nhảy thẳng 14/20 → 16/24. Chốt: **làm tròn lên `text-body-lg`**
(16/24) — cùng `lineHeight`, lệch nửa pixel cỡ chữ, mắt không phân biệt được;
còn thêm một bậc nữa thì mỗi người lại chọn một kiểu cho cùng một hàng thông tin.
⛔ Đừng thêm `15.5` vào `typography.json` mà không đọc `design-tokens` skill —
thêm bậc là đổi nghĩa `twMergeConfig` cho cả app.

⚠️ Bốn vai trò có `lineHeight` nhích lên 1–7px so với Figma (28/36 → 28/37,
13/16 → 13/17, 16/20 → 16/21, 36/40 → 36/47). Không phải sai sót: dưới 1.3× thì
Android **cắt cụt dấu tiếng Việt** và trình sinh chặn cứng. Cỡ chữ giữ nguyên
đúng bản thiết kế.

## Hình học — bo góc, giãn cách, cỡ control

- **Bo góc**: `rounded-3xs` (4) · `rounded-2xs` (8) · `rounded-xs` (12) ·
  `rounded-sm` (16) · `rounded-md` (24) · `rounded-lg` (32) · `rounded-full` ·
  `rounded-none`.
  ⛔ Thang mặc định của Tailwind đã bị GHI ĐÈ — `rounded-sm` ở đây là **16dp**,
  không phải 2px. Đây là chỗ dễ vấp nhất khi copy class từ web.
- **Giãn cách**: giữ nguyên thang số (`p-4` = 16dp) và thêm tên token:
  `3xs` 2 · `2xs` 4 · `xs` 8 · `sm` 12 · `md` 16 · `lg` 20 · `xl` 24 · `2xl` 28 ·
  `3xl` 32 · `4xl` 40 · `5xl` 48 · `6xl` 64 (`gap-md`, `px-xs`…).
- **Chiều cao control**: `h-control-xs` (32) · `h-control-sm` (40) ·
  `h-control-md` (48) · `h-control-lg` (56).
- **Nét viền**: `border-hairline` (1dp) · `border-medium` (1.5dp) ·
  `border-thick` (2dp).
- Cần SỐ THÔ (prop không nhận className): `RADIUS`, `SPACING`, `CONTROL_HEIGHT`,
  `ICON_SIZE`, `BORDER_WIDTH` từ `@/shared/theme`.

## Breakpoint — chỉ có ba bậc

`phone:` (390) · `tablet:` (600) · `tablet-lg:` (840), cộng `landscape:` /
`portrait:` có sẵn của Tailwind.

⛔ **`sm:` `md:` `lg:` `xl:` `2xl:` KHÔNG còn tồn tại** — `theme.screens` đã bị
GHI ĐÈ. Đó là số đo màn hình máy tính (`sm` = 640) nên trên điện thoại rộng
360–430dp chúng không bao giờ khớp; giữ lại chỉ để người ta viết `md:flex-row`
rồi tưởng đã lo xong máy tính bảng. Gõ vào bây giờ là class chết, im lặng —
`npm run check:classes` bắt được.

Luật đầy đủ (khi nào dùng class, khi nào dùng `useBreakpoint`/`useResponsiveValue`,
danh mục điều cấm, bốn cỡ màn phải thử): **`docs/rules/responsive.md`**.

## Biểu tượng

```tsx
import { Icon } from '@/shared/ui/icon';

<Icon name="arrow-right" />                      // 24dp, màu fg-1
<Icon name="alert-warning" color="error" size="sm" />
<Icon name="setting" variant="twotone" />        // linear · solid · twotone · bulk
<Icon name="bank/bidv" size={32} />              // logo ngân hàng, KHÔNG nhuộm
```

Bộ icon xuất thẳng từ Figma vào `assets/icons/**`, sinh code bằng
`npm run generate:icons`. ⛔ `@expo/vector-icons` **đã bị gỡ khỏi dự án** — nét
của Ionicons lệch hẳn với bản thiết kế, và hai bộ icon song song thì thanh tab
là chỗ lộ ra rõ nhất.

⛔ **Họ font gắn qua plugin trong `tailwind.config.js`, không phải qua `font-sans`.** Họ "Plus Jakarta Sans" được đăng ký native (`app.config.ts` →
`addCustomFont`) nhưng NativeWind không có preflight và RN không cho `<Text>` thừa kế font từ cha, nên trước đây toàn app lặng lẽ hiện Roboto. Plugin
`addUtilities` thêm `fontFamily` vào mọi `text-<vai trò>` và `font-<độ đậm>` (đọc từ `typography.generated`) — mọi `<Text>` theo luật thang chữ đều nhận font.
Sửa `tailwind.config.js` thì khởi động lại Metro với `--clear`. Font rộng hơn Roboto ~10%: nhãn nút trong hàng chia đôi có thể bị cắt — xem `EmptyStateActions`.

⛔ **Chữ IN HOA chỉ dùng `text-overline`.** Đó là vai trò duy nhất có
`lineHeight` được kiểm theo ngưỡng 1.5× — mức đo được từ file font cho ký tự
`Ẳ`/`Ạ`. Viết `uppercase` lên vai trò khác thì Android cắt mất dấu. Cần thêm vai
trò IN HOA → thêm vào `typography.json` với `"uppercase": true`, generator sẽ
kiểm đúng ngưỡng.

## Cạm bẫy

**`Animated.View` nhận `useAnimatedStyle` phải có `cssInterop={false}` và không có `className`.**
`cssInterop(Animated.View, ...)` đăng ký toàn cục (ví dụ từ `Skeleton`), nên bỏ `className`
vẫn chưa đủ: NativeWind gộp mảng style tĩnh + handle hoạt ảnh thành một object.
Reanimated thấy `viewDescriptors` thì chỉ lấy `initial.value`, làm rơi `flex`,
`absoluteFill`, căn giữa hoặc kích thước. Đây là nguyên nhân thẻ ôn tập co thành đường
ngang và dấu tích rơi khỏi vòng hoàn thành. Tắt interop ở node hoạt ảnh để giữ nguyên
mảng `style`; màu và class vẫn đặt trên `View` thường bên trong/bên ngoài.
Mẫu: `features/study/components/flashcard/RiseIn.tsx` và `CompletionRing.tsx`.
✅ ESLint giờ CHẶN ca này: `Animated.*` có `style={[…]}` (cả `cond ? […] : …`, `cond && […]`) mà thiếu `cssInterop={false}` là lỗi — luật #11 trong `eslint.config.js`.

**Android làm VUÔNG góc của `<View>` chỉ có nền ở MỘT SỐ trạng thái (đang chọn, đang bấm, hôm nay, có dữ liệu).**
Fabric "làm phẳng" `View` không có nền/viền/`opacity`/`overflow-hidden` (không dựng view native). Lúc nó mới CÓ nền,
Android dựng view với ĐÚNG phần props vừa đổi — `borderRadius` đặt từ trước rơi mất, vòng tròn thành ô vuông (RN 0.86:
cờ `enableAccumulatedUpdatesInRawPropsAndroid` tắt sẵn). iOS và Jest không bị nên review và test đều không bắt được.
✅ `View` bo góc mà nền/viền chỉ có ở một số trạng thái ⇒ thêm `collapsable={false}` (mẫu `WeekDayCell`, `CalendarDay`,
`SheetHeader`), hoặc cho trạng thái nghỉ một nền đặc (mẫu `TabItem`). Phần tử chỉ RENDER theo điều kiện
(`{selected ? <View className="bg-…" /> : null}`) thì không sao: nó được dựng mới với đủ props. `Pressable` tự có
`collapsable={false}` — bẫy nằm ở `View` con bên trong render-prop `({ pressed }) => …`.

**Class không tồn tại bị bỏ qua ÂM THẦM.** NativeWind không báo lỗi cho
`text-md` (chỉ có `text-base`/`text-lg` ở Tailwind gốc, mà ở đây cả hai đều
không có). Style mất mà không có dấu hiệu gì. Gõ sai tên token cũng vậy.

**NativeWind 4 chạy trên Tailwind 3.4.** Cú pháp `@theme`, `oklch()`, và các
tiện ích chỉ có ở Tailwind 4 KHÔNG dùng được — kể cả khi bạn thấy chúng trong
tài liệu Tailwind mới nhất.

**Modifier độ trong chỉ chạy với token ĐẶC.** `bg-primary-5/40` ✅.
Token vốn đã có độ trong (`overlay`, `white-*`, `black-*`, `bg-primary`…) thì
`/50` KHÔNG có tác dụng — chúng map qua `rgb(var(--x))` không có `<alpha-value>`.
Cần độ trong khác thì lấy token đặc rồi tự thêm modifier.

**Đổi `tailwind.config.js` phải khởi động lại Metro có cờ `-c`**
(`npm run start:clear`). Tailwind cache theme lúc build.

## `cn()` — gộp className

```tsx
cn('px-4 py-2', isActive && 'bg-primary-5', className);
```

Bắt buộc dùng thay cho template literal: NativeWind áp style theo **độ ưu tiên
CSS**, không theo thứ tự trong chuỗi. Nối chuỗi thì prop `className` truyền từ
ngoài vào lúc đè được lúc không. Chi tiết ở README, mục `cn()`.

## Component có biến thể → dùng `tv()`

```ts
const button = tv(
  {
    slots: { root: 'h-12 items-center rounded-lg', label: 'text-body-lg font-semibold' },
    variants: {
      variant: {
        solid: { root: 'bg-primary-6', label: 'text-fg-inverse' },
        ghost: { root: 'bg-transparent', label: 'text-primary-6' },
      },
    },
    defaultVariants: { variant: 'solid' },
  },
  { twMergeConfig }, // ⛔ BẮT BUỘC — xem bên dưới
);
```

⛔ `twMergeConfig` (từ `@/shared/utils/style/cn`) phải truyền vào MỌI recipe.
`tailwind-variants` tạo thực thể `twMerge` riêng; không truyền thì recipe nào
nhận cả cỡ chữ lẫn màu chữ sẽ **đánh rơi cỡ chữ** — chữ vẫn hiện, chỉ sai cỡ,
không lỗi nào báo. Bản mẫu: `src/shared/ui/button/button.styles.ts`.
