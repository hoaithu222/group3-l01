import type { TaskReviewDto } from '../../api/reviews.types';
import { ReassignReviewerBody, type ReassignReviewerBodyProps } from './ReassignReviewerBody';

export interface ReassignReviewerSheetProps extends Omit<ReassignReviewerBodyProps, 'review'> {
  /** Review đang được giao lại; `null` = đóng. */
  review: TaskReviewDto | null;
}

/**
 * Giao lại người chấm (OWNER/ADMIN, p4-05 app.md §2 `ReassignReviewerSheet`): chọn người thay hoặc "Tự chọn theo cân tải" (mặc định) + LÝ DO
 * ≥ 10 ký tự (ghi audit `task-review.reassign`). Danh sách lấy từ `GET /boards/:id/mentionables` (MEMBER+ ACTIVE ≤ 20) — BE kiểm lại
 * người thay hợp lệ (`REVIEW_005`/400 nếu là người làm, khách, ngoài nhóm). Tấm trượt (danh sách + ô nhập), không phải hộp thoại.
 *
 * Cả tấm (kể cả `BottomSheet`) nằm ở `ReassignReviewerBody`: ô lý do + nút "Giao lại" ở khe `footer` phải đọc state của nội dung. Đóng thì
 * không dựng gì; mở thì dựng mới theo `key` — lựa chọn/lý do tự về mặc định mỗi lần mở tấm.
 */
export function ReassignReviewerSheet({ review, ...rest }: ReassignReviewerSheetProps) {
  return review ? <ReassignReviewerBody key={review.id} review={review} {...rest} /> : null;
}
