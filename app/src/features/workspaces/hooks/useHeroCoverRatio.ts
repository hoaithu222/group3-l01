import { useBreakpoint } from '@/shared/theme';
import { MEDIA_ASPECT_RATIO } from '@/shared/ui/card';

/**
 * Tỉ lệ bìa khi NẰM NGANG — 4:1. ⚠️ Từ 600dp nội dung `Screen` bị chặn ở 720 (`constrained`), mà máy nằm ngang hầu hết rộng
 * hơn 720 ⇒ bìa `banner-slim` (343:163) rộng 688dp (720 trừ lề 2×16) cao ~330dp trên một màn chỉ còn ~300dp dưới thanh tiêu
 * đề: bìa chiếm hết khung nhìn, tên nhóm và lối vào bị đẩy khỏi màn. 4:1 còn ~170dp — vẫn ra ảnh bìa, chừa chỗ cho nội dung.
 */
const LANDSCAPE_COVER_RATIO = 4;

/**
 * Tỉ lệ bìa của đầu trang tổng quan nhóm — dùng CHUNG cho `WorkspaceOverviewHero` và `WorkspaceOverviewSkeleton` để khung
 * xương cao đúng bằng bìa thật (không nhảy khi dữ liệu về). Đứng: `banner-slim`, đúng khung ô xem trước ở Cài đặt nhóm
 * (ảnh cắt đúng như người quản trị đã thấy lúc chọn); nằm ngang: `LANDSCAPE_COVER_RATIO`.
 *
 * Hook (không phải class `landscape:`) vì `aspectRatio` của `WorkspaceCover` là SỐ, không nhận className.
 */
export function useHeroCoverRatio(): number {
  const { isLandscape } = useBreakpoint();
  return isLandscape ? LANDSCAPE_COVER_RATIO : MEDIA_ASPECT_RATIO['banner-slim'];
}
