import type { RescheduleBatchDto, RescheduleSkipped } from '../api/critical-path.types';
import {
  batchResultText,
  batchRunningText,
  isBatchActive,
  rescheduleSheetTitle,
  rescheduleSummary,
  shiftLabel,
} from '../utils/reschedule-text';

const skipped = (reason: RescheduleSkipped['reason'], id: string): RescheduleSkipped => ({
  reason,
  taskId: id,
  title: `Thẻ ${id}`,
});

const batch = (overrides: Partial<RescheduleBatchDto>): RescheduleBatchDto => ({
  affectedCount: 250,
  appliedCount: 249,
  conflictCount: 1,
  conflicts: [],
  createdAt: '2026-09-25T00:00:00.000Z',
  finishedAt: null,
  id: 'batch-1',
  status: 'PARTIAL',
  ...overrides,
});

describe('reschedule-text', () => {
  it('tiêu đề tấm: đếm theo affectedCount (TỔNG), không theo độ dài danh sách bị cắt ở 200', () => {
    expect(rescheduleSheetTitle({ affectedCount: 5 })).toBe('Việc này sẽ dời lịch của 5 thẻ khác');
    expect(rescheduleSheetTitle({ affectedCount: 380 })).toBe('Việc này sẽ dời lịch của 380 thẻ khác');
  });

  it('shiftLabel: dương / âm / không đổi', () => {
    expect(shiftLabel(2)).toBe('+2 ngày');
    expect(shiftLabel(-1)).toBe('-1 ngày');
    expect(shiftLabel(0)).toBe('Không đổi');
  });

  it('rescheduleSummary: có/không thẻ bỏ qua, gộp theo lý do, số ít = số nhiều', () => {
    expect(rescheduleSummary(5, [])).toBe('Đã dời 5 thẻ');
    expect(rescheduleSummary(1, [])).toBe('Đã dời 1 thẻ');
    expect(rescheduleSummary(5, [skipped('DONE', 'a'), skipped('DONE', 'b')])).toBe(
      'Đã dời 5 thẻ, bỏ qua 2 thẻ đã xong',
    );
    expect(rescheduleSummary(3, [skipped('NO_DATES', 'a'), skipped('DONE', 'b'), skipped('DELETED', 'c')])).toBe(
      'Đã dời 3 thẻ, bỏ qua 1 thẻ đã xong, 1 thẻ chưa có ngày, 1 thẻ đã xoá',
    );
    expect(rescheduleSummary(0, [])).toBe('Không có thẻ nào phải dời lịch');
  });

  it('lô nền: đang chạy có tiến độ, kết thúc nói số xung đột (PM2-27), thất bại nói rõ', () => {
    expect(batchRunningText({ affectedCount: 250, appliedCount: 0 })).toBe('Đang dời lịch 250 thẻ…');
    expect(batchRunningText({ affectedCount: 250, appliedCount: 120 })).toBe('Đang dời lịch 250 thẻ… (120/250)');
    expect(batchResultText(batch({}))).toBe('Đã dời 249 thẻ, 1 xung đột');
    expect(batchResultText(batch({ conflictCount: 0, status: 'DONE' }))).toBe('Đã dời 249 thẻ');
    expect(batchResultText(batch({ status: 'FAILED' }))).toMatch(/không hoàn tất/);
  });

  it('isBatchActive: chỉ QUEUED/RUNNING', () => {
    expect(isBatchActive('QUEUED')).toBe(true);
    expect(isBatchActive('RUNNING')).toBe(true);
    expect(isBatchActive('DONE')).toBe(false);
    expect(isBatchActive('PARTIAL')).toBe(false);
    expect(isBatchActive(undefined)).toBe(false);
  });
});
