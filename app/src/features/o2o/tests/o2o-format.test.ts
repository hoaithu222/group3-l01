import {
  formatPin,
  noiseLabel,
  openStatusText,
  pricePerPage,
  qrPayload,
  ratingSummary,
  todayHoursText,
  weekSchedule,
} from '../utils/o2o-format';
import { validatePrintFile } from '../utils/print-file';

describe('định dạng hiển thị (screen-layout.md: VND, dấu phẩy thập phân)', () => {
  it('độ ồn bằng CHỮ theo ba khoảng; chưa đánh giá → không có nhãn', () => {
    expect(noiseLabel(0)).toBeNull();
    expect(noiseLabel(1.4)).toBe('Yên tĩnh');
    expect(noiseLabel(2.4)).toBe('Yên tĩnh');
    expect(noiseLabel(3)).toBe('Vừa');
    expect(noiseLabel(3.6)).toBe('Vừa');
    expect(noiseLabel(4.2)).toBe('Ồn');
  });

  it('tóm tắt sao + độ ồn; chưa có đánh giá → "Chưa có đánh giá"', () => {
    expect(ratingSummary({ ratingAvg: 4.5, ratingCount: 12, noiseAvg: 1.8 })).toBe(
      '4,5 sao (12) · Yên tĩnh',
    );
    expect(ratingSummary({ ratingAvg: 4, ratingCount: 3, noiseAvg: 0 })).toBe('4,0 sao (3)');
    expect(ratingSummary({ ratingAvg: 0, ratingCount: 0, noiseAvg: 0 })).toBe('Chưa có đánh giá');
  });

  it('đang mở/đóng/chưa khai giờ', () => {
    expect(openStatusText(true)).toBe('Đang mở cửa');
    expect(openStatusText(false)).toBe('Đang đóng cửa');
    expect(openStatusText(null)).toBe('Chưa có giờ mở cửa');
  });

  it('giờ mở cả tuần: 7 dòng bắt đầu Thứ hai, ngày trống = "Đóng cửa", nhiều khung nối bằng phẩy', () => {
    const week = weekSchedule([
      { day: 1, open: '07:00', close: '11:00' },
      { day: 1, open: '13:00', close: '22:00' },
      { day: 0, open: '08:00', close: '20:00' },
    ]);
    expect(week).toHaveLength(7);
    expect(week[0]).toEqual({ day: 1, label: 'Thứ hai', text: '07:00 – 11:00, 13:00 – 22:00' });
    expect(week[1]?.text).toBe('Đóng cửa');
    expect(week[6]).toEqual({ day: 0, label: 'Chủ nhật', text: '08:00 – 20:00' });
  });

  it('giờ HÔM NAY theo múi giờ VN (không phải múi giờ máy)', () => {
    // 2026-09-28 (Thứ hai) 03:00 UTC = 10:00 giờ VN.
    const monday = new Date('2026-09-28T03:00:00.000Z');
    const hours = [{ day: 1, open: '07:00', close: '22:00' }];
    expect(todayHoursText(hours, monday)).toBe('07:00 – 22:00');
    // 2026-09-27 (Chủ nhật) 20:00 UTC = 03:00 Thứ hai giờ VN → vẫn là "Thứ hai".
    expect(todayHoursText(hours, new Date('2026-09-27T20:00:00.000Z'))).toBe('07:00 – 22:00');
    expect(todayHoursText(hours, new Date('2026-09-29T03:00:00.000Z'))).toBe('Hôm nay đóng cửa');
    expect(todayHoursText([], monday)).toBeNull();
  });

  it('PIN cách quãng "482 913"; QR = mãĐơn|PIN; giá dùng dấu chấm ngăn nghìn', () => {
    expect(formatPin('482913')).toBe('482 913');
    expect(formatPin('12')).toBe('12');
    expect(qrPayload('PO-7K2M9Q', '482913')).toBe('PO-7K2M9Q|482913');
    expect(pricePerPage(500)).toBe('500 VND/trang');
    expect(pricePerPage(1500)).toBe('1.500 VND/trang');
  });
});

describe('chọn tệp in — chỉ PDF ≤ 25 MB', () => {
  const pdf = { name: 'bao-cao.pdf', mime: 'application/pdf', size: 1024 };

  it('PDF hợp lệ → null; khác PDF/trống/quá lớn → câu kèm việc nên làm', () => {
    expect(validatePrintFile(pdf)).toBeNull();
    expect(
      validatePrintFile({
        ...pdf,
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    ).toMatch(/PDF/);
    expect(validatePrintFile({ ...pdf, size: 0 })).toMatch(/Tệp trống/);
    expect(validatePrintFile({ ...pdf, size: 26 * 1024 * 1024 })).toMatch(/lớn hơn/);
    expect(validatePrintFile({ ...pdf, size: 25 * 1024 * 1024 })).toBeNull();
  });
});
