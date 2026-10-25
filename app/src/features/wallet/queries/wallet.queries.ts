import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import {
  expensesService,
  paymentProfilesService,
  settlementsService,
  walletService,
  type ExpenseFilter,
  type SettlementFilter,
} from '../api';
import { RECENT_EXPENSES_COUNT } from '../constants/wallet.constants';
import { walletKeys } from './wallet.keys';

/** Cài đặt ví — cũng là phép thử quyền: 404 = GUEST/không phải thành viên/cờ `wallet` tắt. */
export function useWalletSettings(wsId: string | undefined) {
  return useQuery({
    queryKey: walletKeys.settings(wsId ?? ''),
    queryFn: () => walletService.getSettings(wsId as string),
    enabled: Boolean(wsId),
    staleTime: 30_000,
    // 404 là câu trả lời dứt khoát (không có quyền), thử lại chỉ làm màn "không xem được" chậm hiện.
    retry: false,
  });
}

/** `staleTime` 15 s (app.md §4): số dư đổi theo người KHÁC nên không giữ lâu; socket lo phần tức thời. */
export function useWalletSummary(wsId: string | undefined) {
  return useQuery({
    queryKey: walletKeys.summary(wsId ?? ''),
    queryFn: () => walletService.summary(wsId as string),
    enabled: Boolean(wsId),
    staleTime: 15_000,
  });
}

export function useExpenses(wsId: string | undefined, filter: ExpenseFilter) {
  return useInfiniteQuery({
    queryKey: walletKeys.expenses(wsId ?? '', filter),
    queryFn: ({ pageParam }) => expensesService.list(wsId as string, filter, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined,
    enabled: Boolean(wsId),
    staleTime: 30_000,
  });
}

/** "5 khoản chi gần nhất" của dashboard — một trang nhỏ, không infinite. */
export function useRecentExpenses(wsId: string | undefined) {
  return useQuery({
    queryKey: walletKeys.recentExpenses(wsId ?? ''),
    queryFn: async () =>
      (await expensesService.list(wsId as string, {}, undefined, RECENT_EXPENSES_COUNT)).items,
    enabled: Boolean(wsId),
    staleTime: 30_000,
  });
}

export function useExpense(wsId: string | undefined, expenseId: string | undefined) {
  return useQuery({
    queryKey: walletKeys.expense(wsId ?? '', expenseId ?? ''),
    queryFn: () => expensesService.get(expenseId as string),
    enabled: Boolean(wsId && expenseId),
    staleTime: 15_000,
  });
}

export function useSettlements(wsId: string | undefined, filter: SettlementFilter) {
  return useInfiniteQuery({
    queryKey: walletKeys.settlements(wsId ?? '', filter),
    queryFn: ({ pageParam }) => settlementsService.list(wsId as string, filter, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined,
    enabled: Boolean(wsId),
    staleTime: 30_000,
  });
}

/** Chờ xác nhận có tôi liên quan (gửi hoặc nhận) — dashboard lọc tiếp theo `toId`/`fromId`. */
export function usePendingSettlements(wsId: string | undefined) {
  return useQuery({
    queryKey: walletKeys.pendingSettlements(wsId ?? ''),
    queryFn: async () =>
      (
        await settlementsService.list(
          wsId as string,
          { status: 'PENDING', mine: true },
          undefined,
          30,
        )
      ).items,
    enabled: Boolean(wsId),
    staleTime: 15_000,
  });
}

/**
 * Tài khoản người nhận (SỐ ĐẦY ĐỦ) cho QR.
 *
 * ⛔ `gcTime: 0` — rời màn Trả nợ là bỏ khỏi bộ nhớ ngay, không nằm lại cache 5 phút
 * của `queryClient` mặc định. Ứng dụng KHÔNG persist React Query (không có
 * `persistQueryClient`), nên "không ghi đĩa" đúng theo cấu trúc; nếu về sau ai bật
 * persist thì khoá `payee` PHẢI bị loại khỏi `dehydrate` (xem `walletKeys.payee`).
 * `retry: false`: 404 là trạng thái bình thường ("chưa thêm tài khoản"/"không nợ").
 */
export function usePaymentInfo(
  wsId: string | undefined,
  userId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: walletKeys.payee(wsId ?? '', userId ?? ''),
    queryFn: () => settlementsService.paymentInfo(wsId as string, userId as string),
    enabled: enabled && Boolean(wsId && userId),
    gcTime: 0,
    staleTime: 0,
    retry: false,
  });
}

export function usePaymentProfiles() {
  return useQuery({
    queryKey: walletKeys.paymentProfiles,
    queryFn: () => paymentProfilesService.list(),
    staleTime: 60_000,
  });
}
