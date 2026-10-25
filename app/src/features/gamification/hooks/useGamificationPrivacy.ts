import { useMutation, useQueryClient } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';
import { useAuthStore } from '@/shell/store/slices/auth';

import { gamificationService } from '../api/gamification.service';
import type { GamificationPrivacyPatch } from '../api/gamification.types';
import { gamificationKeys } from '../queries/gamification.keys';
import { gamificationErrorMessage } from '../utils/level-math';

/** Mặc định của BE khi `User.privacy` chưa từng ghi (p0-01): mọi công tắc bật. */
const DEFAULT_PRIVACY = { readReceipts: true, showPresence: true } as const;

/**
 * `null`/thiếu ⇒ `true` (đúng hợp đồng "null = mặc định" của BE). Đọc qua `Record` vì kiểu `AuthUser.privacy` (p0-01,
 * ngoài feature này) mới khai hai công tắc `readReceipts`/`showPresence`, trong khi payload thật đã có cả bốn.
 */
function flag(privacy: object | null | undefined, key: keyof GamificationPrivacyPatch): boolean {
  const value = privacy ? (privacy as Record<string, unknown>)[key] : undefined;
  return value !== false;
}

/**
 * Hai công tắc riêng tư của gamification (app.md p4-03 §3 `Privacy`): "Hiện tôi trong bảng xếp hạng nhóm"
 * (`showInLeaderboard`) và "Cho thành viên nhóm xem cấp độ và huy hiệu" (`showGamification`). Nguồn giá trị là
 * `user.privacy` trong store phiên (cùng chỗ với `PrivacySettingsCard` của p0-01) — đổi lạc quan, lỗi thì trả về giá trị
 * cũ + toast; thành công thì làm mới các bảng xếp hạng đã cache (BE xoá đệm của chúng ngay khi đổi — GM-10).
 */
export function useGamificationPrivacy() {
  const privacy = useAuthStore((state) => state.user?.privacy);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (patch: GamificationPrivacyPatch) => gamificationService.updatePrivacy(patch),
    onMutate: (patch) => {
      const { setAuth, user } = useAuthStore.getState();
      const previous = user?.privacy ?? null;
      if (user)
        setAuth({ user: { ...user, privacy: { ...(user.privacy ?? DEFAULT_PRIVACY), ...patch } } });
      return { previous };
    },
    onError: (error, _patch, context) => {
      const { setAuth, user } = useAuthStore.getState();
      if (user && context) setAuth({ user: { ...user, privacy: context.previous } });
      showToast(
        'error',
        gamificationErrorMessage(error, 'Chưa lưu được cài đặt riêng tư, thử lại'),
      );
    },
    onSuccess: (saved) => {
      const { setAuth, user } = useAuthStore.getState();
      if (user) setAuth({ user: { ...user, privacy: saved } });
      void queryClient.invalidateQueries({ queryKey: gamificationKeys.leaderboards() });
    },
  });

  return {
    isPending: mutation.isPending,
    showGamification: flag(privacy, 'showGamification'),
    showInLeaderboard: flag(privacy, 'showInLeaderboard'),
    update: mutation.mutate,
  };
}
