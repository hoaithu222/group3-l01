---
name: responsive-ui
description: Làm bố cục CO GIÃN cho base React Native này — ba bậc `phone:` `tablet:` `tablet-lg:`, hook `useBreakpoint`/`useResponsiveValue`, và luật thử trên bốn cỡ màn. Dùng khi người dùng nhắc tới responsive/máy tính bảng/xoay ngang/chia đôi màn hình/màn hình nhỏ/chữ bị cắt/tràn layout, khi màn hình phải chạy cả trên tablet, và khi sửa BẤT KỲ bố cục nào (`flex-row`, bề rộng, chiều cao, số cột). Chứa lý do thang `sm:` `md:` của Tailwind đã bị gỡ và sáu điều cấm mà `tsc`/`eslint` không bắt được.
---

# Bố cục co giãn

Luật đầy đủ: **`docs/rules/responsive.md`** — đọc trước, skill này chỉ là quy
trình áp dụng. ⛔ Đừng đoán số breakpoint, đừng đoán tên tiền tố.

## Ba điều phải nhớ ngay

1. Chỉ có **ba** bậc: `phone:` 390 · `tablet:` 600 · `tablet-lg:` 840, cộng
   `landscape:` / `portrait:`. ⛔ `sm:` `md:` `lg:` **đã bị gỡ** — gõ vào là
   class chết, im lặng, giao diện trông như chưa từng có tiền tố nào.
2. Chỗ nào có `className` thì **luôn dùng class**, không dùng hook. Hook vẽ lại
   cả cây con ở mỗi nhịp đổi kích thước (kéo chia đôi màn hình là hàng chục
   nhịp/giây).
3. Số breakpoint có MỘT nguồn: `src/styles/layout/layout.json` khoá
   `breakpoint`. ⛔ Không viết `width >= 600` tại chỗ — cần số thì lấy
   `BREAKPOINTS` từ `@/shared/theme`.
4. TRẦN cột nội dung là MỘT token: `tablet:max-w-content` (720dp, khoá
   `container` của `layout.json`) — chung cho `Screen`, `AppBar`,
   `BottomActionBar`, `BottomNav`, tấm trượt, `Input`/`SearchInput`. ⛔ Không
   tự chế `tablet:max-w-[600px]`/`[560px]`; trong JS dùng `CONTAINER_MAX_WIDTH`.
   NGƯỠNG 600 ≠ TRẦN 720 — xem `docs/rules/responsive.md` mục 5.1.

## Quy trình

1. **Đọc `docs/rules/responsive.md`** (và `styling-nativewind.md` nếu còn đụng
   tới token/class).
2. **Viết cho máy HẸP trước** (bậc không tiền tố), rồi mới thêm `tablet:` để
   nới. Tất cả là `min-width` — làm ngược lại thì máy hẹp, chỗ dễ vỡ nhất, lại
   là chỗ không ai ngắm.
3. **Chọn đúng công cụ**: có `className` → class; prop nhận số thô
   (`numColumns`, `numberOfLines`…) → `useResponsiveValue`; rẽ nhánh nội dung →
   `useBreakpoint`.
4. **Ngắm đủ bốn cỡ** (mục 4 của tài liệu): 320dp · 390dp · 600dp+ · nằm ngang.
   Máy ảo có sẵn: `Medium_Tablet` · `Pixel_10` · `Pixel_10a` · `Pixel_9_Pro`.
5. **`npm run check`** — `check:classes` là bước duy nhất bắt được tiền tố bậc
   gõ sai.

## Checklist trước khi báo xong

- [ ] Không có `Dimensions.get(` nào mới — dùng `useWindowDimensions` /
      `useBreakpoint` (⛔ số đo đọc một lần thì xoay máy là bố cục kẹt ở kích
      thước cũ).
- [ ] Không có `sm:` `md:` `lg:` — chúng không sinh CSS.
- [ ] Không có `w-[…px]` cứng cho khối bố cục. Chặn giãn thì `max-w-…`, không
      phải `w-…` — và cột nội dung thì `tablet:max-w-content`, không số tự chế.
- [ ] Vùng cuộn mới có `showsHorizontalScrollIndicator={false}` +
      `showsVerticalScrollIndicator={false}` (ESLint #12, `docs/rules/mobile-ux.md`).
- [ ] Không có `h-[…px]` bọc quanh chữ. Cần sàn thì `min-h-…`; chiều cao buộc
      phải cứng thì kèm `maxFontSizeMultiplier` + `numberOfLines`.
- [ ] Không có `allowFontScaling={false}`.
- [ ] Khối trải hết bề rộng có nội dung bấm được → đã cộng `insets.left` /
      `insets.right` (không chỉ `top`/`bottom`).
- [ ] Đã thử xoay ngang ít nhất một lần, và một lần ở 320dp.

## Khi cần ĐỔI hay THÊM bậc

Đó là việc sửa token, không phải sửa màn hình → chuyển sang skill
`design-tokens`: sửa `src/styles/layout/layout.json` → `npm run generate:layout`
→ `npm run check:classes`. ⛔ Không sửa `tailwind.config.js`, không sửa file
`*.generated.*`. Generator chặn cứng bậc không tăng dần và bậc `0`.
