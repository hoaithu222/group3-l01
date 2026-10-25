import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { WalletReminderMessage } from '../components/WalletReminderMessage';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockedPush = jest.mocked(router.push);

function message(systemPayload: Record<string, unknown> | null) {
  return { systemPayload, systemType: 'WALLET_REMINDER' };
}

describe('WalletReminderMessage — tin nhắc nợ trong nhóm chat/kênh', () => {
  beforeEach(() => mockedPush.mockClear());

  it('hiện "N bạn còn khoản chưa thanh toán" và nút "Mở ví"', async () => {
    await render(
      <WalletReminderMessage message={message({ debtorsCount: 3, workspaceId: 'w1' })} />,
    );

    expect(screen.getByText('3 bạn còn khoản chưa thanh toán')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Mở ví' })).toBeOnTheScreen();
  });

  it('⛔ KHÔNG BAO GIỜ render số tiền — kể cả khi payload lỡ mang thêm trường tiền', async () => {
    await render(
      <WalletReminderMessage
        message={message({
          amount: 1234567,
          balances: [{ amount: 37500, userId: 'u1' }],
          debtorsCount: 2,
          totalAmount: 987654,
          workspaceId: 'w1',
        })}
      />,
    );

    expect(screen.queryByText(/1\.?234\.?567/)).toBeNull();
    expect(screen.queryByText(/37\.?500/)).toBeNull();
    expect(screen.queryByText(/987\.?654/)).toBeNull();
    expect(screen.queryByText(/VND|₫|đồng/i)).toBeNull();
    // chỉ có đúng số người
    expect(screen.getByText('2 bạn còn khoản chưa thanh toán')).toBeOnTheScreen();
  });

  it('"Mở ví" mở dashboard của ĐÚNG nhóm trong payload', async () => {
    await render(
      <WalletReminderMessage message={message({ debtorsCount: 1, workspaceId: 'ws-42' })} />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Mở ví' }));

    expect(mockedPush).toHaveBeenCalledTimes(1);
    expect(mockedPush).toHaveBeenCalledWith('/workspaces/ws-42/wallet');
  });

  it('payload thiếu/hỏng ⇒ câu chung, không crash, không có nút Mở ví trỏ vào hư vô', async () => {
    await render(<WalletReminderMessage message={message(null)} />);
    expect(screen.getByText('Nhóm còn khoản chưa thanh toán')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Mở ví' })).toBeNull();
  });

  it('debtorsCount không phải số dương ⇒ câu chung (không in "0 bạn"/"NaN bạn")', async () => {
    await render(
      <WalletReminderMessage message={message({ debtorsCount: 'nhiều', workspaceId: 'w1' })} />,
    );
    expect(screen.getByText('Nhóm còn khoản chưa thanh toán')).toBeOnTheScreen();
  });
});
