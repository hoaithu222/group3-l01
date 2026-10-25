import { render, screen } from '@testing-library/react-native';

import { LockedBadge } from '../../../components/status/LockedBadge';
import { networkQualityLabel } from '../../../components/status/network-quality.utils';
import { NetworkQualityBadge } from '../../../components/status/NetworkQualityBadge';
import type { ConnectionQuality } from '../../../media/meeting-media.types';

/** Huy hiệu trạng thái (app.md §3.2 `LockedBadge`, `NetworkQualityBadge`): CHỮ theo trạng thái, ẩn khi không có gì đáng báo. */
describe('NetworkQualityBadge', () => {
  it.each([
    ['excellent', null],
    ['good', null],
    ['unknown', null],
    ['poor', 'Mạng yếu'],
    ['lost', 'Mạng mất'],
  ] as [ConnectionQuality, string | null][])('chất lượng %s → %s', (quality, label) => {
    expect(networkQualityLabel(quality)).toBe(label);
  });

  it('mạng tốt/không rõ → không vẽ gì', async () => {
    const good = await render(<NetworkQualityBadge quality="good" />);
    expect(good.toJSON()).toBeNull();
    await good.unmount();

    const unknown = await render(<NetworkQualityBadge quality="unknown" />);
    expect(unknown.toJSON()).toBeNull();
  });

  it('yếu → chữ "Mạng yếu" với nhãn trợ năng nói rõ là mạng của MÌNH', async () => {
    await render(<NetworkQualityBadge quality="poor" />);

    expect(screen.getByText('Mạng yếu')).toBeOnTheScreen();
    expect(screen.getByLabelText('Mạng của bạn đang yếu')).toBeOnTheScreen();
  });

  it('mất → chữ "Mạng mất" với nhãn "Mất kết nối mạng"', async () => {
    await render(<NetworkQualityBadge quality="lost" />);

    expect(screen.getByText('Mạng mất')).toBeOnTheScreen();
    expect(screen.getByLabelText('Mất kết nối mạng')).toBeOnTheScreen();
  });
});

describe('LockedBadge', () => {
  it('"Đã khoá" kèm nhãn nói hệ quả (người mới không vào được)', async () => {
    await render(<LockedBadge />);

    expect(screen.getByText('Đã khoá')).toBeOnTheScreen();
    expect(screen.getByLabelText('Cuộc họp đã khoá, người mới không vào được')).toBeOnTheScreen();
  });
});
