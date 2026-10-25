/**
 * Đồ dùng chung cho các bài kiểm tab `wallet` của workspace (p6-04 admin.md §4):
 * fixture theo ĐÚNG hợp đồng `WalletStatsView` và hàm dựng response MSW.
 *
 * Tệp `.tsx` không phải `*.test.*` nên vitest không chạy nó như bài kiểm.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { HttpResponse } from 'msw';
import type { ReactElement } from 'react';

import type { WalletStatsView } from '@/features/workspace/types/workspace-wallet.types';

export const WALLET_STATS: WalletStatsView = {
  enabled: true,
  reminder: {
    enabled: true,
    cronText: 'Thứ Sáu 09:00 Asia/Ho_Chi_Minh',
    targetType: 'CHANNEL',
    targetChannelName: 'chi-tieu-chung',
  },
  last30d: {
    expensesCount: 12,
    confirmedSettlements: 7,
    staleSettlements: 2,
    debtorsCount: 5,
    spendBand: '2M_10M',
  },
};

/** Ghép nhanh một biến thể của `WALLET_STATS` mà không sửa bản gốc. */
export function makeStats(
  overrides: {
    enabled?: boolean;
    reminder?: Partial<WalletStatsView['reminder']>;
    last30d?: Partial<WalletStatsView['last30d']>;
  } = {},
): WalletStatsView {
  return {
    enabled: overrides.enabled ?? WALLET_STATS.enabled,
    reminder: { ...WALLET_STATS.reminder, ...overrides.reminder },
    last30d: { ...WALLET_STATS.last30d, ...overrides.last30d },
  };
}

export const okBody = (data: unknown) => HttpResponse.json({ success: true, data });

export const errorBody = (status: number, code: string, message: string) =>
  HttpResponse.json({ success: false, error: { code, message } }, { status });

export function renderWithQuery(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}
