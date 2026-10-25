import { resolveWalletNotificationHref } from '../utils/wallet-routes';

describe('thông báo wallet.* → màn đích', () => {
  it('mỗi loại mở đúng màn', () => {
    expect(
      resolveWalletNotificationHref('wallet.expense-added', { expenseId: 'e1', workspaceId: 'w1' }),
    ).toEqual({
      params: { expenseId: 'e1', wsId: 'w1' },
      pathname: '/workspaces/[wsId]/wallet/expenses/[expenseId]',
    });
    expect(
      resolveWalletNotificationHref('wallet.settlement-pending', {
        settlementId: 's',
        workspaceId: 'w1',
      }),
    ).toBe('/workspaces/w1/wallet');
    expect(
      resolveWalletNotificationHref('wallet.settlement-stale', {
        settlementId: 's',
        workspaceId: 'w1',
      }),
    ).toBe('/workspaces/w1/wallet');
    expect(
      resolveWalletNotificationHref('wallet.settlement-confirmed', { workspaceId: 'w1' }),
    ).toEqual({
      params: { wsId: 'w1' },
      pathname: '/workspaces/[wsId]/wallet/history',
    });
    expect(
      resolveWalletNotificationHref('wallet.settlement-rejected', { workspaceId: 'w1' }),
    ).toEqual({
      params: { wsId: 'w1' },
      pathname: '/workspaces/[wsId]/wallet/history',
    });
    expect(resolveWalletNotificationHref('wallet.debt-reminder', { workspaceId: 'w1' })).toBe(
      '/workspaces/w1/wallet',
    );
  });

  it('khoản chi thiếu expenseId ⇒ về dashboard; thiếu workspaceId hoặc không phải wallet.* ⇒ null', () => {
    expect(resolveWalletNotificationHref('wallet.expense-added', { workspaceId: 'w1' })).toBe(
      '/workspaces/w1/wallet',
    );
    expect(resolveWalletNotificationHref('wallet.debt-reminder', {})).toBeNull();
    expect(resolveWalletNotificationHref('chat.message', { workspaceId: 'w1' })).toBeNull();
    expect(resolveWalletNotificationHref('wallet.debt-reminder', null)).toBeNull();
  });
});
