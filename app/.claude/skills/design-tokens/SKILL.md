---
name: design-tokens
description: Sửa hệ token của app — bảng màu, thang chữ, bo góc, giãn cách, cỡ control, font. Dùng khi người dùng muốn đổi màu/theme, thêm token, đổi cỡ chữ, đổi font, chỉnh bo góc hay giãn cách, hoặc khi sửa colors.json / typography.json / layout.json / tailwind.config.js. Sửa mấy file này có thể làm HÀNG LOẠT class trong toàn app đổi nghĩa hoặc chết âm thầm — skill này là quy trình để việc đó không xảy ra.
---

# Sửa hệ token

⚠️ Base này dùng lại cho nhiều dự án. Quy trình dưới đây là CƠ CHẾ — giữ nguyên.
Còn tên token và giá trị hiện tại chỉ là bộ tham chiếu (design system BIDV
SmartBanking) lấp vào khung; dự án khác thì thay hết phần dữ liệu, quy trình
không đổi.

Ba nguồn sự thật, mỗi cái có generator riêng:

| Sửa file                                | Chạy lại                      | Sinh ra                                       |
| --------------------------------------- | ----------------------------- | --------------------------------------------- |
| `src/styles/colors/colors.json`         | `npm run generate:colors`     | `colors.generated.js` · `colors.generated.ts` |
| `src/styles/typography/typography.json` | `npm run generate:typography` | `typography.generated.js` · `.ts`             |
| `src/styles/layout/layout.json`         | `npm run generate:layout`     | `layout.generated.js` · `.ts`                 |
| cả ba                                   | `npm run generate:styles`     |                                               |

⛔ **Đừng sửa file `*.generated.*`** — lần chạy sau ghi đè sạch.
⛔ **Đừng viết giá trị thẳng vào `tailwind.config.js`** — nó chỉ được đọc từ file sinh.

`layout.json` có **bảy** nhóm: `radius` · `spacing` · `control` · `icon` ·
`border` · **`breakpoint`** · **`container`**. Thiếu một nhóm là generator dừng.

### Nhóm `container` — TRẦN bề rộng cột nội dung

```json
"container": { "content": 720 }
```

Hai đầu ra: `theme.extend.maxWidth` ⇒ class `max-w-content` (dùng
`tablet:w-full tablet:max-w-content tablet:self-center`), và
`CONTAINER_MAX_WIDTH` / `ContainerToken` (`.ts`) cho phép tính cần bề rộng khối
nội dung (`useSheetEdgeInset`). Dùng chung cho `Screen`, `AppBar`,
`BottomActionBar`, `BottomNav`, tấm trượt, `InvertedVirtualList`, `Input`,
`SearchInput` — lý do và số đo: `docs/rules/responsive.md` mục 5.1.

⛔ NGƯỠNG (`breakpoint.tablet`) ≠ TRẦN (`container.content`). `generate-layout`
chặn cứng trần **hẹp hơn** `breakpoint.tablet` (khối nội dung co giật đúng lúc
chạm ngưỡng). Thêm một trần mới thì thêm khoá vào nhóm này, ⛔ đừng rải
`max-w-[…px]` trong feature; `cn.ts` tự nhận tên mới (đọc từ file sinh).

### Nhóm `breakpoint` — ngưỡng bề rộng màn hình

```json
"breakpoint": { "phone": 390, "tablet": 600, "tablet-lg": 840 }
```

Một nguồn, **hai** đầu ra phải khớp nhau tuyệt đối:

| Đầu ra                                    | Dùng ở đâu                                                        |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `theme.screens` (`tailwind.config.js`)    | class `tablet:flex-row`, `phone:p-xl`, `tablet-lg:gap-3xl`        |
| `BREAKPOINTS` / `BreakpointToken` (`.ts`) | `useBreakpoint()` · `useResponsiveValue()` trong `@/shared/theme` |

⛔ **GHI ĐÈ, không extend.** Thang mặc định của Tailwind là số đo màn hình MÁY
TÍNH (`sm` 640 · `md` 768 · `lg` 1024); điện thoại rộng 360–430dp nên `sm:`
KHÔNG BAO GIỜ khớp — class copy từ web lặng lẽ vô tác dụng. 600/840 là đúng
ngưỡng `sw600dp`/`sw840dp` mà chính Android dùng.

⚠️ `generate-layout` chặn cứng hai ca: bậc **không tăng dần** (Tailwind sinh
`min-width`, khai lộn thứ tự thì bậc hẹp ghi đè bậc rộng và máy tính bảng lấy
đúng bố cục điện thoại — CSS vẫn hợp lệ nên không lỗi nào báo) và bậc **`0`**
(`min-width: 0px` luôn khớp).

⛔ Đổi/thêm bậc là đổi nghĩa MỌI class có tiền tố đó trong app, và cả kết quả
của `useResponsiveValue`. Sau khi sửa phải `grep -rn "tablet:\|phone:" src app`
và ngắm lại. Cách dùng: `docs/rules/responsive.md`.

---

## ⚠️ Vì sao việc này nguy hiểm hơn vẻ ngoài

`theme.fontSize` và `theme.borderRadius` được **GHI ĐÈ**, không phải `extend`.
Nghĩa là đổi một bậc token có thể:

- **Xoá** một class đang được dùng ⇒ NativeWind bỏ qua âm thầm, style biến mất.
- **Đổi nghĩa** một class vẫn hợp lệ ⇒ sai còn khó thấy hơn. Đã xảy ra thật:
  `rounded-lg` từ 8px thành 32dp, cả app bo góc sai mà không có lỗi nào báo.

Nên quy trình dưới đây có bước **đối chiếu trước/sau**, không chỉ là "chạy lại generator".

---

## Quy trình

### 1. Chụp lại hiện trạng TRƯỚC khi sửa

```bash
node -e "const c=require('./src/styles/colors/colors.json');console.log(Object.keys(c.light).sort().join('\n'))" > /tmp/tokens-before.txt
npm run check:classes
```

### 2. Sửa file JSON nguồn

**Thêm** token thì an toàn. **Đổi tên** hoặc **xoá** thì phải sửa mọi nơi dùng —
`grep` trước khi xoá.

### 3. Chạy lại generator

```bash
npm run generate:styles
```

⚠️ Generator **có kiểm** và sẽ dừng nếu sai:

- `generate-typography` (`scripts/generate-typography.mjs`, dùng
  `scripts/lib/font-metrics.mjs`) đo file font thật trong `assets/fonts` rồi kiểm tỉ lệ
  `lineHeight / fontSize`: ≥ 1.30× cho chữ thường, ≥ ngưỡng đo được cho chữ IN HOA
  (Plus Jakarta Sans: 1.5×). Dưới ngưỡng thì **Android cắt mất dấu** tiếng Việt
  (`Ẳ`, `Ộ`) còn iOS thì không ⇒ lỗi lọt qua review làm trên máy Mac.
- `generate-layout` bắt mọi giá trị phải là số dp không âm.

Generator dừng thì **sửa JSON**, ⛔ đừng nới ngưỡng.

### 4. Đối chiếu SAU khi sửa — bước quan trọng nhất

```bash
node -e "const c=require('./src/styles/colors/colors.json');console.log(Object.keys(c.light).sort().join('\n'))" > /tmp/tokens-after.txt
diff /tmp/tokens-before.txt /tmp/tokens-after.txt

npm run check:classes    # ⇐ bắt class vừa chết
npm run check            # typecheck → lint → imports → classes → test
```

`check:classes` chạy CHÍNH Tailwind với config của repo rồi báo class nào không
sinh ra CSS. Đây là thứ DUY NHẤT bắt được lớp lỗi này — `tsc` và `eslint` đều mù
với chuỗi trong `className`.

⚠️ Nếu bạn **đổi nghĩa** một bậc (ví dụ `rounded-lg` từ 8 thành 32) thì
`check:classes` **KHÔNG** báo gì — class vẫn hợp lệ. Phải tự `grep` các class
dùng bậc đó và kiểm từng chỗ.

### 5. Khai vào `twMergeConfig` nếu thêm HỌ token mới

`src/shared/utils/style/cn.ts` khai cho `tailwind-merge` biết thang nào là gì.
Danh sách lấy động từ file sinh, nên **thêm một BẬC** (`spacing.7xl`) là tự chạy.
Nhưng thêm một **HỌ mới** (ví dụ `theme.opacity` đặt tên) thì phải khai thêm
classGroup, nếu không `className` truyền từ ngoài sẽ không đè được.

Kiểm bằng `npx jest tests/shared/cn.test.ts`, và thêm ca test cho họ mới.

---

## ⛔ Ba thứ không được quên

**Đổi font thì phải đổi ba chỗ cùng lúc:**

1. `typography.json` khoá `family`
2. file `.ttf` trong `assets/fonts`
3. `app.config.ts` — plugin `expo-font`

`tailwind.config.js` tự lấy tên từ `typography.family`, ⛔ đừng viết cứng lại.
Đã hỏng thật: đổi sang Plus Jakarta Sans nhưng config còn chuỗi "Be Vietnam Pro"
⇒ `font-sans` trỏ vào hư không, chữ lặng lẽ rơi về Roboto hệ thống.

**`light` và `dark` phải có ĐÚNG cùng bộ khoá.** `tests/theme/tokens.test.ts`
chặn ca này, và cả ca quên chạy generator.

**Đổi `tailwind.config.js` thì phải khởi động lại Metro có cờ `-c`**
(`npm run start:clear`) — Tailwind cache theme lúc build.

---

## Thiết kế thang: ghi đè hay extend?

| Thang                    | Cách wire  | Vì sao                                                                                                                                                                                                                                                |
| ------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fontSize`               | **GHI ĐÈ** | Thang theo vai trò phải THAY THẾ `text-xs…text-9xl`. Để cả hai sống thì app có hai thang chữ song song.                                                                                                                                               |
| `borderRadius`           | **GHI ĐÈ** | Thiết kế chỉ có 8 bậc (`none 3xs 2xs xs sm md lg full`). Để thang Tailwind sống thì `rounded-lg` (8px) và bậc của thiết kế cùng dùng được, không ai nhìn class mà biết số nào là của bản vẽ.                                                          |
| `spacing`                | **EXTEND** | Thang số Tailwind đã trùng khít bội số 4 của thiết kế (`p-4` = 16 = `p-md`). Ghi đè không sửa được sai lệch nào, chỉ xoá đi một cách viết đang đúng — và Tailwind SUY RA `p-0`, `inset-0`, `w-px`, `h-40`, `m-auto` từ `spacing`, ghi đè là mất sạch. |
| `height` · `borderWidth` | **EXTEND** | Chỉ thêm `h-control-*`, `border-hairline/medium/thick`.                                                                                                                                                                                               |
| `screens`                | **GHI ĐÈ** | `sm`/`md`/`lg` là số đo màn hình máy tính, không bao giờ khớp trên điện thoại. Để chúng sống song song là mời người viết `md:flex-row` rồi tưởng đã lo xong máy tính bảng.                                                                            |

⚠️ `minHeight`/`maxHeight` lấy từ `theme('spacing')`, **không** kế thừa từ
`height` ⇒ `min-h-control-md` không tồn tại. Muốn có thì phải wire riêng.

---

## Bảng màu BIDV — điều cần biết trước khi chỉnh

**41/147 token là thang SỐ và giống hệt nhau ở hai chế độ** (`primary-*`,
`ink-*`, `neutral-*`, `white-*`). Đó là bảng màu gốc, cố ý không đảo. Chỉ token
theo VAI TRÒ (`action-*`, `surface-*`, `fg-*`, `bg-*`, `border-*`, và bản trần
`success`/`error`/`warning`/`info`) mới đảo.

⛔ Tám họ thang số khác (`secondary-*` `tertiary-*` `error-*` `warning-*`
`info-*` `success-*` `gray-*` `black-*`) đã bị GỠ khỏi `colors.json`: không bậc
nào từng được `className` hay hook nào tham chiếu. Bản trần một màu
(`success`/`error`/`warning`/`info` — token VAI TRÒ) vẫn còn nguyên, chỉ thang
10 bậc của bốn họ đó là mất. Cần lại một bậc cụ thể thì tra hex trong Figma rồi
thêm token mới, đừng chỉ đoán số.

⇒ Chỉnh một bậc thang số là đổi **cả hai** chế độ. Muốn chỉ đổi chế độ tối thì
phải chỉnh token vai trò.

**File Figma có ba hạng khách hàng** `Mass` · `Premier` · `VVIP`, không phải
sáng/tối. Hệ token hiện lấy theo **Mass** và khoá cứng hai khoá `light`/`dark`.
Cõng thêm Premier/VVIP là thay đổi KIẾN TRÚC (nhiều mode) — ⛔ đừng tự làm, hỏi
người dùng trước.

**Luật đang áp cho bảng màu:** không đè lên giá trị mà bản thiết kế đã chỉ định;
chỉ tự chọn khi thiết kế bỏ trống (đó là lý do toàn bộ chế độ tối được suy ra,
còn chế độ sáng chép nguyên).
