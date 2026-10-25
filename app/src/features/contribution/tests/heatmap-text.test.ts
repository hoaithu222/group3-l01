import {
  activeDaysNewestFirst,
  dayDetailText,
  dayPartsText,
  fullDate,
  heatmapSummary,
} from '../utils/heatmap-grid';
import { day } from './heatmap-day';

describe('bản chữ của biểu đồ', () => {
  it('tóm tắt: số ngày có hoạt động, số tuần, ngày nhiều nhất', () => {
    const days = [day('2026-09-08', 3), day('2026-09-10', 12), day('2026-09-11', 0), day('2026-09-12', 4)];

    expect(heatmapSummary(days, 26)).toBe('3 ngày có hoạt động trong 26 tuần, nhiều nhất 10/09 (12)');
  });

  it('chưa có hoạt động → nói thẳng, không bịa "0 ngày… nhiều nhất"', () => {
    expect(heatmapSummary([day('2026-09-08', 0)], 26)).toBe('Chưa có hoạt động trong 26 tuần gần nhất');
  });

  it('chi tiết ngày liệt kê loại có số > 0: "15/09: 7 hoạt động (4 thẻ, 2 bình luận, 1 lượt chấm)"', () => {
    const detail = day('2026-09-15', 7, { checklist: 0, comment: 2, review: 1, task: 4 });

    expect(dayDetailText('2026-09-15', detail)).toBe('15/09: 7 hoạt động (4 thẻ, 2 bình luận, 1 lượt chấm)');
    expect(dayPartsText(detail)).toBe('4 thẻ, 2 bình luận, 1 lượt chấm');
  });

  it('ngày không có hoạt động (hoặc không có bản ghi) → "không có hoạt động"', () => {
    expect(dayDetailText('2026-09-15', undefined)).toBe('15/09: không có hoạt động');
    expect(dayDetailText('2026-09-15', day('2026-09-15', 0))).toBe('15/09: không có hoạt động');
  });

  it('danh sách theo ngày: chỉ ngày có hoạt động, mới → cũ; ngày đầy đủ có năm', () => {
    const days = [day('2026-09-08', 3), day('2026-09-10', 0), day('2026-09-12', 4)];

    expect(activeDaysNewestFirst(days).map((d) => d.date)).toEqual(['2026-09-12', '2026-09-08']);
    expect(fullDate('2026-09-12')).toBe('12/09/2026');
  });
});
