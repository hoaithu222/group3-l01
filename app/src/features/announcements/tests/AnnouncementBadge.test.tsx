import { render, screen } from '@testing-library/react-native';

import { AnnouncementBadge } from '../components/AnnouncementBadge';
import { resolveStatus } from '../utils/announcement-status';

/**
 * Huy hiệu (app.md p5-04 §3): "Cần xác nhận" · "Đã xác nhận" · "Đã hết hạn" — trạng thái nằm ở CHỮ (+ biểu tượng), không chỉ ở
 * màu. NativeWind không biên dịch trong Jest nên test kiểm chữ/hành vi, không kiểm style.
 */
describe('AnnouncementBadge', () => {
  it.each([
    ['pending', 'Cần xác nhận'],
    ['confirmed', 'Đã xác nhận'],
    ['expired', 'Đã hết hạn'],
  ] as const)('%s → "%s"', async (status, label) => {
    await render(<AnnouncementBadge status={status} />);

    expect(screen.getByText(label)).toBeOnTheScreen();
  });

  it('mỗi trạng thái chỉ hiện đúng MỘT nhãn (không lẫn nhãn của trạng thái khác)', async () => {
    await render(<AnnouncementBadge status="confirmed" />);

    expect(screen.queryByText('Cần xác nhận')).toBeNull();
    expect(screen.queryByText('Đã hết hạn')).toBeNull();
  });
});

describe('resolveStatus', () => {
  it('chưa xác nhận + còn hạn → cần xác nhận; quá hạn → đã hết hạn', () => {
    expect(resolveStatus({ confirmedByMe: false }, false)).toBe('pending');
    expect(resolveStatus({ confirmedByMe: false }, true)).toBe('expired');
  });

  it('đã xác nhận THẮNG hết hạn: người đã bấm vẫn thấy "Đã xác nhận" sau khi quá hạn', () => {
    expect(resolveStatus({ confirmedByMe: true }, false)).toBe('confirmed');
    expect(resolveStatus({ confirmedByMe: true }, true)).toBe('confirmed');
  });
});
