/**
 * Hình học & bề mặt của TẤM THẺ xác thực (`AuthLayout`) và khoang giới thiệu (`AuthBrandPanel`).
 *
 * Tách khỏi JSX (`docs/rules/clean-code-standards.md §2`): layout chỉ còn dựng khung, còn "cao bao
 * nhiêu, tô màu gì" nằm một chỗ.
 *
 * ⛔ KHÔNG hex. Màu đi qua token + `hudMix()`/`hudSurface()` nên tự đúng theo theme. Riêng MẶT NẠ
 *    (`mask-image`) chỉ đọc KÊNH ALPHA, nên màu "đặc" của mặt nạ lấy một token nền luôn đục
 *    (`--color-bg-base`) — viết mã hex màu đen là lọt hex vào nguồn chỉ để chở một giá trị alpha.
 */
import type { CSSProperties } from 'react';

import { hudMix, hudSurface } from '@/shared/utils/style/hud-fx.utils';

import { DOT_PAPER_STYLE } from './auth-motifs';

/**
 * Chiều cao chốt của tấm thẻ từ `lg`. ĐO theo form CAO NHẤT — Đăng ký, lúc cả bốn ô cùng báo lỗi (bấm
 * "Đăng ký" khi form còn trống là ra đúng cảnh này) — không ước lượng:
 *
 *   FormItem  = nhãn 20 + 6 + ô nhập h-9 36 + 6 + dòng lỗi 16                 =  84px
 *   Form      = 4 ô × 84 + 4 khe 16 + FormActions (pt-4 16 + nút h-11 44)     = 460px
 *   Tiêu đề   = lời chào 20 + 8 + h1 36 + 4 + câu phụ 20 (`AuthPageHeading`)  =  88px
 *   Cả trang  = 88 + 460 + dòng cuối 16 + 2 khe 16                            = 596px
 *   + lề trong 40 × 2                                                         = 676px
 *
 * 692px (trừ viền 1px × 2 còn 690) cho dư 14px phòng chênh lệch render phông. Bản trước chốt 660px khi cụm
 * tiêu đề còn 56px (chưa có dòng lời chào, câu phụ cỡ 12px) — giữ 660 thì màn Đăng ký lúc báo lỗi luôn sinh
 * thanh cuộn. Ba trang xác thực còn lại (đăng nhập · quên / đặt lại mật khẩu) đều thấp hơn, kể cả khi có
 * `Callout`. Riêng form ĐĂNG KÝ NHÀ TUYỂN DỤNG (`features/recruiter-portal`, cũng dùng `AuthLayout`) là form
 * doanh nghiệp dài hơn hẳn: nó CUỘN trong khoang form, khung vẫn đứng yên — đừng nâng chiều cao theo nó.
 *
 * Khoang trái ở 692px: nội dung còn 610px (690 − lề trong 80). Phần cứng 386px — logo 44 · câu dẫn 2 dòng
 * 80 + khe 12 + câu mô tả 2 dòng 40 = 132 · danh sách 3 × 38 + 2 khe 12 = 138 · 3 khe `gap-6` = 72 (lớp giấy
 * chấm là `absolute`, không ăn khe) — hình lộ trình ăn nốt ~224px, dưới trần 232px (`LearningRoadmapArt`).
 *
 * ⛔ `7rem` PHẢI khớp `lg:py-14` của trang (56px × 2). Đổi một cái mà quên cái kia là tấm thẻ tràn khỏi
 *    khung nhìn trên màn thấp. `dvh` chứ không `vh`: Safari iPad tính `100vh` cao hơn vùng nhìn thấy.
 */
export const AUTH_CARD_HEIGHT = 'min(692px, calc(100dvh - 7rem))';

/**
 * Bề mặt tấm thẻ — ĐIỀM ĐẠM, không còn vành sáng chạy vòng hay scanline:
 *   · nền `bg-1` gần đặc (94%) — phần còn lại + `backdrop-blur` để quầng màu của nền ánh nhẹ qua mép;
 *   · viền 1px pha chút tím thương hiệu vào `border-1` (tự lật: xám lam nhạt ở sáng, lam thẫm ở tối);
 *   · bóng hai lớp: `popup-shadow` lo độ nổi, lớp tím `primary-6` lo "hồn" thương hiệu. Ở theme sáng
 *     `popup-shadow` chỉ còn 8% độ đục, chính lớp tím mới tách tấm thẻ khỏi nền.
 */
export const AUTH_CARD_STYLE = {
  '--auth-card-h': AUTH_CARD_HEIGHT,
  background: hudMix('var(--color-bg-1)', 94),
  border: `1px solid ${hudSurface('var(--color-primary-5)', 18, 'var(--color-border-1)')}`,
  boxShadow: `0 1px 2px var(--color-popup-shadow), 0 30px 70px -36px var(--color-popup-shadow), 0 36px 80px -44px ${hudMix('var(--color-primary-6)', 55)}`,
} as CSSProperties;

/**
 * Nét NGĂN hai khoang — đường gấp đứt quãng giữa hai trang của cuốn sổ. Nét 6px · khe 6px pha từ `fg-5`,
 * tan dần hai đầu bằng mặt nạ để không đâm vào mép thẻ.
 *
 * Hướng đọc từ `--auth-seam-dir` (đặt bằng class ở nơi dùng): màn hẹp hai khoang xếp DỌC nên nét là
 * đường NGANG (90deg), từ `lg` là đường DỌC (180deg). ⛔ Để nguyên 180deg trên phần tử cao 1px thì cả
 * chu kỳ nét đứt bị nén vào 1px — ra một vạch phẳng, mất cả nét đứt lẫn phần tan dần.
 */
const SEAM_MASK =
  'linear-gradient(var(--auth-seam-dir), transparent, var(--color-bg-base) 14%, var(--color-bg-base) 86%, transparent)';
export const AUTH_SEAM_STYLE: CSSProperties = {
  backgroundImage: `repeating-linear-gradient(var(--auth-seam-dir), ${hudMix('var(--color-fg-5)', 55)} 0 6px, transparent 6px 12px)`,
  maskImage: SEAM_MASK,
  WebkitMaskImage: SEAM_MASK,
};

/**
 * Nền khoang giới thiệu — lớp tím RẤT nhạt tan sang chút teal ở góc dưới. Nó tách khoang "trang bìa" khỏi
 * khoang form (giữ nguyên nền trơn của thẻ cho chỗ gõ chữ) mà không cần thêm viền nào. Pha với
 * `transparent` nên đè lên `bg-1` của thẻ: sáng ra màu oải hương phấn, tối ra lam tím thẫm.
 */
export const BRAND_PANE_STYLE: CSSProperties = {
  background: `linear-gradient(160deg, ${hudMix('var(--color-primary-5)', 13)} 0%, ${hudMix('var(--color-primary-5)', 5)} 55%, ${hudMix('var(--color-teal-5)', 8)} 100%)`,
};

/** Mảng giấy chấm ở góc trên-phải khoang giới thiệu — đậm ở góc, tan hết trước khi chạm tới chữ. */
const BRAND_DOTS_MASK = 'radial-gradient(circle at 100% 0%, var(--color-bg-base), transparent 72%)';
export const BRAND_DOTS_STYLE: CSSProperties = {
  ...DOT_PAPER_STYLE,
  maskImage: BRAND_DOTS_MASK,
  WebkitMaskImage: BRAND_DOTS_MASK,
};

/**
 * Dấu thương hiệu: ô tím đặc (`bg-brand`) + bóng CỨNG lệch 4px màu hổ phách — dáng "nhãn dán" trên bìa
 * vở. Bóng không nhoè (`blur 0`) là chủ ý: nhoè ra thì đọc thành quầng sáng HUD, không còn là giấy.
 */
export const BRAND_MARK_STYLE: CSSProperties = {
  boxShadow: '4px 4px 0 0 var(--color-accent-5)',
};
