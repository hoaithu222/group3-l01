import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import { coinsService } from '../api/coins.service';
import type { Quest, Wallet } from '../api/coins.types';
import { useCoinsEnabled } from '../hooks/useCoinsEnabled';
import { coinErrorCode, coinErrorMessage } from '../utils/coin-errors';
import { markQuestClaimed, patchWallet } from '../utils/coins-cache';
import { coinsKeys } from './coins.keys';

/** Nhiệm vụ HÔM NAY (ngày theo múi giờ của tôi). staleTime 30 giây; socket `EARN_EVENT` làm mới khi tiến độ đổi. */
export function useQuests() {
  const enabled = useCoinsEnabled();
  return useQuery({
    enabled,
    queryFn: () => coinsService.quests(),
    queryKey: coinsKeys.quests(),
    retry: false,
    staleTime: 30_000,
  });
}

/**
 * Nhận thưởng nhiệm vụ (bấm chủ động — BE không tự cộng). Thành công ⇒ vá số dư + đánh dấu "Đã nhận" NGAY rồi làm mới ví/lịch sử.
 * Lỗi ⇒ toast câu `COIN_*` (service đã `skipErrorToast`) và đồng bộ lại danh sách: `COIN_004` (đã nhận — hai thiết bị/hai lần bấm) và `COIN_005` (tiến độ
 * ở máy đang cũ) đều nghĩa là màn đang hiện trạng thái sai, nên tải lại nhiệm vụ để nút đổi đúng.
 */
export function useClaimQuest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (quest: Quest) => coinsService.claimQuest(quest.quest.id),
    onError: (error) => {
      showToast('error', coinErrorMessage(error));
      const code = coinErrorCode(error);
      if (code === 'COIN_004' || code === 'COIN_005') {
        void queryClient.invalidateQueries({ queryKey: coinsKeys.quests() });
      }
    },
    onSuccess: (result, quest) => {
      queryClient.setQueryData<Wallet>(coinsKeys.wallet(), (old) =>
        patchWallet(old, { balance: result.balance, earned: result.delta }),
      );
      queryClient.setQueryData<Quest[]>(coinsKeys.quests(), (old) =>
        markQuestClaimed(old, quest.quest.id),
      );
      void queryClient.invalidateQueries({ queryKey: coinsKeys.wallet() });
      void queryClient.invalidateQueries({ queryKey: coinsKeys.transactionsAll() });
    },
  });
}
