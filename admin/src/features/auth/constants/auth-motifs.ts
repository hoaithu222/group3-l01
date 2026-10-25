/**
 * Mô-típ hình dùng chung của MỌI màn xác thực — ngôn ngữ "sổ tay học tập".
 *
 * Ba thứ, mỗi thứ xuất hiện ở ÍT NHẤT hai nơi (nên mới khai ở đây):
 *   · `AUTH_PANE_PADDING`  — lề trong của CẢ HAI khoang tấm thẻ (`AuthLayout` + `AuthBrandPanel`).
 *   · `HIGHLIGHTER_STYLE`  — vệt bút dạ quang: từ khoá câu dẫn ở khoang giới thiệu + dòng chào của form.
 *   · `DOT_PAPER_STYLE`    — giấy chấm: nền cả trang (`AuthBackdrop`) + góc khoang giới thiệu.
 *
 * ⛔ File `.ts`, KHÔNG phải `.tsx`: các hằng số này được nhiều component dùng chung. Để trong một file
 *    `.tsx` thì file đó export lẫn component với non-component, và Fast Refresh mất trạng thái mỗi lần
 *    sửa (`react-refresh/only-export-components`).
 *
 * ⛔ KHÔNG hex. Mọi màu đi qua `hudMix()` trên token (`--color-accent-5`, `--color-fg-5`…) nên tự đúng
 *    theo theme — xem `docs/rules/color-system.md`.
 */

import type { CSSProperties } from 'react';

import { hudMix } from '@/shared/utils/style/hud-fx.utils';

/**
 * Lề trong của CẢ HAI khoang. 32px màn hẹp · 40px màn lớn.
 *
 * ⛔ MỘT hằng số cho hai khoang, không phải hai con số trùng nhau: hai khoang nằm cạnh nhau trên cùng
 *    một hàng, lệch lề trong là đỉnh chữ bên trái không thẳng hàng với đỉnh chữ bên phải — lỗi bố cục
 *    hai cột dễ thấy nhất. Bản trước khoang giới thiệu tự gõ `p-6` còn khoang form `p-8`: màn hẹp lệch
 *    nhau đúng 8px. Sửa lề thì sửa ở ĐÂY.
 *
 * 40px là bậc đúng cho tấm thẻ cỡ này: 32px thì chữ sát viền, 48px thì khoang form chỉ còn 396px cho ô
 * nhập và nhãn dài bắt đầu phải xuống dòng trên iPad.
 */
export const AUTH_PANE_PADDING = 'p-8 lg:p-10';

/**
 * VỆT BÚT DẠ QUANG — dải hổ phách đè lên NỬA DƯỚI dòng chữ, như vệt highlight trong vở ghi.
 *
 * Cùng một nét bút ở cả hai khoang (từ khoá "thông minh" bên trái, dòng "Chào mừng trở lại" bên phải) là
 * thứ nối hai nửa tấm thẻ thành một. Khai một chỗ thì không lệch màu/độ dày giữa hai nơi được nữa.
 *
 * Dải chỉ phủ 58% → 90% chiều cao dòng: phủ kín cả dòng là thành một khối nền màu (đọc ra "nhãn"), còn
 * nửa dưới mới đọc ra "vệt bút".
 *
 * ⚠️ Chữ đè lên dải PHẢI là `fg-1`/`fg-2` (tự lật theo theme), KHÔNG tô màu tông: ở theme tối dải pha ra
 *    nâu ô-liu, chữ tím `link` trên đó chỉ còn ~2.4:1. `fg-2` trên dải: ~5.9:1 (tối) · ~15:1 (sáng).
 *
 * `boxDecorationBreak: clone` — cụm được tô mà rớt xuống hai dòng thì mỗi dòng có một vệt riêng, thay vì
 * một vệt bị cắt ngang ở chỗ xuống dòng.
 */
export const HIGHLIGHTER_STYLE: CSSProperties = {
  backgroundImage: `linear-gradient(transparent 58%, ${hudMix('var(--color-accent-5)', 40)} 58%, ${hudMix('var(--color-accent-5)', 40)} 90%, transparent 90%)`,
  boxDecorationBreak: 'clone',
  paddingInline: 2,
  WebkitBoxDecorationBreak: 'clone',
};

/**
 * GIẤY CHẤM — lưới chấm của trang vở bullet-journal. Mỗi ô 22px một chấm bán kính ~1.25px.
 *
 * Chấm pha từ `fg-5` nên tự lật: xám nhạt trên nền sáng, xám xanh trên nền navy. Hằng số này CHỈ là
 * hoạ tiết — độ đậm và vùng tan dần do nơi dùng quyết (`opacity` + `mask`), vì nền trang và góc khoang
 * giới thiệu cần hai mức khác nhau.
 *
 * ⛔ Chấm, KHÔNG phải lưới kẻ: dòng kẻ ngang chạy xuyên qua chữ và không bao giờ trùng đường chân chữ,
 *    đọc ra rối. Chấm thì nằm lọt giữa các dòng chữ.
 */
export const DOT_PAPER_STYLE: CSSProperties = {
  backgroundImage: `radial-gradient(circle, ${hudMix('var(--color-fg-5)', 45)} 1px, transparent 1.5px)`,
  backgroundSize: '22px 22px',
};
