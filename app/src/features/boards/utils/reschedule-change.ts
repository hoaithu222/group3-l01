import type { RescheduleChange } from '../api/critical-path.types';

/**
 * Ngày MỚI của thẻ nguồn từ một `PATCH` bị `TASK_006` — cái mà `POST /reschedule` phải nhận để áp đúng điều người dùng
 * vừa đặt. `startDate` LUÔN được gửi tường minh (giá trị mới nếu patch có, còn không thì giá trị hiện tại): body
 * `reschedule` không nói rõ "bỏ trống = giữ nguyên" hay "bỏ trống = xoá", gửi giá trị hiện tại thì cả hai cách hiểu
 * cùng ra một kết quả và không bao giờ xoá nhầm ngày bắt đầu. Không có hạn nào → `null` (không dời lịch được).
 */
export function rescheduleChangeFrom(
  patch: { dueDate?: string | null; startDate?: string | null },
  current: { dueDate: string | null; startDate: string | null },
): RescheduleChange | null {
  const dueDate = patch.dueDate ?? current.dueDate;
  if (!dueDate) return null;
  return { dueDate, startDate: patch.startDate === undefined ? current.startDate : patch.startDate };
}
