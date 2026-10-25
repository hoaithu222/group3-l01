import { buildHeatmapGrid, heatmapRange, levelOf, levelThresholds } from '../utils/heatmap-grid';
import { day } from './heatmap-day';

describe('heatmapRange — khoảng ngày gọi API', () => {
  it('26 tuần bắt đầu THỨ HAI: từ thứ Hai của tuần cách đây 25 tuần tới hôm nay (2026-09-15 là thứ Ba)', () => {
    expect(heatmapRange('2026-09-15', 26)).toEqual({ from: '2026-03-23', to: '2026-09-15' });
  });

  it('hôm nay là thứ Hai / Chủ nhật vẫn ra thứ Hai của tuần hiện tại làm mốc', () => {
    expect(heatmapRange('2026-09-14', 4).from).toBe('2026-08-24');
    expect(heatmapRange('2026-09-20', 4).from).toBe('2026-08-24');
  });

  it('máy tính bảng 52 tuần = 364 ngày, còn dưới trần 366 ngày của BE (CONTRIB_004)', () => {
    const { from, to } = heatmapRange('2026-09-15', 52);
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;

    expect(days).toBeLessThan(366);
  });

  it('qua ranh giới năm: 2027-01-03 (Chủ nhật) thuộc tuần bắt đầu 2026-12-28', () => {
    expect(heatmapRange('2027-01-03', 2)).toEqual({ from: '2026-12-21', to: '2027-01-03' });
  });
});

describe('buildHeatmapGrid — lưới 7 hàng × N cột', () => {
  const range = heatmapRange('2026-09-15', 26);

  it('đủ 26 cột × 7 ô; cột đầu là thứ Hai → Chủ nhật liên tiếp', () => {
    const columns = buildHeatmapGrid(range, 26, []);

    expect(columns).toHaveLength(26);
    expect(columns.every((column) => column.cells.length === 7)).toBe(true);
    expect(columns[0]?.cells.map((cell) => cell.date)).toEqual([
      '2026-03-23',
      '2026-03-24',
      '2026-03-25',
      '2026-03-26',
      '2026-03-27',
      '2026-03-28',
      '2026-03-29',
    ]);
  });

  it('ngày server không trả (không có bản ghi) → 0, mức 0', () => {
    const columns = buildHeatmapGrid(range, 26, [day('2026-09-10', 5)]);
    const cells = columns.flatMap((column) => column.cells);

    expect(cells.find((cell) => cell.date === '2026-09-10')).toMatchObject({ level: 1, total: 5 });
    expect(cells.find((cell) => cell.date === '2026-09-09')).toMatchObject({ level: 0, total: 0 });
  });

  it('phần còn lại của tuần hiện tại (sau hôm nay) là `future` — không vẽ, không chạm được', () => {
    const last = buildHeatmapGrid(range, 26, []).at(-1);

    expect(last?.cells.map((cell) => [cell.date, cell.future])).toEqual([
      ['2026-09-14', false],
      ['2026-09-15', false],
      ['2026-09-16', true],
      ['2026-09-17', true],
      ['2026-09-18', true],
      ['2026-09-19', true],
      ['2026-09-20', true],
    ]);
  });

  it('mức theo PHÂN VỊ của các ngày có hoạt động: 1..8 → 1,1,2,2,3,3,4,4', () => {
    const days = [1, 2, 3, 4, 5, 6, 7, 8].map((total, index) => day(`2026-09-0${index + 1}`, total));
    const cells = buildHeatmapGrid(range, 26, days).flatMap((column) => column.cells);
    const level = (date: string) => cells.find((cell) => cell.date === date)?.level;

    expect([1, 2, 3, 4, 5, 6, 7, 8].map((n) => level(`2026-09-0${n}`))).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('nhãn tháng: nhãn cột đầu nhường cho nhãn đổi tháng ở cột 1–2 (tránh hai nhãn đè nhau)', () => {
    const columns = buildHeatmapGrid(range, 26, []);

    expect(columns[0]?.monthLabel).toBeNull();
    expect(columns[2]?.monthLabel).toBe('Th4');
    expect(columns[6]?.monthLabel).toBe('Th5');
  });

  it('nhãn cột đầu được giữ khi tháng kế tiếp còn cách ≥ 3 cột', () => {
    const columns = buildHeatmapGrid(heatmapRange('2026-09-15', 6), 6, []);

    expect(columns.map((column) => column.monthLabel)).toEqual(['Th8', null, null, null, 'Th9', null]);
  });
});

describe('levelThresholds / levelOf', () => {
  it('chưa có ngày nào hoạt động → không có ngưỡng, mọi ô mức 0', () => {
    expect(levelThresholds([0, 0, 0])).toBeNull();
    expect(levelOf(5, null)).toBe(0);
  });

  it('chỉ một giá trị duy nhất → mức thấp nhất có màu (1), không phải 0', () => {
    expect(levelOf(7, levelThresholds([7]))).toBe(1);
  });

  it('tổng 0 luôn là mức 0 dù có ngưỡng', () => {
    expect(levelOf(0, [2, 4, 6])).toBe(0);
  });
});

// Nhóm "bản chữ của biểu đồ" (heatmapSummary, dayDetailText, dayPartsText, activeDaysNewestFirst, fullDate) — sang `heatmap-text.test.ts`
// để mỗi file test ≤ 150 dòng (`check:file-size`); không bỏ ca nào.
