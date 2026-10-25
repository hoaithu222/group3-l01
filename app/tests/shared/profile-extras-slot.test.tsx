import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ProfileExtrasSlot, registerProfileExtrasRenderer } from '@/shared/profile';

/**
 * Khe nối phần mở rộng vào thẻ hồ sơ màn Tôi (p4-03 cấp độ + chuỗi ngày): `features/me` không import feature khác nên
 * feature nguồn đăng ký một renderer ở nơi lắp ráp, `MeScreen` chỉ vẽ `<ProfileExtrasSlot />`.
 */
afterEach(() => registerProfileExtrasRenderer(null));

describe('ProfileExtrasSlot', () => {
  it('chưa đăng ký (test, cờ tắt) ⇒ không vẽ gì, thẻ hồ sơ giữ nguyên hình dạng', async () => {
    await render(<ProfileExtrasSlot />);

    expect(screen.toJSON()).toBeNull();
  });

  it('đăng ký renderer ⇒ vẽ đúng nội dung renderer trả về', async () => {
    registerProfileExtrasRenderer(() => <Text>Cấp 3 · chuỗi 5 ngày</Text>);
    await render(<ProfileExtrasSlot />);

    expect(screen.getByText('Cấp 3 · chuỗi 5 ngày')).toBeOnTheScreen();
  });

  it('gỡ đăng ký (null) ⇒ quay về không vẽ gì', async () => {
    registerProfileExtrasRenderer(() => <Text>Có</Text>);
    registerProfileExtrasRenderer(null);
    await render(<ProfileExtrasSlot />);

    expect(screen.toJSON()).toBeNull();
  });
});
