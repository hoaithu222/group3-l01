import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  expensesService,
  type AdjustExpensePayload,
  type CreateExpensePayload,
  type UpdateExpensePayload,
} from '../api';
import { walletKeys } from './wallet.keys';

/**
 * Mutation khoản chi. ⛔ KHÔNG optimistic: tiền luôn chờ server (app.md §4) — một
 * số dư hiện sai dù chỉ vài trăm mili-giây là người dùng chuyển khoản theo số sai.
 * Thành công → làm mới CẢ cây `['wallet', wsId]` (số dư, danh sách, chi tiết).
 */
function useInvalidateWallet(wsId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: walletKeys.ws(wsId) });
}

export function useCreateExpense(wsId: string) {
  const invalidate = useInvalidateWallet(wsId);
  return useMutation({
    mutationFn: ({
      payload,
      idempotencyKey,
    }: {
      payload: CreateExpensePayload;
      idempotencyKey: string;
    }) => expensesService.create(wsId, payload, idempotencyKey),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateExpense(wsId: string, expenseId: string) {
  const invalidate = useInvalidateWallet(wsId);
  return useMutation({
    mutationFn: (payload: UpdateExpensePayload) => expensesService.update(expenseId, payload),
    onSuccess: () => invalidate(),
  });
}

/** Xoá trả HTTP 200 `data: null` (không phải 204). */
export function useDeleteExpense(wsId: string, expenseId: string) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateWallet(wsId);
  return useMutation({
    mutationFn: () => expensesService.remove(expenseId),
    onSuccess: () => {
      // Bỏ hẳn chi tiết đã xoá TRƯỚC khi làm mới, kẻo màn chi tiết đang mở refetch ra 404.
      queryClient.removeQueries({ queryKey: walletKeys.expense(wsId, expenseId) });
      return invalidate();
    },
  });
}

export function useAdjustExpense(wsId: string, expenseId: string) {
  const invalidate = useInvalidateWallet(wsId);
  return useMutation({
    mutationFn: (payload: AdjustExpensePayload) => expensesService.adjust(expenseId, payload),
    onSuccess: () => invalidate(),
  });
}
