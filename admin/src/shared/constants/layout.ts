/**
 * Global layout constants — single source of truth for the top Header height.
 *
 * Anyone needing "viewport minus header" math (BackgroundLayout, side drawers,
 * sticky toolbars, dialog viewports…) MUST import from here. Update one place
 * when design changes header sizing; every consumer stays in sync.
 *
 * ⚠️ CHIỀU CAO HEADER LÀ RESPONSIVE — khớp thang trong `header.theme.ts`:
 *   base    < 1800px  →  44px (h-11)  — laptop 14" & 16" VÀ máy tính bảng
 *   wide:  ≥ 1800px   →  56px (h-14)  — màn ngoài 24" FHD trở lên (cỡ gốc)
 *
 * ⛔ KHÔNG gắn cỡ gốc vào `3xl` (1920px): màn 24" FHD chỉ cho viewport ~1910px
 *    nên `3xl` không bao giờ khớp → header bị khoá ở cỡ compact.
 *
 * ⛔ KHÔNG THÊM BẬC `touch:` VÀO CHIỀU CAO THANH. Bản trước nâng 44→48px cho
 *    iPad; người dùng bác vì thanh dày lên đọc ra như giao diện bị phóng to,
 *    và 4px đó lấy mất của nội dung ở đúng thiết bị có ÍT chiều cao nhất.
 *    Máy tính bảng nay dùng CHUNG thanh 44px với laptop. Chip tab bên trong
 *    thanh vẫn bấm được vì vùng chạm của nó nới bằng lớp `::after` trong
 *    suốt (xem `header.theme.ts`), chứ không bằng cách thổi cao cả thanh.
 *
 *    Bốn class dưới đây là MỘT BỘ: `height` dựng thanh, `belowHeader` đặt vạch
 *    sáng ngay dưới thanh, `contentMaxHeight` / `contentTopOffset` chừa chỗ cho
 *    thanh. Ba cái sau lệch khỏi cái đầu là vạch sáng rơi vào giữa nội dung và
 *    vùng cuộn hụt/thừa đúng phần chênh.
 *
 * Vì thế mọi phép tính "100vh − header" cũng PHẢI responsive; dùng
 * `HEADER_HEIGHT_CLASS.*` thay cho hằng số px khi ở tầng CSS.
 * `HEADER_HEIGHT_PX` / `_REM` chỉ còn đúng cho bậc `wide` — chỉ dùng khi bắt
 * buộc phải có 1 con số (đo đạc JS), KHÔNG dùng để dựng layout.
 */

/** Header height in pixels — bậc `wide` (màn ≥ 1800px). */
export const HEADER_HEIGHT_PX = 56;

/** Header height as `rem` string — bậc `wide`. */
export const HEADER_HEIGHT_REM = '3.5rem';

/** Tailwind utility classes synced with the responsive scale above. */
export const HEADER_HEIGHT_CLASS = {
  /** Apply on `<header>` — fixed bar height. */
  height: 'h-11 wide:h-14',
  /**
   * Content max-height = viewport − header — for an isolated scroll container.
   *
   * Bậc `touch:` dùng `dvh` chứ KHÔNG phải `vh`: trên Safari iPad, `100vh` là
   * chiều cao khi thanh URL đã thu lại nên LỚN HƠN vùng nhìn thấy ~60–90px —
   * vùng cuộn tính theo nó sẽ thò xuống dưới thanh công cụ và mất phần đáy.
   * Trên máy tính hai đơn vị bằng nhau, nhưng bậc `base`/`wide:` vẫn giữ `vh`
   * để không đụng vào những gì đang chạy đúng.
   *
   * ⛔ SỐ TRỪ PHẢI LÀ 2.75rem — BẰNG ĐÚNG `h-11` của `height` ở trên. Bậc
   *    `touch:` ở đây CHỈ đổi ĐƠN VỊ (`vh` → `dvh`), TUYỆT ĐỐI KHÔNG đổi con
   *    số. Bản trước trừ 3rem (48px) vì thanh khi đó cao 48px; thanh đã về
   *    44px nên để nguyên 3rem là vùng cuộn hụt đúng 4px.
   */
  contentMaxHeight:
    'max-h-[calc(100vh-2.75rem)] touch:max-h-[calc(100dvh-2.75rem)] wide:max-h-[calc(100vh-3.5rem)]',
  /** Top offset = header height — for a `fixed`-positioned header layout. */
  contentTopOffset: 'pt-11 wide:pt-14',
  /** `top` = header height — cho overlay bám ngay dưới thanh header. */
  belowHeader: 'top-11 wide:top-14',
} as const;

/**
 * MÁNG LỀ NGANG DÙNG CHUNG — thanh header và vùng nội dung PHẢI bằng nhau.
 *
 * Trước đây header tự khai `px-1 md:px-1.5 wide:px-2` (4/6/8px) còn `<main>`
 * dùng `p-4` (16px). Hệ quả đo được ở mọi bề rộng: mép trái của logo lệch mép
 * trái nội dung 8–10px, mép phải của khối user lệch mép phải nội dung đúng
 * ngần ấy — cả trang đọc ra như hai lớp không nằm trên cùng một lưới.
 *
 *   1920px → header 8px vs nội dung 16px  (lệch  8px)
 *   1536px → header 6px vs nội dung 16px  (lệch 10px)
 *   1280px → header 6px vs nội dung 16px  (lệch 10px)
 *
 * Một hằng số cho CẢ HAI chỗ nên lệch đó không quay lại được: sửa số ở đây thì
 * header và nội dung cùng dịch.
 *
 * ⛔ 8px ở MỌI chế độ (2026-09-29) — bằng `p-2` của `<main>` bản gốc
 *    `vci-sun-pms-fe` và bằng ĐÚNG khe `gap-2` giữa các panel. Bản trước để 16px
 *    ngang + 8px dọc: lề ngoài gấp đôi khe trong nên bốn mép trang đọc ra hai
 *    nhịp khác nhau, và mỗi màn mất 16px bề ngang không đổi lấy gì. Lề = khe là
 *    đúng thủ pháp màn điều hành (大屏): các panel xếp thành MỘT lưới đều tới
 *    tận mép. Nhờ vậy TV mode cũng không còn bậc `tv:` riêng.
 *
 * ⛔ Đây là lề của VỎ ngoài. Padding BÊN TRONG từng control (logo, chip, nút
 *    icon) là chuyện khác, đừng gộp: mép HỘP BẤM ĐƯỢC mới là thứ canh theo
 *    lưới, chữ bên trong hộp cố ý thụt vào.
 */
export const SHELL_GUTTER_X = 'px-2';

/**
 * Đệm dọc của `<main>` — 8px ở MỌI chế độ (bằng bản gốc `vci-sun-pms-fe`),
 * BẰNG lề ngang `SHELL_GUTTER_X`: bốn mép trang cùng một nhịp với khe `gap-2`.
 *
 * Tiêu đề + tab của trang đã lên thanh header (`<PageHeader>`), khe trên chỉ
 * còn việc tách nội dung khỏi ray sáng đáy header — dày hơn là cắt chiều cao
 * của bảng/biểu đồ mà không đổi lấy gì.
 *
 * Dock là lớp `fixed` overlay nên không thuộc luồng layout và không cần cộng
 * đệm đáy theo chế độ hiển thị. Vùng nội dung vì vậy giữ nguyên chiều cao đầy
 * đủ ở mọi mode của Dock.
 */
export const SHELL_GUTTER_Y = 'py-2';

/** CSS `calc()` string for "viewport minus header" — inline-style escape hatch. */
export const CONTENT_MAX_HEIGHT_CSS = `calc(100vh - ${HEADER_HEIGHT_REM})`;
