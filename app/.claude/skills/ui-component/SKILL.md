---
name: ui-component
description: Dựng hoặc sửa component giao diện trong src/shared/ui/ của base React Native này. Dùng khi implement một node Figma thành code, khi sửa className/màu/cỡ chữ/giãn cách trong bất kỳ file .tsx nào, khi thêm biến thể cho component có sẵn, hoặc khi người dùng nhắc tới component/UI/màn hình/design system. Chứa danh mục cạm bẫy hỏng ÂM THẦM của NativeWind + tailwind-merge mà tsc và eslint đều không bắt được.
---

# Dựng component trong base này

Repo: Expo SDK 57 · React Native 0.86 · NativeWind 4 (Tailwind **3.4**) · TypeScript strict.

## ⚠️ Đọc mục này trước, nó quyết định bạn tin phần nào của file

Đây là một **base dùng lại cho nhiều dự án**, không phải app của một ngân hàng cụ
thể. Bộ token và bộ component hiện tại được dựng theo **tham chiếu** design system
BIDV SmartBanking — đó là DỮ LIỆU lấp vào khung, không phải bản thân cái khung.

Vì vậy, khi đọc file này hãy tách hai loại:

| Loại                              | Ví dụ                                                                                                                       | Khi sang dự án khác            |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **Cơ chế** — dùng lại nguyên      | 10 cạm bẫy bên dưới · quy trình dựng · `tv()` + `twMergeConfig` · `npm run check:classes` · luật trợ năng                   | Giữ nguyên                     |
| **Dữ liệu tham chiếu** — thay hết | tên token (`action-base`, `surface-*`), giá trị màu, thang chữ, số đo Figma, `references/figma.md`, `docs/rules/webview.md` | Thay bằng bản vẽ của dự án mới |

⛔ Con số cụ thể trong file này (`rounded-sm` = 16dp, 41/147 token không đảo,
`#230045`…) là của **bộ tham chiếu hiện tại**. Chúng minh hoạ cho cơ chế, không
phải hằng số của base. Sang dự án khác thì đọc lại từ
`src/styles/{colors,typography,layout}/*.json` chứ đừng chép số ở đây.

Đọc `docs/rules/styling-nativewind.md`, `docs/rules/mobile-ux.md`, `docs/rules/code-style.md`
và `src/shared/ui/AGENTS.md` trước. File này chỉ bổ sung phần **quy trình** và
**danh mục cạm bẫy** — những thứ đọc code không ra.

⚠️ Dựng màn hình **webview** thì đọc thêm `docs/rules/webview.md`. Đó là bộ quy
định của bản tham chiếu (ba tầng cố định, banner `343×192`, thanh icon tối đa 4
mục, bottom sheet max 742px…) — hữu ích làm mẫu, nhưng ⛔ dự án khác thì phải đối
chiếu lại với bản vẽ của chính dự án đó.

---

## Nguyên tắc số một

> **Số đo lấy từ Figma. Màu và cỡ chữ lấy từ token.**

Thấy `#230045` trong Figma thì viết `bg-action-base`, **không** viết `bg-[#230045]`.
Chỉ token mới đổi theo chế độ sáng/tối, và mới cho phép đổi cả app từ một file.

---

## ⛔ Danh mục cạm bẫy — đọc trước khi viết dòng đầu tiên

Mỗi mục dưới đây **đã xảy ra thật** trong repo này. Điểm chung: `tsc` xanh,
`eslint` xanh, app chạy, chỉ có giao diện sai. Không có lỗi nào báo.

### 1. NativeWind bỏ qua class không tồn tại — im lặng tuyệt đối

`bg-primary-11`, `text-fg-6`, `rounded-2xl` (sau khi thang bo góc bị ghi đè) —
tất cả chỉ đơn giản là không có style nào được áp.

**Cách chặn:** chạy `npm run check:classes`. Nó bắt Tailwind sinh CSS thật rồi
báo class nào không ra selector nào. Đây là thứ DUY NHẤT bắt được lớp lỗi này.

### 2. Tiện ích nền là `bg-` **cộng TÊN MÀU**

Token tên `bg-nav` ⇒ class là **`bg-bg-nav`**, hai chữ `bg`. Viết `bg-nav` là đòi
một màu tên `nav` — không tồn tại.

Cùng luật: `bg-bg-1` · `bg-bg-base` · `bg-bg-input` · `bg-bg-skeleton` ·
`border-border-1` · `border-border-brand` · `border-border-error-subtle`.

⚠️ `border-info-subtle` **không** sinh CSS (Tailwind hiểu là bậc `subtle` của họ
màu `info`). Phải là `border-border-info-subtle`.

**Quy tắc chắc chắn:** tra tên token trong `src/styles/colors/colors.json`,
rồi ghép `<tiện ích>-<tên token>`. Đừng suy diễn.

### 3. Thang SỐ không đảo theo chế độ tối

41/147 token là thang số (`primary-*`, `ink-*`, `neutral-*`, `white-*` — tám họ
thang số khác đã bị gỡ vì không bậc nào được dùng) và chúng **giống hệt nhau ở
cả hai chế độ**.

```
primary-8    sáng #120024   tối #120024     ← KHÔNG đảo
action-base  sáng #230045   tối #A976DD     ← đảo đúng chiều
```

Nút `bg-primary-8` + `text-fg-inverse` đo được **1.15:1** ở chế độ tối — nền đậm
trên nền đậm, chữ đậm trên nền đậm (ở chế độ tối `fg-inverse` là `#08120F`, gần
đen). Chấm trắng `neutral-0` trên `action-base` ở chế độ tối: **1.95:1**, biến
mất hoàn toàn.

**Luật:** bề mặt ĐẶC mang màu thương hiệu/ngữ cảnh ⇒ nhóm `action-*` (tương tác
được) hoặc `surface-*` (chỉ là bề mặt). Và **chữ trên nền `action-*` phải là
`*-fg` CÙNG CẶP**: `action-base`→`action-fg`, `action-error`→`action-error-fg`,
`action-accent`→`action-accent-fg`, `action-disabled`→`action-disabled-fg`.
Ghép chéo là mất đúng phần tương phản đã được đo.

### 4. `rounded-sm` ở đây là **16dp**, không phải 2px

`theme.borderRadius` bị GHI ĐÈ. Thang chỉ có: `none` 0 · `2xs` 8 · `xs` 12 ·
`sm` 16 · `md` 24 · `lg` 32 · `3xs` 4 · `full`.

⚠️ `rounded-lg` vẫn hợp lệ nhưng nay là **32dp**. Class copy từ tài liệu Tailwind
hoặc từ web sẽ SAI ÂM THẦM chứ không gãy. `rounded-xl`/`2xl`/`3xl` thì mất hẳn.

### 5. `text-xs` / `text-sm` / `text-lg` không tồn tại

`theme.fontSize` cũng bị ghi đè. Chỉ có **15 vai trò** — xem `typography.json`.
Bám theo TÊN STYLE trong Figma: `LABEL/T16` → `text-label-lg`, `BODY/T14` →
`text-body-md`, `CAPTION/T13` → `text-caption-lg`.

⛔ Bộ tên CŨ (`text-body`, `text-label`, `text-caption`, `text-title`,
`text-heading`, `text-subheading`, `text-body-sm`) **đã bị gỡ**. Chúng trùng số
đo với vai trò chuẩn, và hai bộ tên cho một cỡ chữ nghĩa là đọc class không ra
đang bám style nào. Gõ lại tên cũ là class chết — `npm run check:classes` bắt được.

⛔ ESLint chặn cứng `text-[13px]`, `leading-[17px]`. Cần cỡ mới thì thêm vào
`src/styles/typography/typography.json` rồi `npm run generate:typography` — generator sẽ
KIỂM `lineHeight` theo số đo thật của font (tiếng Việt có dấu chồng hai tầng,
`lineHeight` sát quá thì **Android cắt mất dấu**, iOS thì không ⇒ lọt review).

### 6. `min-h-control-*` KHÔNG tồn tại

`tailwind.config.js` chỉ wire `height: layout.height`. Tailwind 3.4 dựng
`minHeight`/`maxHeight` từ `theme('spacing')`, **không** kế thừa từ `height`.
Chỉ `h-*` mới nhận `control-xs|sm|md|lg`. Dùng `min-h-12` / `min-h-14`.

### 7. `useAnimatedStyle` + `className` = component vô hình

NativeWind gộp class và prop `style` vào MỘT object. Kết quả của
`useAnimatedStyle` mang khoá nội bộ `viewDescriptors`; Reanimated thấy khoá đó
liền coi cả object là handle animation và **vứt sạch style từ class**.

Cách đúng: truyền thẳng `SharedValue` vào `style` (`style={{ opacity: sv }}`) —
đi qua đường inline-props, giữ nguyên style từ class. Và nhớ
`cssInterop(Animated.View, { className: 'style' })`: `Animated.View` không nằm
trong danh sách interop sẵn của NativeWind.

### 8. `tv()` phải nhận `{ twMergeConfig }`

`tailwind-variants` tạo thực thể `twMerge` RIÊNG. Không truyền thì recipe nào
vừa có cỡ chữ vừa có màu chữ sẽ **đánh rơi cỡ chữ**.

```ts
import { tv } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

const chip = tv({ slots: {...}, variants: {...} }, { twMergeConfig });
```

`twMergeConfig` đã khai sẵn: 15 vai trò chữ, thang giãn cách đặt tên, `h-control-*`,
bo góc, và bề dày viền. Thêm bậc token mới vào `layout.json`/`typography.json` là
tự có hiệu lực. Có test chặn: `tests/shared/cn.test.ts`.

### 9. `className` render-prop không tồn tại

`Pressable` cho **`style`** nhận hàm, `className` thì **không** — NativeWind chỉ
nhận chuỗi. Muốn đổi dáng lúc bấm thì đặt render-prop ở `children`:

```tsx
<Pressable className={styles.pressable()}>
  {({ pressed }) => <View className={chip({ state: pressed ? 'press' : 'default' }).root()} />}
</Pressable>
```

⚠️ **Đính chính một điều từng được ghi sai ở đây.** Bản trước của file này (và
`src/shared/ui/AGENTS.md`) nói `onPressOut` KHÔNG bắn khi ngón tay trượt ra ngoài
rồi nhấc, nên bản tự quản bằng `useState` sẽ kẹt ở dáng "đang bấm". **Không
đúng** — đã đọc lại `node_modules/react-native/Libraries/Pressability/Pressability.js`:
`RESPONDER_ACTIVE_PRESS_IN` + `LEAVE_PRESS_RECT` → `RESPONDER_ACTIVE_PRESS_OUT`,
và `_deactivate()` (tức `onPressOut`) CÓ chạy.

Vẫn nên dùng render-prop, nhưng vì lý do khác và nhẹ hơn: nó bỏ được một cặp
state + hai handler, và không có nhịp vẽ lại thừa. ⛔ Đừng đi "sửa" một component
đang dùng `useState` với lý do nó kẹt — nó không kẹt.

### 10. Modifier độ trong chỉ chạy với token ĐẶC

`bg-primary-5/40` ✅. Token vốn đã có alpha (`overlay`, `white-*`, `black-*`,
`bg-primary`, `disabled-*`, `nav-*`, `header-border`…) map qua `rgb(var(--x))`
không có `<alpha-value>` ⇒ `/50` **không có tác dụng**, và người viết tưởng là có.

---

## Quy trình dựng một component

1. **Đọc bản vẽ.** Gọi skill `figma:figma-design-to-code` TRƯỚC `get_design_context`.
   Đọc `references/figma.md` của skill này để biết cạm bẫy riêng của file BIDV.
2. **Lấy số đo** từ Figma: chiều cao, giãn cách, bo góc, bề rộng viền, cỡ ảnh.
3. **Ánh xạ màu sang token** theo bảng trong `src/shared/ui/AGENTS.md`.
   ⛔ Không chép hex.
4. **Viết** theo khuôn `tv()` + slots. 1 file = 1 component export, ≤ 200 dòng.
   Mẫu tốt: `src/shared/ui/chip/Chip.tsx`.
5. **Icon** đi qua `<Icon name="…" />` (`@/shared/ui/icon`), hoặc mở khe
   `leading?: ReactNode` / `trailing?: ReactNode`. ⛔ Đừng vẽ SVG tay.
   `@expo/vector-icons` **đã bị gỡ khỏi dự án** — không còn gói đó để dùng.

   `IconName` là union THẬT gồm **303 tên** — 152 icon hệ thống (`arrow-left`,
   `cancel`, `view`, `hide`…), 44 icon chức năng (`fn/ve-may-bay`), 107 logo ngân
   hàng (`bank/bidv`). Gõ sai tên là `tsc` đỏ ngay, không còn hỏng âm thầm.

   ```tsx
   <Icon color="fg-on-nav" name="arrow-left" size={24} />
   <Icon name="setting" variant="twotone" />   // linear | solid | twotone | bulk
   <Icon name="bank/bidv" size={32} />         // logo, giữ màu gốc, không tô lại
   ```

   `color` nhận **tên token**, không nhận mã màu.

6. **Trợ năng** — bắt buộc, không phải tuỳ chọn: `accessibilityRole`,
   `accessibilityLabel` cho nút chỉ có icon, `accessibilityState`
   (`selected`/`disabled`/`busy`/`checked`), vùng chạm ≥ 44dp (nhỏ hơn thì
   `hitSlop`, ⛔ đừng phóng to hình vẽ), và gộp thông tin chỉ-thấy-bằng-mắt vào
   nhãn (huy hiệu "3" phải đọc thành "3 mục chưa đọc").
7. **Kiểm** — cả bốn bước, xem dưới.

---

## Kiểm tra — bốn bước, bước 3 là bước không thể bỏ

```bash
npx tsc --noEmit
npx eslint <thư-mục> --max-warnings 0
npm run check:classes          # ⇐ thứ duy nhất bắt class chết
npx prettier --check "<thư-mục>/**/*.{ts,tsx}"
```

Hoặc `npm run check` chạy cả chuỗi kèm test.

⚠️ `npm run check:classes` phải ra **0 class chết**. Nếu nó báo nhầm (tên biến
thể trong `tv()`, tên icon, khoá object trùng dạng class) thì sửa bộ lọc trong
`scripts/check-classes.mjs`, ⛔ đừng bỏ qua kết quả.

---

## Viết chú thích

Tiếng Việt, chỉ giải thích **VÌ SAO**, không mô tả lại code.
`⛔` = đừng làm · `⚠️` = cạm bẫy · `✅`/`❌` = đúng/sai.

```tsx
// ❌ Đặt chiều cao nút
root: 'h-control-md';

// ✅ `h-control-md` = 48dp. ⛔ Đừng hạ xuống dưới 44: đó là ngưỡng chạm tối
//    thiểu mà cả Apple lẫn Google khuyến nghị. Dưới mức đó người dùng bấm
//    trượt và họ đổ lỗi cho app chứ không cho ngón tay mình.
root: 'h-control-md';
```

Mỗi prop "quên là hỏng thật trên máy" phải nói rõ **hỏng ra sao**, không chỉ nói
là quan trọng.

---

## Tài liệu kèm theo

- `references/tokens.md` — bảng ánh xạ vai trò → token, và cách chọn khi phân vân.
- `references/figma.md` — cạm bẫy riêng của file Figma BIDV (hạng khách hàng
  Mass/Premier/VVIP, section nào trả về giá trị hạng nào).
