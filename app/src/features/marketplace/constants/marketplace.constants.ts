import type { IconTileTone } from '@/shared/ui/icon-tile';
import type { IconName } from '@/shared/ui/icon';

import type { ListingContentType } from '../api/marketplace.types';

/** Cỡ trang cursor — cùng mức với `features/coins` (`TRANSACTIONS_PAGE_SIZE`). */
export const LISTINGS_PAGE_SIZE = 20;
export const PURCHASES_PAGE_SIZE = 20;

/** `staleTime` danh sách chợ — dữ liệu công khai, đổi chậm (không phải số dư). */
export const LISTINGS_STALE_MS = 30_000;

/** Số cột của lưới chợ — thẻ tự `flex-1` trong hàng (⛔ không bề rộng cứng `165.5`: máy 320dp tràn cột). */
export const MARKETPLACE_GRID_COLUMNS = 2;

/**
 * Tông nhận diện của phân hệ Chợ tài liệu — trùng ô `store` ở hàng "Chợ tài liệu" màn Tôi (`MarketplaceMeRow`), để dải đầu màn,
 * hình minh hoạ rỗng và ô icon đọc ra là CÙNG một phân hệ.
 */
export const MARKETPLACE_TONE: IconTileTone = 'accent';

/**
 * Icon + tông theo LOẠI nội dung — ô icon trên thẻ/hàng. ✅ Luôn đi kèm CHỮ loại (`CONTENT_TYPE_LABELS`): icon và màu chỉ bổ trợ,
 * không bao giờ là dấu hiệu duy nhất. Bộ học dùng `book` + `success` như ô "Học" ở Trang chủ (bộ học CHÍNH LÀ nội dung của phân hệ Học).
 *
 * ⚠️ BE chưa trả ảnh bìa cho tin niêm yết (`Listing` không có trường ảnh) nên thẻ vẽ ô icon theo loại thay cho ảnh — ⛔ đừng dựng
 * `Thumbnail` rỗng: một lưới toàn ô ảnh giữ chỗ trông như lỗi tải ảnh.
 */
export const CONTENT_TYPE_VISUAL: Record<ListingContentType, { icon: IconName; tone: IconTileTone }> = {
  STUDY_SET: { icon: 'book', tone: 'success' },
  RESOURCE: { icon: 'document-2', tone: 'info' },
};

/**
 * Loại mục trong phần xem trước bộ học (`ListingPreviewItem.type` = `StudyItemType` của BE). ⚠️ Chép lại NHÃN + ICON của
 * `features/study/constants/study.constants.ts` (`ITEM_TYPE_META`) thay vì nhập chéo feature — đổi bên đó thì đổi cả ở đây.
 * Loại lạ (BE thêm mới) rơi về `PREVIEW_FALLBACK`.
 */
export const PREVIEW_ITEM_VISUAL: Record<string, { icon: IconName; label: string; tone: IconTileTone }> = {
  FILL_BLANK: { icon: 'edit', label: 'Điền vào chỗ trống', tone: 'warning' },
  FLASHCARD: { icon: 'book', label: 'Thẻ ghi nhớ', tone: 'brand' },
  MULTI_SELECT: { icon: 'checkmark-square', label: 'Nhiều đáp án đúng', tone: 'success' },
  MULTIPLE_CHOICE: { icon: 'checkmark-circle', label: 'Trắc nghiệm', tone: 'info' },
  TRUE_FALSE: { icon: 'tick-double-01', label: 'Đúng / Sai', tone: 'accent' },
};

export const PREVIEW_FALLBACK = { icon: 'document' as IconName, label: 'Câu hỏi', tone: 'neutral' as IconTileTone };
