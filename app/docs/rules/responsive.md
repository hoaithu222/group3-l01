# Bố cục co giãn (responsive)

Cùng một màn hình phải chạy đúng trên máy 320dp, điện thoại 390dp, máy tính bảng
600dp+, và **cả khi xoay ngang**. Mỗi mục dưới đây là một lỗi đã gặp trên máy
thật, không phải sở thích.

File này KHÔNG lặp lại:

- tên token, class, cạm bẫy NativeWind → `styling-nativewind.md`
- vùng an toàn, vùng chạm 44dp, bàn phím → `mobile-ux.md`
- chọn component nào cho việc gì → `ui-components.md`

---

## 1. Ba bậc — và vì sao KHÔNG còn `sm:` `md:` `lg:`

| Tiền tố      | Khớp từ | Media query sinh ra        | Nghĩa                                        |
| ------------ | ------- | -------------------------- | -------------------------------------------- |
| _(không có)_ | mọi máy | —                          | máy hẹp 320–389dp (iPhone SE, Android 360dp) |
| `phone:`     | 390dp   | `(min-width: 390px)`       | điện thoại hiện đại                          |
| `tablet:`    | 600dp   | `(min-width: 600px)`       | máy tính bảng — đúng ngưỡng `sw600dp`        |
| `tablet-lg:` | 840dp   | `(min-width: 840px)`       | máy tính bảng nằm ngang — `sw840dp`          |
| `landscape:` | —       | `(orientation: landscape)` | của Tailwind, giữ nguyên; có cả `portrait:`  |

Ba con số không phải chọn cho đẹp: **600 và 840 là đúng hai ngưỡng `sw600dp` /
`sw840dp` mà chính Android dùng** để phân biệt điện thoại · máy tính bảng · máy
tính bảng nằm ngang. 390 là bề rộng của lớp điện thoại hiện đại — dưới mức đó là
máy hẹp, và máy hẹp chính là bậc mặc định (không tiền tố).

⛔ **Thang `sm` `md` `lg` `xl` `2xl` của Tailwind đã bị GHI ĐÈ, không còn tồn
tại.** Lý do: đó là số đo màn hình **MÁY TÍNH** (`sm` 640 · `md` 768 · `lg`
1024). Điện thoại rộng 360–430dp nên trên điện thoại `sm:` **không bao giờ
khớp** — class copy từ web lặng lẽ không có tác dụng nào. Để chúng sống song
song là mời người ta viết `md:flex-row` rồi tưởng đã lo xong máy tính bảng.

Đo thật bằng cách chạy chính Tailwind với `tailwind.config.js` của repo:

| Class               | Sinh CSS?                                        |
| ------------------- | ------------------------------------------------ |
| `tablet:flex-row`   | ✅                                               |
| `phone:p-xl`        | ✅                                               |
| `tablet-lg:gap-3xl` | ✅                                               |
| `landscape:hidden`  | ✅                                               |
| `sm:flex-row`       | ❌ — không có selector nào ra đời                |
| `md:p-4`            | ❌ (`p-4` vẫn đúng; chính tiền tố `md:` giết nó) |

`npm run check:classes` bắt được lớp lỗi này — nó chạy thật Tailwind rồi hỏi
từng class xem có sinh CSS không. Đây là thứ DUY NHẤT bắt được, `tsc` và
`eslint` đều mù với chuỗi trong `className`.

### Số đo nằm ở đâu, và vì sao hook không bao giờ lệch với class

```
src/styles/layout/layout.json   ← khoá "breakpoint", sửa TAY ở đây
        │  npm run generate:layout
        ├─→ layout.generated.js  → tailwind.config.js  → class `tablet:`
        └─→ src/shared/theme/layout.generated.ts → BREAKPOINTS, BreakpointToken
```

MỘT nguồn, hai đầu ra. ⛔ Vì vậy **đừng viết `width >= 600` tại chỗ** — lệch với
class là bố cục nhảy ở đúng một bề rộng và không ai lần ra vì sao. Cần số thì
lấy `BREAKPOINTS` từ `@/shared/theme`.

Generator chặn cứng hai ca (`scripts/generate-layout.mjs`):

- **bậc không tăng dần** — Tailwind sinh `min-width`, khai lộn thứ tự thì class
  của bậc hẹp ghi đè bậc rộng; CSS vẫn hợp lệ nên không có lỗi nào báo, chỉ là
  máy tính bảng lấy đúng bố cục của điện thoại;
- **bậc `0`** — `min-width: 0px` luôn khớp, biến một bậc thành "mọi máy" và mọi
  bậc sau thành vô nghĩa.

`tests/theme/breakpoints.test.ts` canh thêm ca **sửa `layout.json` rồi quên chạy
generator** — lúc đó class và hook đọc HAI ngưỡng khác nhau và bố cục nhảy một
nửa: phần dùng class đổi ở 600dp, phần dùng hook đổi ở số cũ.

Thêm/đổi bậc là việc của skill `design-tokens` (sửa JSON → chạy generator →
`npm run check:classes`), ⛔ không sửa `tailwind.config.js` và không sửa file
`*.generated.*`.

⚠️ **Mobile-first**: tất cả là `min-width`. Viết bố cục cho máy HẸP trước, rồi
mới thêm `tablet:` để nới ra. Viết ngược lại thì máy hẹp — chỗ dễ vỡ nhất — lại
là chỗ không ai ngắm.

---

## 2. Class hay hook? Có `className` thì LUÔN là class

| Tình huống                                                       | Cách viết                    |
| ---------------------------------------------------------------- | ---------------------------- |
| Chỗ nhận `className` (gần như mọi JSX)                           | ✅ `tablet:flex-row`         |
| Prop nhận SỐ/giá trị thô: `numColumns`, `numberOfLines`, `size`… | ✅ `useResponsiveValue({…})` |
| Cần biết bậc để rẽ nhánh **nội dung** (render cây khác hẳn)      | ✅ `useBreakpoint()`         |

```tsx
// ✅ có className → class
<View className="flex-col gap-md tablet:flex-row tablet:gap-xl" />;

// ❌ cùng việc đó bằng hook — vẽ lại cả cây con ở mỗi nhịp đổi kích thước
const { isTablet } = useBreakpoint();
<View className={isTablet ? 'flex-row gap-xl' : 'flex-col gap-md'} />;
```

**Vì sao:** hook chạy lại và vẽ lại **cả cây con** ở MỖI nhịp đổi kích thước —
kéo thanh chia đôi màn hình trên Android là hàng chục nhịp mỗi giây, và trên
danh sách dài thì thấy rõ khựng. Class thì NativeWind xử ở tầng style, không vẽ
lại component.

Hook chỉ dùng khi thật sự không có `className` nào để bám vào:

```tsx
import { useBreakpoint, useResponsiveValue } from '@/shared/theme';

const columns = useResponsiveValue({ base: 2, tablet: 3, 'tablet-lg': 4 });
const lines = useResponsiveValue({ base: 2, tablet: 1 });
<FlashList numColumns={columns} … />

const { isLandscape, isTablet, tier, width } = useBreakpoint();
```

- `useResponsiveValue` **bắt buộc có `base`**; bậc nào không khai thì rơi xuống
  bậc HẸP hơn gần nhất — cùng luật kế thừa với `min-width`, nên đọc
  `{ base, tablet }` là biết ngay "điện thoại dùng base, từ 600dp dùng tablet".
- `tier` là `'base' | 'phone' | 'tablet' | 'tablet-lg'`.
- ⚠️ `isTablet` so **bề RỘNG ≥ 600**, không so `width > height`. Điện thoại gập
  và chế độ chia đôi màn hình cho ra cửa sổ cao-hơn-rộng nhưng vẫn rộng hơn
  600dp: hai cột ở đó là đúng, còn "đang nằm ngang" thì sai. Cần "đang nằm
  ngang" thật thì dùng `isLandscape`.

Trong `tv()` thì tiền tố bậc là chuỗi class bình thường
(`root: 'px-md tablet:px-2xl'`) — vẫn phải truyền `twMergeConfig` như mọi recipe
khác, xem `styling-nativewind.md`.

---

## 3. ⛔ Sáu điều KHÔNG được làm

**1. `Dimensions.get('window')`.** Đọc MỘT lần rồi thôi, không đăng ký lắng
nghe. Xoay máy, mở chia đôi màn hình trên Android, kéo cửa sổ Stage Manager trên
iPad — bề rộng đổi mà component không vẽ lại, bố cục **kẹt ở kích thước lúc mở
màn**: hai cột đè lên nhau, hoặc một cột chiếm nửa màn còn nửa kia trống trơn.
✅ `useWindowDimensions()`, hoặc `useBreakpoint()` khi chỉ cần bậc.

**2. Bề rộng CỨNG cho khối bố cục** — `w-[343px]`, `w-[165.5px]`, hay hằng số
`343` trong JS. Số trong Figma là số đo trên khung 375; trên máy 320–360dp thì
khối **tràn ra ngoài mép phải** và người dùng thấy nội dung bị cắt (còn trên máy
tính bảng thì thừa một dải trống nửa màn). ✅ `flex-1`, `w-full`, tỉ lệ
(`w-1/2`, `h-1/5`), hoặc TÍNH ra từ bề rộng thật — mẫu: hàng thẻ `flex-row gap-sm`
với mỗi thẻ bọc trong một ô `flex-1` (xem chú thích của `MediaCard`). Muốn chặn khối khỏi giãn
quá rộng thì `max-w-…` chứ không phải `w-…`: `max-w` chỉ CHẶN, không ép, nên máy
hẹp vẫn co lại được (mẫu: `src/shared/ui/empty-state/EmptyState.tsx`).

**3. `h-` cứng cho khối CHỨA CHỮ.** Android cho phóng cỡ chữ hệ thống tới **2×**
(Cài đặt → Hiển thị → Cỡ chữ), iOS cũng có Dynamic Type. Khung cao cố định thì
dòng thứ hai **bị cắt ngang thân chữ**, và với tiếng Việt thì dấu (`Ẳ`, `Ộ`) là
thứ mất trước tiên. ✅ để nội dung tự đẩy chiều cao, cần sàn thì `min-h-…`
(mẫu: `min-h-14` của `AppBar`, `min-h-[44px]` của `ListItem`). Chỗ chiều cao
buộc phải cứng theo bản vẽ (huy hiệu, chip) thì phải kèm
`maxFontSizeMultiplier={1.3}` + `numberOfLines={1}` — xem `Badge.tsx`, `Chip.tsx`.

**4. Quên `insets.left` / `insets.right`.** Ai cũng nhớ `top`/`bottom` và quên
hai cái còn lại. Xoay ngang iPhone có tai thỏ, tai thỏ **ăn vào mép trái hoặc
mép phải** — chữ và nút nằm dưới nó, cụt một khúc và bấm không được. Máy Android
có camera đục lỗ ở cạnh bên cũng vậy. ✅ Khối trải hết bề rộng và có nội dung
bấm được sát mép thì cộng `insets.left` / `insets.right` (mẫu:
`src/shared/ui/tooltip/useTooltipPosition.ts`).

**5. `sm:` `md:` `lg:`.** Không còn sinh CSS ⇒ **im lặng vô tác dụng**, y hệt
cái bẫy "NativeWind bỏ qua class lạ". Nguy hiểm ở chỗ nó trông như đã làm
responsive rồi. ✅ `phone:` `tablet:` `tablet-lg:`.

**6. `allowFontScaling={false}` để "cho khỏi vỡ layout".** Đó là chặn thẳng nhu
cầu trợ năng: người dùng lớn tuổi đã chủ động phóng cỡ chữ trong Cài đặt vì họ
không đọc nổi cỡ mặc định, và app này im lặng phủ quyết. ✅ Cách đúng là bố cục
CO GIÃN ĐƯỢC (điều 3) và, khi chiều cao buộc phải cứng, chặn TRẦN bằng
`maxFontSizeMultiplier` — người dùng vẫn được phóng, chỉ là tới một mức.

---

## 4. Bốn kích thước phải thử trước khi coi là xong

| Cỡ                     | Chờ thấy lỗi gì                                             |
| ---------------------- | ----------------------------------------------------------- |
| **Máy hẹp 320dp**      | tràn mép phải, chữ cụt, hai nút trong hàng đè nhau          |
| **Điện thoại 390dp**   | mốc chuẩn — bản vẽ phải khớp ở đây                          |
| **Máy tính bảng 600+** | một cột kéo dài hết màn, chữ giãn 500dp/dòng, dải trống lớn |
| **NẰM NGANG**          | tai thỏ ăn mép trái/phải, nội dung không cuộn được          |

Cách thử nhanh trên máy ảo có sẵn trong máy này:

```bash
emulator -list-avds        # Medium_Tablet · Pixel_10 · Pixel_10a · Pixel_9_Pro

emulator -avd Medium_Tablet &   # máy tính bảng — bậc tablet / tablet-lg
npm run android

# Xoay ngang: Ctrl+F11 (hoặc nút xoay trên thanh công cụ bên cạnh cửa sổ máy ảo)

# Giả lập máy HẸP mà không cần tạo AVD mới: đổi mật độ điểm ảnh.
adb shell wm size              # xem bề rộng px thật, ví dụ 1080
adb shell wm density 540       # 1080 × 160 / 540 = 320dp
adb shell wm density reset     # ⚠️ nhớ trả lại

# Cỡ chữ hệ thống phóng to (điều 3 và 6 ở trên):
adb shell settings put system font_scale 1.3
adb shell settings put system font_scale 1.0
```

⚠️ Bài thử quan trọng nhất trên máy tính bảng là **chia đôi màn hình rồi KÉO
thanh chia** (nút vuông "gần đây" → giữ biểu tượng app → Chia đôi màn hình). Bề
rộng đổi liên tục — đó là lúc `Dimensions.get()` và mọi số đo cứng lộ ra hết.

---

## 5. Cần gì → viết thế nào

Class trong bảng này đều đã kiểm là **có sinh CSS** với config của repo.

| Cần                                             | Viết                                                 |
| ----------------------------------------------- | ---------------------------------------------------- |
| Dọc trên điện thoại, ngang từ máy tính bảng     | `flex-col gap-md tablet:flex-row tablet:gap-xl`      |
| Cột nội dung không giãn quá rộng (xem mục 5.1)  | `w-full tablet:max-w-content tablet:self-center`     |
| Nới lề trong theo bậc                           | `px-md tablet:px-2xl`                                |
| Ẩn trên điện thoại, hiện từ máy tính bảng       | `hidden tablet:flex` — ⛔ không có `block` ở RN      |
| Ẩn khi nằm ngang (ảnh bìa cao chẳng hạn)        | `landscape:hidden`                                   |
| Chữ to hơn trên máy tính bảng                   | `text-body-md tablet:text-body-lg`                   |
| Khối chiếm tỉ lệ màn, không chiếm số dp cố định | `w-1/2`, `h-1/5` (mẫu: dải gradient của `Screen`)    |
| Số cột của danh sách                            | `useResponsiveValue({ base: 2, tablet: 3 })`         |
| Số dòng tối đa của chữ                          | `useResponsiveValue({ base: 2, tablet: 1 })`         |
| Bề rộng một ô lưới tự tính                      | `(width - padding * 2 - gap) / 2` từ `useBreakpoint` |
| Ngưỡng dp trong code (không phải class)         | `BREAKPOINTS.tablet` từ `@/shared/theme`             |
| Trần cột nội dung trong code (không phải class) | `CONTAINER_MAX_WIDTH.content` từ `@/shared/theme`    |

### 5.1 MỘT trần cột nội dung: `max-w-content` (720dp)

**NGƯỠNG** và **TRẦN** là hai con số khác vai — đừng buộc chung:

| Vai trò                              | Nguồn                                                 | Giá trị |
| ------------------------------------ | ----------------------------------------------------- | ------- |
| "Từ đâu coi là máy tính bảng"        | `layout.json` → `breakpoint.tablet` (`tablet:`)       | 600dp   |
| "Cột nội dung rộng tối đa bao nhiêu" | `layout.json` → `container.content` (`max-w-content`) | 720dp   |

Trần cũ là `max-w-screen-tablet` — tức lấy luôn NGƯỠNG 600 làm trần. Hệ quả đo
được: máy tính bảng 800dp dọc hở 100dp mỗi bên (cộng lề 16 là ~116dp mới tới
chữ), 1280dp nằm ngang hở 340dp — lời chê "padding ngoài to quá". 720 lấy theo dự
án tham chiếu `vci-sun-mobile` (`CONTENT_MAX_WIDTH`): iPad mini dọc (744) gần như
không bị cắt, 800dp chỉ còn hở 40dp, từ iPad Air (820) trở lên mới bắt đầu chừa
lề.

- Cùng MỘT token cho mọi khối chung đứng thẳng cột với nhau: `Screen`, hàng của
  `AppBar`, `BottomActionBar`, `BottomNav`, `BottomSheet`, `TooltipSheet`,
  `InvertedVirtualList`, và cả `Input`/`SearchInput`/ô ngày (để ô nhập thẳng mép
  phải với thẻ và nút bên dưới). Lệch một con số là hai hệ lưới chồng nhau.
- ⛔ Đừng khai trần mới trong feature (`tablet:max-w-[600px]`, `[560px]`,
  `[720px]`): trong màn `constrained` thì thừa, lệch số thì không ai biết trần nào
  đang có hiệu lực. Màn cần tràn (lưới, bảng, bản đồ) dùng `constrained={false}`;
  khối chữ trong màn đó tự chặn bằng `tablet:max-w-content`.
- ✅ Trần chuyên biệt có lý do riêng thì GIỮ: nút `fullWidth` 420 (tầm ngón cái),
  lưới lịch 420, cột đăng nhập 480 (như `AUTH_COLUMN_MAX_WIDTH` của
  `vci-sun-mobile`), bong bóng chat 60%.
- ✅ Không nhảy nấc ở ngưỡng: từ 600 tới 720dp `max-w` chưa cắn gì, qua 720 lề mở
  ra liên tục. `generate-layout` chặn cứng trần hẹp hơn `breakpoint.tablet`.
- ⚠️ Phép tính cần bề rộng khối nội dung (lề tấm trượt so với tai thỏ, ô lưới tự
  tính) lấy `CONTAINER_MAX_WIDTH.content`, ⛔ không phải `BREAKPOINTS.tablet` — hoặc
  tốt hơn, ĐO bằng `onLayout` (mẫu: `resources/components/preview/CodeLines.tsx`).
- ⛔ Không có bậc `tablet-lg` cho trần: máy 840dp+ cần NHIỀU CỘT (việc của từng
  màn), không cần một cột rộng hơn.

---

## 6. Trước khi báo xong

1. Không còn `Dimensions.get`, `sm:`, `md:`, `w-[…px]` cho khối bố cục,
   `h-[…px]` quanh chữ, `allowFontScaling={false}`, trần cột nội dung tự chế
   (`tablet:max-w-[…px]` thay cho `tablet:max-w-content`).
2. Đã ngắm đủ bốn cỡ ở mục 4, có cả một lần xoay ngang.
3. `npm run check` sạch — `check:classes` là bước bắt được tiền tố bậc gõ sai
   (`tabletlg:`, `tablet-large:`) mà `tsc` và `eslint` không thấy.
