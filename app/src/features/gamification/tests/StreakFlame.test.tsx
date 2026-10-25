import { render, screen } from '@testing-library/react-native';

import { StreakFlame } from '../components/StreakFlame';

/**
 * app.md p4-03 §2/§7: `StreakFlame` — số ngày bằng CHỮ; gợi ý "Sắp mất chuỗi" CHỈ khi server báo `streakAtRisk` VÀ đã sau
 * 20:00 (giờ máy) VÀ đang có chuỗi.
 */

it('có chuỗi, an toàn ⇒ chỉ "Chuỗi N ngày"', async () => {
  await render(<StreakFlame hour={21} profile={{ streak: 5, streakAtRisk: false }} />);

  expect(screen.getByText('Chuỗi 5 ngày')).toBeOnTheScreen();
  expect(screen.queryByText(/Sắp mất chuỗi/)).toBeNull();
});

it('có nguy cơ + sau 20:00 ⇒ hiện "Sắp mất chuỗi" và đọc trong nhãn trợ năng', async () => {
  await render(<StreakFlame hour={20} profile={{ streak: 5, streakAtRisk: true }} />);

  expect(screen.getByText('· Sắp mất chuỗi')).toBeOnTheScreen();
  expect(screen.getByLabelText('Chuỗi 5 ngày, sắp mất chuỗi')).toBeOnTheScreen();
});

it('có nguy cơ nhưng CHƯA tới 20:00 ⇒ chưa nhắc (không ép dùng app)', async () => {
  await render(<StreakFlame hour={14} profile={{ streak: 5, streakAtRisk: true }} />);

  expect(screen.queryByText(/Sắp mất chuỗi/)).toBeNull();
});

it('chưa có chuỗi (0 ngày) ⇒ không nhắc mất chuỗi dù server báo nguy cơ', async () => {
  await render(<StreakFlame hour={22} profile={{ streak: 0, streakAtRisk: true }} />);

  expect(screen.getByText('Chuỗi 0 ngày')).toBeOnTheScreen();
  expect(screen.queryByText(/Sắp mất chuỗi/)).toBeNull();
});
