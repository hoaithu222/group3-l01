import type { PrintOrderStatus, PrintOrderView } from '../api/o2o.types';
import { PIN_LIVE_STATUSES } from '../constants/o2o.constants';
import {
  fileProblemCode,
  isCountingPages,
  isDraftStatus,
  isPinLive,
  isTerminalStatus,
} from '../utils/order-status';
import { settingsSummary } from '../utils/order-summary';
import { buildTimeline } from '../utils/timeline';

type Counting = Pick<PrintOrderView, 'status' | 'pages' | 'pageCountError'>;
const order = (over: Partial<Counting> = {}): Counting => ({
  status: 'DRAFT',
  pages: null,
  pageCountError: null,
  ...over,
});

describe('trạng thái đơn — khớp máy trạng thái BE', () => {
  it('kết thúc = nhận xong/từ chối/huỷ/hết hạn; nháp = DRAFT/QUOTED; PIN sống = đã gửi chưa kết thúc', () => {
    const all: PrintOrderStatus[] = [
      'DRAFT',
      'QUOTED',
      'PENDING',
      'ACCEPTED',
      'PRINTING',
      'READY',
      'PICKED_UP',
      'REJECTED',
      'CANCELLED',
      'EXPIRED',
    ];
    expect(all.filter(isTerminalStatus)).toEqual(['PICKED_UP', 'REJECTED', 'CANCELLED', 'EXPIRED']);
    expect(all.filter(isDraftStatus)).toEqual(['DRAFT', 'QUOTED']);
    expect(all.filter(isPinLive)).toEqual(['PENDING', 'ACCEPTED', 'PRINTING', 'READY']);
    expect(PIN_LIVE_STATUSES).toEqual(all.filter(isPinLive));
    // Mọi trạng thái đều thuộc đúng MỘT trong ba nhóm: nháp / PIN sống / kết thúc.
    for (const status of all) {
      const groups = [isDraftStatus(status), isPinLive(status), isTerminalStatus(status)];
      expect(groups.filter(Boolean)).toHaveLength(1);
    }
  });

  it('đang đếm trang: nháp + chưa có số trang + chưa có lỗi', () => {
    expect(isCountingPages(order())).toBe(true);
    expect(isCountingPages(order({ status: 'QUOTED' }))).toBe(true);
    expect(isCountingPages(order({ pages: 12 }))).toBe(false);
    expect(isCountingPages(order({ pageCountError: 'O2O_003' }))).toBe(false);
    expect(isCountingPages(order({ status: 'PENDING' }))).toBe(false);
  });

  it('lỗi TỆP (O2O_003/011) khác lỗi CẤU HÌNH (O2O_002/012)', () => {
    expect(fileProblemCode({ pageCountError: 'O2O_003' })).toBe('O2O_003');
    expect(fileProblemCode({ pageCountError: 'O2O_011' })).toBe('O2O_011');
    expect(fileProblemCode({ pageCountError: 'O2O_012' })).toBeNull();
    expect(fileProblemCode({ pageCountError: null })).toBeNull();
  });
});

describe('dòng thời gian đơn', () => {
  const at = '2026-09-27T01:00:00.000Z';
  const ev = (status: string, note: string | null = null) => ({ status, at, note });

  it('đơn nháp không có dòng thời gian (sự kiện DRAFT/QUOTED bị bỏ)', () => {
    expect(
      buildTimeline({ status: 'QUOTED', events: [ev('DRAFT'), ev('QUOTED', '12 trang')] }),
    ).toEqual([]);
  });

  it('đơn đang in: các bước đã qua + bước hiện tại + bước sắp tới (mờ, không giờ)', () => {
    const rows = buildTimeline({
      status: 'PRINTING',
      events: [ev('DRAFT'), ev('QUOTED'), ev('PENDING'), ev('ACCEPTED'), ev('PRINTING')],
    });
    expect(rows.map((row) => [row.state, row.label])).toEqual([
      ['done', 'Đã gửi đơn cho tiệm'],
      ['done', 'Tiệm đã nhận đơn'],
      ['current', 'Tiệm bắt đầu in'],
      ['todo', 'In xong — sẵn sàng nhận'],
      ['todo', 'Đã nhận tài liệu'],
    ]);
    expect(rows.filter((row) => row.state === 'todo').every((row) => row.at === null)).toBe(true);
  });

  it('đơn rẽ nhánh (từ chối/huỷ) dừng ở dòng kết thúc, không thêm bước sắp tới', () => {
    const rows = buildTimeline({ status: 'REJECTED', events: [ev('PENDING'), ev('REJECTED')] });
    expect(rows.map((row) => row.label)).toEqual(['Đã gửi đơn cho tiệm', 'Tiệm từ chối đơn']);
    expect(rows.at(-1)?.state).toBe('current');
  });

  it('sự kiện không đổi trạng thái (tạo PIN mới, đã thu tiền) vẫn là dòng "đã làm"', () => {
    const rows = buildTimeline({
      status: 'READY',
      events: [ev('PENDING'), ev('PIN_REGENERATED'), ev('READY')],
    });
    expect(rows.map((row) => row.label)).toContain('Đã tạo mã PIN mới');
  });
});

describe('tóm tắt cấu hình in', () => {
  it('một dòng: khổ · màu · mặt · số bản · khoảng trang · đóng gáy', () => {
    expect(
      settingsSummary({
        paper: 'A4',
        color: true,
        copies: 2,
        duplex: true,
        pageRange: '1-3,5',
        binding: false,
      }),
    ).toBe('A4 · In màu · Hai mặt · 2 bản · Trang 1-3,5');
    expect(
      settingsSummary({
        paper: 'A3',
        color: false,
        copies: 1,
        duplex: false,
        pageRange: null,
        binding: true,
      }),
    ).toBe('A3 · Đen trắng · Một mặt · 1 bản · Đóng gáy');
  });
});
