import type {
  RescheduleBatchDto,
  ReschedulePreviewDto,
  RescheduleSkipped,
  RescheduleSkipReason,
} from '../api/critical-path.types';

/** Lý do bỏ qua, viết trong câu tóm tắt: "bỏ qua 2 thẻ đã xong". */
const SKIP_PHRASE: Record<RescheduleSkipReason, string> = {
  DELETED: 'đã xoá',
  DONE: 'đã xong',
  NO_DATES: 'chưa có ngày',
};

const SKIP_ORDER: readonly RescheduleSkipReason[] = ['DONE', 'NO_DATES', 'DELETED'];

/** Tiêu đề tấm cảnh báo — `affectedCount` là TỔNG (danh sách `affected` bị cắt ở 200). */
export function rescheduleSheetTitle(preview: Pick<ReschedulePreviewDto, 'affectedCount'>): string {
  return `Việc này sẽ dời lịch của ${preview.affectedCount} thẻ khác`;
}

/** "+2 ngày" / "-1 ngày" — `0` không nên xuất hiện trong `affected` nhưng vẫn đọc được. */
export function shiftLabel(days: number): string {
  if (days === 0) return 'Không đổi';
  return `${days > 0 ? '+' : '-'}${Math.abs(days)} ngày`;
}

/** "bỏ qua 2 thẻ đã xong, 1 thẻ chưa có ngày" — rỗng khi không có gì bị bỏ qua. */
function skippedPhrase(skipped: readonly RescheduleSkipped[]): string {
  const parts = SKIP_ORDER.flatMap((reason) => {
    const count = skipped.filter((item) => item.reason === reason).length;
    return count > 0 ? [`${count} thẻ ${SKIP_PHRASE[reason]}`] : [];
  });
  return parts.length > 0 ? `bỏ qua ${parts.join(', ')}` : '';
}

/**
 * Câu tóm tắt sau khi áp đồng bộ (`200`): "Đã dời 5 thẻ, bỏ qua 2 thẻ đã xong". Tiếng Việt không có số nhiều nên
 * "1 thẻ" và "5 thẻ" cùng một mẫu; ca đáng phân biệt là KHÔNG thẻ nào phải dời (chỉ thẻ nguồn đổi).
 */
export function rescheduleSummary(appliedCount: number, skipped: readonly RescheduleSkipped[]): string {
  const skippedText = skippedPhrase(skipped);
  const head = appliedCount > 0 ? `Đã dời ${appliedCount} thẻ` : 'Không có thẻ nào phải dời lịch';
  return skippedText ? `${head}, ${skippedText}` : head;
}

/** Banner khi lô nền còn chạy: "Đang dời lịch 250 thẻ… (120/250)". */
export function batchRunningText(batch: Pick<RescheduleBatchDto, 'affectedCount' | 'appliedCount'>): string {
  const progress = batch.appliedCount > 0 ? ` (${batch.appliedCount}/${batch.affectedCount})` : '';
  return `Đang dời lịch ${batch.affectedCount} thẻ…${progress}`;
}

/** Kết quả lô nền: "Đã dời 249 thẻ, 1 xung đột" (PM2-27); `FAILED` nói rõ là chưa dời thẻ nào chắc chắn. */
export function batchResultText(batch: RescheduleBatchDto): string {
  if (batch.status === 'FAILED') return 'Dời lịch không hoàn tất do lỗi hệ thống';
  const head = `Đã dời ${batch.appliedCount} thẻ`;
  return batch.conflictCount > 0 ? `${head}, ${batch.conflictCount} xung đột` : head;
}

/** Lô còn đang chạy (còn phải hỏi lại) hay đã kết thúc. */
export function isBatchActive(status: RescheduleBatchDto['status'] | undefined): boolean {
  return status === 'QUEUED' || status === 'RUNNING';
}
