/**
 * Ngưỡng nội dung + số đo bong bóng của Tooltip.
 *
 * Nguồn: Figma "BIDV OMNI MB" — section `Tooltips` (259:97688), component set
 * `Tooltip` (259:97690) với hai biến thể `Type=Short` / `Type=Long`.
 *
 * ── Vì sao ngưỡng nằm ở đây chứ không nằm trong component ────────────────────
 * Thiết kế chia nội dung tooltip thành BỐN cấp, và hai cấp cuối KHÔNG phải là
 * bong bóng nữa — chúng là bottom sheet và một màn hình riêng. Nghĩa là NƠI GỌI
 * mới quyết được phải hiện cái gì (nó mới biết đường điều hướng, mới có sẵn
 * tiêu đề cho sheet). Component `Tooltip` không tự làm thay được.
 *
 * Vì vậy `resolveTooltipLevel()` phải gọi được từ ngoài, không núp trong file
 * component. Ngưỡng để dạng hằng số có tên để khi thiết kế nới số ký tự thì chỉ
 * sửa một dòng, và người sửa đọc được ngay ghi chú gốc để biết mình đang phá vỡ
 * điều gì.
 */
import { RADIUS, SPACING } from '@/shared/theme';

// ── Cấp 1 — bong bóng ngắn ───────────────────────────────────────────────────
/**
 * Ghi chú thiết kế (nguyên văn): "Max 2 dòng, 56 ký tự bao gồm cả dấu cách".
 *
 * ⚠️ "bao gồm cả dấu cách" là phần dễ bỏ sót: đếm bằng `content.length` mới
 * đúng ý thiết kế, đừng bỏ khoảng trắng ra rồi đếm.
 */
export const TOOLTIP_LEVEL_1_MAX_CHARS = 56;
export const TOOLTIP_LEVEL_1_MAX_LINES = 2;

// ── Cấp 2 — bong bóng dài ────────────────────────────────────────────────────
/** Ghi chú thiết kế (nguyên văn): "Max 4 dòng, 175 ký tự bao gồm cả dấu cách". */
export const TOOLTIP_LEVEL_2_MAX_CHARS = 175;
export const TOOLTIP_LEVEL_2_MAX_LINES = 4;

// ── Cấp 3 — quá dài cho bong bóng ────────────────────────────────────────────
/**
 * Ghi chú thiết kế (nguyên văn): "Nội dung > 5 dòng: Sử dụng bottom sheet".
 *
 * Hai ngưỡng của thiết kế khớp nhau, không mâu thuẫn: bề rộng tối đa 343 trừ
 * 2×12 padding còn 319dp cho chữ, cỡ `text-body-md` chứa khoảng 44 ký tự/dòng,
 * nên 175 ký tự ≈ 4 dòng — vượt 175 ký tự là đã sang dòng thứ 5.
 */
export const TOOLTIP_LEVEL_3_MIN_LINES = 5;

// ── Cấp 4 — nội dung HTML ────────────────────────────────────────────────────
/**
 * Ghi chú thiết kế (nguyên văn): "Nội dung HTML: Show full màn".
 *
 * Cấp này KHÔNG có ngưỡng số đếm — nó phụ thuộc KIỂU nội dung. Ví dụ trong
 * Figma là màn "Điều kiện, điều khoản": bấm vào là điều hướng sang một route
 * riêng, không phải mở lớp phủ. `resolveTooltipLevel()` cố ý không trả về 4 vì
 * nó chỉ nhận chuỗi thuần; dùng `isHtmlTooltipContent()` để nhận diện.
 */
export const TOOLTIP_LEVEL_4_HTML = 4;

// ── Số đo bong bóng (lấy đúng từ Figma) ──────────────────────────────────────
/** `Frame 1597880803`: minWidth 220 ở CẢ hai biến thể. */
export const TOOLTIP_MIN_WIDTH = 220;
/** `Type=Long` maxWidth 343 — cũng là bề rộng lớn nhất thiết kế cho phép. */
export const TOOLTIP_MAX_WIDTH = 343;
/**
 * Bo góc 16 (`border/bo16` = `RADIUS.sm`). Dùng lại để kẹp mũi nhọn không leo
 * lên góc bo.
 */
export const TOOLTIP_RADIUS = RADIUS.sm;
/** Bề rộng mũi nhọn: frame `beak - bottom` 10×5. */
export const TOOLTIP_ARROW_WIDTH = 10;
/**
 * Chiều cao mũi nhọn = khoảng cách bong bóng ↔ phần tử kích hoạt.
 *
 * Trong Figma component cao 69 = bong bóng 64 + mũi nhọn 5, và đầu mũi CHẠM
 * vào phần tử. Nên thiết kế không có "gap" nào ngoài chính chiều cao mũi nhọn.
 */
export const TOOLTIP_ARROW_HEIGHT = 5;
/**
 * Cạnh hình vuông xoay 45° dùng để vẽ mũi nhọn.
 *
 * Đường chéo của hình vuông cạnh `a` là `a√2`; muốn đường chéo bằng bề rộng mũi
 * nhọn (10) thì `a = 10/√2 ≈ 7.07`, và nửa nổi ra ngoài bong bóng cao đúng 5.
 *
 * ⚠️ Vẽ bằng View xoay chứ không bằng `react-native-svg` là CÓ CHỦ Ý: `fill`
 * của SVG chỉ nhận màu thô, tức phải gọi `useThemeColors()` và tự đồng bộ với
 * `bg-bg-tooltip` của bong bóng. Đổi token màu một lần là mũi nhọn lệch tông
 * so với bong bóng mà không ai để ý. View xoay dùng CHUNG một className nên
 * không bao giờ lệch.
 */
export const TOOLTIP_ARROW_SIZE = TOOLTIP_ARROW_WIDTH / Math.SQRT2;

/**
 * Chừa mép an toàn hai bên khi kẹp bong bóng vào trong màn hình.
 *
 * ⚠️ Figma KHÔNG quy định số này (mọi ví dụ đều nằm giữa màn). `SPACING.md`
 * (16) là gutter chuẩn của các màn trong cùng bộ thiết kế nên bong bóng sát mép
 * trông vẫn thẳng hàng với nội dung phía dưới.
 */
export const TOOLTIP_SCREEN_EDGE_GAP = SPACING.md;

// ── Số đo bottom sheet cấp 3 (instance `bottom sheet` 259:97797) ─────────────
/** `min-h-[229px]` của `content BT` — sheet không co nhỏ hơn mức này. */
export const TOOLTIP_SHEET_MIN_HEIGHT = 229;
/**
 * `max-h-[742px]` trên khung 812 → 0.91 chiều cao màn.
 *
 * Ghi thành TỈ LỆ chứ không phải 742: thiết kế vẽ trên iPhone X, còn máy thật
 * cao từ 640 tới 1000+dp. Chép số cứng thì trên máy nhỏ sheet cao quá màn.
 */
export const TOOLTIP_SHEET_MAX_HEIGHT_RATIO = 0.91;

/** Cấp nội dung mà `Tooltip`/`TooltipSheet` xử lý được. */
export type TooltipLevel = 1 | 2 | 3;

/**
 * Chọn cấp hiển thị cho một chuỗi nội dung.
 *
 * · 1 — bong bóng ngắn (`<Tooltip>`)
 * · 2 — bong bóng dài (`<Tooltip>`, cùng component, chỉ khác bề rộng thực tế)
 * · 3 — KHÔNG dùng bong bóng nữa, nơi gọi phải mở `<TooltipSheet>`
 *
 * ⚠️ Đếm cả xuống dòng cứng (`\n`) chứ không chỉ đếm ký tự. Bốn dòng ngắn viết
 * tay vẫn là bốn dòng — nếu chỉ đếm ký tự thì chúng lọt xuống cấp 1 và bong
 * bóng bị ép cao gấp đôi so với thiết kế.
 */
export function resolveTooltipLevel(content: string): TooltipLevel {
  const text = content.trim();
  const hardLines = text.split('\n').length;

  if (hardLines >= TOOLTIP_LEVEL_3_MIN_LINES) return 3;
  if (text.length <= TOOLTIP_LEVEL_1_MAX_CHARS && hardLines <= TOOLTIP_LEVEL_1_MAX_LINES) return 1;
  if (text.length <= TOOLTIP_LEVEL_2_MAX_CHARS && hardLines <= TOOLTIP_LEVEL_2_MAX_LINES) return 2;

  return 3;
}

/**
 * Nội dung có thẻ HTML ⇒ cấp 4: điều hướng sang màn riêng, KHÔNG nhét vào
 * bong bóng cũng không nhét vào sheet.
 *
 * ⚠️ Đây là phép thử "đủ dùng", không phải trình phân tích HTML: nó chỉ tìm một
 * thẻ mở có tên. Nội dung tooltip do backend trả về nên chuỗi nào có `<p>`,
 * `<ul>`, `<a href>` là chắc chắn phải mở màn riêng — còn chuỗi có dấu `<` đơn
 * lẻ (ví dụ "số tiền < 5 triệu") thì không khớp và vẫn ở lại bong bóng.
 */
export function isHtmlTooltipContent(content: string): boolean {
  return /<\s*[a-z][a-z0-9-]*(\s[^<>]*)?\/?>/i.test(content);
}
