import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { WalletSummaryView } from '../api';
import { useWalletSocket, type WalletUpdatedPayload } from '../hooks/useWalletSocket';
import { walletKeys } from '../queries/wallet.keys';

let mockHandler: ((payload: WalletUpdatedPayload) => void) | undefined;
let mockConnect: (() => void) | undefined;

// Hook nghe HAI sự kiện (`wallet:updated` + `connect`) — tách theo tên để handler này không đè handler kia.
jest.mock('@/core/socket', () => ({
  SocketEvent: { WALLET_UPDATED: 'wallet:updated' },
  useSocketEvent: (event: string, handler: (payload: WalletUpdatedPayload) => void) => {
    if (event === 'connect') mockConnect = handler as () => void;
    else mockHandler = handler;
  },
}));

const SUMMARY: WalletSummaryView = {
  balances: [],
  currency: 'VND',
  myBalance: 0,
  suggestions: [],
  totals: { expensesThisMonth: 0, outstanding: 0 },
  walletVersion: 5,
};

function payload(overrides: Partial<WalletUpdatedPayload> = {}): WalletUpdatedPayload {
  return {
    changedUserIds: ['u1'],
    reason: 'EXPENSE',
    serverNow: '2026-09-19T00:00:00.000Z',
    v: 1,
    walletVersion: 6,
    workspaceId: 'ws1',
    ...overrides,
  };
}

async function setup(cached?: WalletSummaryView) {
  const queryClient = new QueryClient();
  if (cached) queryClient.setQueryData(walletKeys.summary('ws1'), cached);
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const view = await renderHook(() => useWalletSocket('ws1'), { wrapper });
  return { invalidate, view };
}

describe('useWalletSocket — wallet:updated', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockHandler = undefined;
    mockConnect = undefined;
  });
  afterEach(() => jest.useRealTimers());

  it('walletVersion MỚI hơn bản cache ⇒ làm mới cả cây ví SAU 500 ms (debounce), không tức thì', async () => {
    const { invalidate } = await setup(SUMMARY);

    await act(async () => {
      mockHandler?.(payload({ walletVersion: 6 }));
    });
    expect(invalidate).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(499);
    });
    expect(invalidate).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: walletKeys.ws('ws1') });
  });

  it('cùng phiên bản (sự kiện dội lại lượt ghi của CHÍNH MÌNH, đã làm mới xong) ⇒ bỏ qua', async () => {
    const { invalidate } = await setup(SUMMARY);

    await act(async () => {
      mockHandler?.(payload({ walletVersion: 5 }));
    });
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('phiên bản CŨ hơn (sự kiện tới trễ) ⇒ bỏ qua', async () => {
    const { invalidate } = await setup(SUMMARY);
    await act(async () => {
      mockHandler?.(payload({ walletVersion: 3 }));
    });
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('nhiều sự kiện dồn dập ⇒ GOM thành MỘT lượt làm mới', async () => {
    const { invalidate } = await setup(SUMMARY);

    await act(async () => {
      mockHandler?.(payload({ walletVersion: 6 }));
    });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await act(async () => {
      mockHandler?.(payload({ walletVersion: 7 }));
    });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await act(async () => {
      mockHandler?.(payload({ walletVersion: 8, reason: 'SETTLEMENT' }));
    });
    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('nhóm KHÁC (người dùng thuộc nhiều nhóm, sự kiện của mọi nhóm cùng tới) ⇒ bỏ qua', async () => {
    const { invalidate } = await setup(SUMMARY);
    await act(async () => {
      mockHandler?.(payload({ walletVersion: 99, workspaceId: 'ws-khac' }));
    });
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('chưa có bản cache nào ⇒ làm mới (không có gì để so)', async () => {
    const { invalidate } = await setup();
    await act(async () => {
      mockHandler?.(payload({ walletVersion: 1 }));
    });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('đổi CÀI ĐẶT (SETTINGS) làm mới dù walletVersion không tăng', async () => {
    const { invalidate } = await setup(SUMMARY);
    await act(async () => {
      mockHandler?.(payload({ reason: 'SETTINGS', walletVersion: 5 }));
    });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('socket NỐI LẠI (bị ngắt khi app ở nền) ⇒ làm mới cả cây ví ngay — `wallet:updated` lúc ngắt đã mất hẳn', async () => {
    const { invalidate } = await setup(SUMMARY);
    await act(async () => {
      mockConnect?.();
    });
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: walletKeys.ws('ws1') });
  });

  it('rời màn trước khi hết 500 ms ⇒ huỷ hẹn giờ, không làm mới trên màn đã đóng', async () => {
    const { invalidate, view } = await setup(SUMMARY);
    await act(async () => {
      mockHandler?.(payload({ walletVersion: 6 }));
    });

    await view.unmount();
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(invalidate).not.toHaveBeenCalled();
  });
});
