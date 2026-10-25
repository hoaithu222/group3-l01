import { render, screen, userEvent, within } from '@testing-library/react-native';

import type { AccountNotificationPreference } from '@/core/notifications';

import { ConversationModesCard } from '../components/ConversationModesCard';
import { BASE_PREFERENCE } from './notification.fixtures';

/**
 * p1-07 `app.md` §3 `NotificationSettingsScreen`: chế độ theo loại cuộc trò chuyện ở cấp tài khoản. Mặc định BE:
 * 1-1 Mọi tin · nhóm/kênh Chỉ nhắc tên (README §2). Tin 1-1 KHÔNG có "Chỉ nhắc tên".
 */

async function renderCard(
  data: AccountNotificationPreference = BASE_PREFERENCE,
  disabled = false,
) {
  const onChange = jest.fn();
  await render(<ConversationModesCard data={data} disabled={disabled} onChange={onChange} />);
  return { onChange };
}

// Khung `RadioGroup` không `accessible` nên tra theo nhãn, không theo role.
const group = (name: string) => screen.getByLabelText(name);

describe('ConversationModesCard', () => {
  it('hiện giá trị HIỆU LỰC theo từng loại và nhãn "Mặc định" khi người dùng chưa chọn', async () => {
    await renderCard();

    expect(within(group('Tin nhắn 1-1')).getByRole('radio', { checked: true })).toHaveAccessibleName('Mọi tin');
    expect(within(group('Nhóm chat')).getByRole('radio', { checked: true })).toHaveAccessibleName('Chỉ nhắc tên');
    expect(within(group('Kênh')).getByRole('radio', { checked: true })).toHaveAccessibleName('Chỉ nhắc tên & luồng');
    expect(screen.getAllByText('Mặc định')).toHaveLength(3);
  });

  it('tin 1-1 chỉ có Mọi tin / Tắt — không có "nhắc tên"', async () => {
    await renderCard();
    const direct = within(group('Tin nhắn 1-1'));
    expect(direct.getAllByRole('radio')).toHaveLength(2);
    expect(direct.queryByText('Chỉ nhắc tên')).toBeNull();
  });

  it('đã chọn riêng thì hết nhãn "Mặc định" của loại đó', async () => {
    await renderCard({
      ...BASE_PREFERENCE,
      groupMode: 'ALL',
      isDefault: { ...BASE_PREFERENCE.isDefault, groupMode: false },
    });
    expect(screen.getAllByText('Mặc định')).toHaveLength(2);
  });

  it('chọn chế độ → onChange đúng khoá và giá trị enum của BE (MENTIONS_AND_THREADS, MUTED)', async () => {
    const { onChange } = await renderCard();

    await userEvent.press(within(group('Nhóm chat')).getByText('Mọi tin'));
    expect(onChange).toHaveBeenLastCalledWith({ groupMode: 'ALL' });

    await userEvent.press(within(group('Kênh')).getByText('Tắt'));
    expect(onChange).toHaveBeenLastCalledWith({ channelMode: 'MUTED' });

    await userEvent.press(within(group('Tin nhắn 1-1')).getByText('Tắt'));
    expect(onChange).toHaveBeenLastCalledWith({ directMode: 'MUTED' });
  });

  it('bấm lại chế độ đang chọn → không gọi onChange (tránh PUT thừa)', async () => {
    const { onChange } = await renderCard();

    await userEvent.press(within(group('Tin nhắn 1-1')).getByText('Mọi tin'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('mất mạng (disabled) → chọn chế độ không gọi onChange', async () => {
    const { onChange } = await renderCard(BASE_PREFERENCE, true);

    await userEvent.press(within(group('Kênh')).getByText('Tắt'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('âm thanh trong ứng dụng: công tắc gửi { sound }', async () => {
    const { onChange } = await renderCard();
    await userEvent.press(screen.getByRole('switch', { name: 'Âm thanh trong ứng dụng' }));
    expect(onChange).toHaveBeenLastCalledWith({ sound: false });
  });

  it('nói rõ tắt tiếng vẫn giữ mục nhắc đến bạn trong Hoạt động', async () => {
    await renderCard();
    expect(screen.getByText(/mục nhắc đến bạn vẫn nằm trong Hoạt động/)).toBeOnTheScreen();
  });
});
