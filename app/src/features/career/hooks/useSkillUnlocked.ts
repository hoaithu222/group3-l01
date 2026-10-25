import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { SocketEvent, useSocketEvent } from '@/core/socket';
import { useFeature } from '@/shell/capabilities';
import { useAuthStore } from '@/shell/store/slices/auth';

import type { SkillUnlockedEvent } from '../api/career.types';
import { careerKeys } from '../queries/career.keys';
import { markUnlockSeen } from '../utils/unlock-seen';

/**
 * Nghe `skill:unlocked` (`user:{id}` — mọi thiết bị, app.md p6-06 §4): làm mới danh mục + huy hiệu của tôi, và trả sự kiện để tấm chúc mừng hiện
 * ĐÚNG MỘT LẦN mỗi kỹ năng (`markUnlockSeen`). Cờ `career` tắt / chưa đăng nhập ⇒ bỏ qua.
 */
export function useSkillUnlocked() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);
  const enabled = useFeature('career') === true;
  const [current, setCurrent] = useState<SkillUnlockedEvent | null>(null);

  useSocketEvent<SkillUnlockedEvent>(SocketEvent.SKILL_UNLOCKED, (event) => {
    if (!enabled || !userId || typeof event?.skillId !== 'string') return;
    void queryClient.invalidateQueries({ queryKey: careerKeys.skills() });
    void queryClient.invalidateQueries({ queryKey: careerKeys.mySkills() });
    if (markUnlockSeen(userId, event.skillId)) setCurrent(event);
  });

  return { current, dismiss: () => setCurrent(null) };
}
