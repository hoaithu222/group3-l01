/**
 * Tailwind config cho NativeWind 4.
 *
 * ⛔ KHÔNG có mã màu hex nào trong file này. Toàn bộ màu sinh từ nguồn duy nhất
 * `src/styles/colors/colors.json` (chạy `npm run generate:colors`), thang
 * chữ sinh từ `src/styles/typography/typography.json` (`npm run generate:typography`).
 * Muốn đổi màu hay cỡ chữ thì sửa FILE JSON rồi chạy lại script — sửa ở đây là
 * lần sinh sau ghi đè mất.
 *
 * ── Ba việc file này làm ─────────────────────────────────────────────────────
 *  1. Dựng `theme.colors` từ danh sách token, trỏ mọi màu về biến CSS.
 *  2. Bơm giá trị biến cho hai theme bằng plugin `addBase`.
 *  3. Khai font, thang chữ, breakpoint máy tính bảng.
 *
 * ⚠️ NativeWind 4 chạy trên **Tailwind 3.4**, không phải Tailwind 4 như base
 * web. Cú pháp `@theme`, `oklch()` và các tiện ích chỉ có ở v4 KHÔNG dùng được.
 * (NativeWind 5 hỗ trợ Tailwind 4 nhưng tới 2026-09 vẫn là bản `preview` — xem
 * mục "Nợ kỹ thuật đã biết" trong README trước khi định nâng.)
 */
const plugin = require('tailwindcss/plugin');

const layout = require('./src/styles/layout/layout.generated.js');
const colorTokens = require('./src/styles/colors/colors.generated.js');
const typography = require('./src/styles/typography/typography.generated.js');

/**
 * Tên token → giá trị màu của Tailwind.
 *
 * Token ĐẶC dùng `rgb(var(--x) / <alpha-value>)` để `bg-primary-5/40` chạy được.
 * Token CÓ SẴN ĐỘ TRONG dùng `rgb(var(--x))` — biến đã mang cả kênh alpha, thêm
 * `<alpha-value>` vào là Tailwind ghi đè mất độ trong gốc của token.
 */
function buildColors() {
  const colors = {};
  const assign = (token, value) => {
    // 'primary-5'  → colors.primary['5']
    // 'bg'         → colors.bg.DEFAULT
    // 'bg-primary' → colors.bg.primary
    const cut = token.indexOf('-');
    const family = cut === -1 ? token : token.slice(0, cut);
    const shade = cut === -1 ? 'DEFAULT' : token.slice(cut + 1);
    (colors[family] ??= {})[shade] = value;
  };

  for (const token of colorTokens.solidTokens)
    assign(token, `rgb(var(--${token}) / <alpha-value>)`);
  for (const token of colorTokens.alphaTokens) assign(token, `rgb(var(--${token}))`);
  return colors;
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  // `app/` là cây route của Expo Router, `src/` là toàn bộ code còn lại.
  // ⚠️ Thiếu một trong hai thì class ở đó bị Tailwind coi là không dùng và
  // KHÔNG được sinh ra — giao diện mất style mà không có lỗi nào báo.
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],

  /**
   * `class` chứ không phải `media`: người dùng phải TỰ chọn được sáng/tối trong
   * phần Cài đặt, không chỉ đi theo hệ điều hành. Với `media`, NativeWind ném
   * lỗi ngay khi gọi `setColorScheme()`.
   * Lựa chọn "theo hệ thống" vẫn có — do `ThemeProvider` xử lý, xem
   * `src/shell/providers/ThemeProvider.tsx`.
   */
  darkMode: 'class',

  theme: {
    extend: {
      colors: buildColors(),

      /**
       * Một họ font DUY NHẤT cho cả app.
       *
       * Map cả `sans`/`body`/`heading` về cùng một tên để không component nào
       * vô tình rơi về font hệ thống — chữ Việt của font hệ thống Android
       * (Roboto) và font thương hiệu lệch nhau rõ khi đặt cạnh nhau.
       *
       * ⛔ Tên lấy từ `typography.family`, KHÔNG viết cứng. Đã hỏng thật một
       * lần: `typography.json` đổi sang Plus Jakarta Sans và `app.config.ts`
       * đăng ký đúng tên mới, nhưng chuỗi viết cứng ở đây vẫn là "Be Vietnam
       * Pro" — một họ font KHÔNG còn được đăng ký. Hệ quả: `font-sans` trỏ vào
       * hư không, chữ lặng lẽ rơi về Roboto, và **không có lỗi nào báo** vì với
       * React Native thì `fontFamily` chỉ là một chuỗi.
       *
       * Chuỗi này phải khớp ĐÚNG tên khai trong `app.config.ts`:
       *  · Android — plugin expo-font gọi `ReactFontManager.addCustomFont(this,
       *    "<family>", …)`, đăng ký cả 4 nét trong một XML font-family nên
       *    `font-medium`/`font-bold` chọn đúng file.
       *  · iOS — tên lấy từ chính bảng `name` bên trong file .ttf (nameID 16).
       */
      fontFamily: {
        sans: [typography.family],
        body: [typography.family],
        heading: [typography.family],
      },

      /**
       * Giãn cách — THÊM tên gọi, GIỮ nguyên thang số của Tailwind.
       *
       * Thang số mặc định (`p-4` = 16dp) đã trùng khít bội số 4 của thiết kế,
       * nên bỏ nó đi chỉ tổ làm mọi class copy từ tài liệu Tailwind sai nghĩa.
       * Tên gọi (`gap-md`, `p-xs`) thêm vào để chỗ nào bám sát token thiết kế
       * thì đọc ra được ngay là token nào — `Gap/Medium` chứ không phải "16".
       */
      spacing: layout.spacing,

      /** Chiều cao control theo thiết kế: `h-control-md` = 48dp. */
      height: layout.height,

      /** Nét viền: `border-hairline` (1dp) · `border-medium` (1.5dp) · `border-thick` (2dp). */
      borderWidth: layout.borderWidth,

      /**
       * Trần bề rộng cột nội dung: `max-w-content` (720dp — số đo trong `layout.json`
       * nhóm `container`). EXTEND chứ không ghi đè: `max-w-none`/`max-w-full`/`max-w-[…]`
       * vẫn phải dùng được để từng màn đè trần.
       */
      maxWidth: layout.maxWidth,
    },

    /**
     * ⛔ GHI ĐÈ, không `extend` — cùng lý do với thang chữ.
     *
     * Thiết kế của ngân hàng chỉ có 8 mức bo góc (0 · 4 · 8 · 12 · 16 · 24 · 32
     * · tròn). Để thang mặc định của Tailwind sống song song thì `rounded-lg` (8px của
     * Tailwind) và `rounded-md` (16dp của thiết kế) cùng dùng được, và không ai
     * nhìn class mà biết được con số nào là của bản thiết kế.
     *
     * ⚠️ Tên bậc lấy ĐÚNG tên trong Figma (`corner-radius/2xSmall` = 8 →
     * `rounded-2xs`), nên `rounded-sm` ở đây là **16dp**, không phải 2px như
     * Tailwind gốc. Đây là điểm dễ vấp nhất khi copy class từ web.
     */
    borderRadius: layout.borderRadius,

    /**
     * ⛔ GHI ĐÈ, không `extend` — và đây là chỗ khác hẳn với web.
     *
     * Thang mặc định của Tailwind là số đo MÀN HÌNH MÁY TÍNH: `sm` 640 · `md`
     * 768 · `lg` 1024. Điện thoại rộng 360–430dp, nên trên điện thoại `sm:`
     * KHÔNG BAO GIỜ khớp — class copy từ web lặng lẽ không có tác dụng nào, y
     * hệt cái bẫy "NativeWind bỏ qua class lạ". Giữ chúng sống song song là mời
     * người ta viết `md:flex-row` rồi tưởng đã lo xong máy tính bảng.
     *
     * Ba bậc thay vào là số đo THẬT của thiết bị (xem `layout.json`):
     *   `phone:` 390 — điện thoại hiện đại (dưới mức này là máy hẹp 360/375)
     *   `tablet:` 600 — đúng ngưỡng `sw600dp` mà chính Android dùng
     *   `tablet-lg:` 840 — máy tính bảng nằm ngang (`sw840dp`)
     *
     * ⚠️ `min-width`, tức MOBILE-FIRST: viết bố cục cho máy hẹp trước, rồi mới
     * thêm `tablet:` để nới ra.
     */
    screens: layout.screens,

    // ⛔ GHI ĐÈ, không `extend`: thang chữ theo VAI TRÒ phải THAY THẾ thang
    // `text-xs…text-9xl` mặc định. Để cả hai cùng sống thì `text-sm` vẫn dùng
    // được, và chỉ cần một người quen tay là app có hai thang chữ song song —
    // đúng thứ hệ token sinh ra để ngăn.
    fontSize: typography.fontSize,
    fontWeight: typography.fontWeight,
  },

  plugins: [
    /**
     * Bơm giá trị biến cho hai theme.
     *
     * Selector phải ĐÚNG hai dạng này thì `react-native-css-interop` mới nhận ra
     * đây là biến gốc (xem `css-to-rn/normalize-selectors.js`):
     *   `:root`      → biến chế độ SÁNG
     *   `.dark:root` → biến chế độ TỐI (khớp `darkMode: 'class'` ở trên)
     * Viết thành `:root.dark` hay `.dark` trần thì biến bị coi là style thường,
     * không đổi theo theme, và mọi màu kẹt ở giá trị sáng.
     */
    plugin(({ addBase }) => {
      addBase({
        ':root': colorTokens.vars.light,
        '.dark:root': colorTokens.vars.dark,
      });
    }),

    /**
     * ⛔ GẮN HỌ FONT vào mọi lớp chữ — nếu không toàn app rơi về Roboto.
     *
     * Đã đo trên máy ảo: họ font "Plus Jakarta Sans" được đăng ký NATIVE đúng (`MainApplication.kt` →
     * `addCustomFont`), nhưng không class nào trong app từng gán `fontFamily`: `font-sans` không được dùng
     * ở đâu, còn thang `text-<vai trò>` và `font-<độ đậm>` chỉ sinh `fontSize/lineHeight/fontWeight`. NativeWind
     * KHÔNG có preflight nên `font-family` không tự lan xuống từ gốc như trên web; React Native cũng không
     * cho `<Text>` thừa kế font từ `<View>` cha. Kết quả: chữ tiêu đề, nhãn, tab… đều là Roboto — font hệ
     * thống mà chính `tailwind.config` ở trên bảo "không được để rơi về".
     *
     * Cách vá: thêm `font-family` vào ĐÚNG các lớp mà mọi `<Text>` trong app đã bắt buộc dùng theo luật thang
     * chữ (`docs/rules/styling-nativewind.md`): `text-<vai trò>` và `font-<độ đậm>`. Hai bộ rule cùng selector
     * được gộp (CSS cascade), nên `text-body-lg` vẫn ra `fontSize/lineHeight` như cũ và có thêm `fontFamily`.
     * `fontWeight` + họ font đã đăng ký đủ 4 nét ⇒ Android tự chọn đúng file Regular/Medium/SemiBold/Bold
     * (không giả đậm).
     *
     * ⚠️ Thêm vai trò/độ đậm mới ở `typography.json` thì chạy `npm run generate:typography` là đủ — vòng lặp
     * này đọc thẳng từ `typography.fontSize`/`fontWeight`, không có danh sách thứ hai để quên.
     */
    plugin(({ addUtilities }) => {
      const family = { fontFamily: typography.family };
      const rules = {};
      for (const role of Object.keys(typography.fontSize)) rules[`.text-${role}`] = family;
      for (const weight of Object.keys(typography.fontWeight)) rules[`.font-${weight}`] = family;
      addUtilities(rules);
    }),
  ],
};
