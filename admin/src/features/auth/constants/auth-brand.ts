/**
 * Chữ của khoang giới thiệu (`AuthBrandPanel`). Tách khỏi JSX để sửa câu chữ không phải đọc qua hình.
 *
 * Người đọc là ĐỘI VẬN HÀNH của nền tảng học tập, không phải người học: câu dẫn nói nền tảng là gì, dòng
 * dưới nói ngay trang này là cổng vận hành, danh sách nói đúng những việc làm được sau khi đăng nhập.
 *
 * ⛔ KHÔNG bịa số liệu ("10.000+ học viên", "98% hài lòng"): trang đăng nhập không có nguồn nào cho
 *    những con số đó, và một con số sai ngay ở cửa vào làm mất niềm tin với mọi thứ phía sau.
 * ⛔ Mỗi dòng phân hệ ứng với phân hệ CÓ THẬT trong `app/router/modules/` (Lộ trình học · Kỹ năng ·
 *    Gamification · Kiểm duyệt · Workspace). Thêm/bớt phân hệ thì sửa ở đây cho khớp.
 */

/** Câu dẫn thương hiệu. `mark` là cụm được tô vệt bút dạ quang (`HIGHLIGHTER_STYLE`). */
export const BRAND_TAGLINE = { lead: 'Nền tảng học tập', mark: 'thông minh' } as const;

/** Một câu: trang này là CỔNG VẬN HÀNH, và vận hành những gì. */
export const BRAND_SUMMARY =
  'Cổng vận hành dành cho đội ngũ quản trị: điều phối lộ trình, bài giảng, kỹ năng và cộng đồng của người học.';

export interface BrandFeature {
  key: string;
  title: string;
  /** Một câu nói việc cụ thể — hiện dưới tiêu đề, cỡ nhỏ. */
  detail: string;
  /** Tông của vòng số thứ tự — biến token (`var(--color-…)`), pha bằng `hudMix`/`hudInk` ở nơi dùng. */
  tone: string;
}

/**
 * Ba dòng phân hệ. ĐÚNG ba: số thứ tự do CSS counter sinh (xem `AuthBrandPanel`), và
 * `tests/features/auth/auth-shell.test.tsx` giữ đúng số dòng lẫn cách đánh số.
 *
 * Tông ba vòng số lấy lại ba quầng màu của nền (teal · hổ phách · hồng) để khoang giới thiệu cùng bảng màu
 * với phần còn lại của màn, không mọc thêm màu mới.
 */
export const BRAND_FEATURES: readonly BrandFeature[] = [
  {
    key: 'roadmap',
    title: 'Lộ trình học & bài giảng',
    detail: 'Soạn lộ trình theo chặng, buổi học và tài liệu đi kèm.',
    tone: 'var(--color-teal-5)',
  },
  {
    key: 'skill',
    title: 'Kỹ năng xác thực & gamification',
    detail: 'Huy hiệu kỹ năng từ task thật, luật XP và cấp độ.',
    tone: 'var(--color-accent-5)',
  },
  {
    key: 'community',
    title: 'Kiểm duyệt nội dung & cộng đồng',
    detail: 'Báo cáo vi phạm, workspace, kênh và nhóm học.',
    tone: 'var(--color-pink-5)',
  },
];
