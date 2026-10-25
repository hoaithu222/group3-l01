import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  paymentProfilesService,
  settlementsService,
  walletService,
  type CreatePaymentProfilePayload,
  type CreateSettlementPayload,
  type UpdateWalletSettingsPayload,
  type WalletExportKind,
} from '../api';
import { walletKeys } from './wallet.keys';

/**
 * Mutation trả nợ · cài đặt · hồ sơ nhận tiền · nhắc nợ · xuất CSV.
 * Không optimistic (xem `expense.mutations.ts`). Thành công → làm mới `['wallet', wsId]`.
 */
function useInvalidateWallet(wsId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: walletKeys.ws(wsId) });
}

export function useCreateSettlement(wsId: string) {
  const invalidate = useInvalidateWallet(wsId);
  return useMutation({
    mutationFn: ({
      payload,
      idempotencyKey,
    }: {
      payload: CreateSettlementPayload;
      idempotencyKey: string;
    }) => settlementsService.create(wsId, payload, idempotencyKey),
    onSuccess: () => invalidate(),
  });
}

/** `WALLET_007` (409) = đã có người xử lý trước — vẫn làm mới để thẻ biến mất thay vì kẹt. */
export function useConfirmSettlement(wsId: string) {
  const invalidate = useInvalidateWallet(wsId);
  return useMutation({
    mutationFn: (settlementId: string) => settlementsService.confirm(settlementId),
    onSettled: () => invalidate(),
  });
}

export function useRejectSettlement(wsId: string) {
  const invalidate = useInvalidateWallet(wsId);
  return useMutation({
    mutationFn: ({ settlementId, reason }: { settlementId: string; reason: string }) =>
      settlementsService.reject(settlementId, reason),
    onSettled: () => invalidate(),
  });
}

export function useCancelSettlement(wsId: string) {
  const invalidate = useInvalidateWallet(wsId);
  return useMutation({
    mutationFn: (settlementId: string) => settlementsService.cancel(settlementId),
    onSettled: () => invalidate(),
  });
}

export function useUpdateWalletSettings(wsId: string) {
  const invalidate = useInvalidateWallet(wsId);
  return useMutation({
    mutationFn: (payload: UpdateWalletSettingsPayload) =>
      walletService.updateSettings(wsId, payload),
    // Lỗi xung đột version (409) cũng cần bản mới nhất để người dùng sửa tiếp trên số đúng.
    onSettled: () => invalidate(),
  });
}

export function useRemindNow(wsId: string) {
  const invalidate = useInvalidateWallet(wsId);
  return useMutation({
    mutationFn: () => walletService.remindNow(wsId),
    onSuccess: () => invalidate(),
  });
}

export function useExportWalletCsv(wsId: string) {
  return useMutation({
    mutationFn: (kind: WalletExportKind) => walletService.exportCsv(wsId, kind),
  });
}

/** Hồ sơ nhận tiền là của CHÍNH MÌNH (`['me', …]`), không thuộc một workspace nào. */
export function usePaymentProfileMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: walletKeys.paymentProfiles });

  return {
    create: useMutation({
      mutationFn: (payload: CreatePaymentProfilePayload) => paymentProfilesService.create(payload),
      onSuccess: () => refresh(),
    }),
    setDefault: useMutation({
      mutationFn: (profileId: string) => paymentProfilesService.setDefault(profileId),
      onSuccess: () => refresh(),
    }),
    remove: useMutation({
      mutationFn: (profileId: string) => paymentProfilesService.remove(profileId),
      onSuccess: () => refresh(),
    }),
  };
}
