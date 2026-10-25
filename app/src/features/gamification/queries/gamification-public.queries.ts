import { useQuery } from '@tanstack/react-query';

import { useFeature } from '@/shell/capabilities';

import { gamificationService } from '../api/gamification.service';
import { gamificationKeys } from './gamification.keys';

/**
 * Hồ sơ công khai (cấp, chuỗi, huy hiệu trưng bày) của người CHUNG nhóm — chỉ chạy khi cờ `gamification` bật và có
 * `userId`. `retry: false`: 404 là câu trả lời có nghĩa (không chung nhóm / người đó tắt hiển thị), thử lại vô ích.
 */
export function usePublicGamification(userId: string | null) {
  const enabled = useFeature('gamification') === true && userId !== null;
  return useQuery({
    enabled,
    queryFn: () => gamificationService.publicProfile(userId ?? ''),
    queryKey: gamificationKeys.publicProfile(userId ?? ''),
    retry: false,
    staleTime: 60_000,
  });
}
