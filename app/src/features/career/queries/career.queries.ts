import { useQuery } from '@tanstack/react-query';

import { careerService } from '../api/career.service';
import { careerKeys } from './career.keys';

const FIVE_MINUTES = 5 * 60_000;

/** Danh mục kỹ năng đang bật + tiến độ của tôi (`staleTime` 5 phút — socket `skill:unlocked` làm mới khi có huy hiệu mới). */
export function useSkills() {
  return useQuery({ queryFn: careerService.skills, queryKey: careerKeys.skills(), staleTime: FIVE_MINUTES });
}

/** Chi tiết một kỹ năng; 404 ⇒ `isError` (màn hiện "Kỹ năng không còn"), không thử lại. */
export function useSkill(skillId: string) {
  return useQuery({
    enabled: skillId.length > 0,
    queryFn: () => careerService.skill(skillId),
    queryKey: careerKeys.skill(skillId),
    retry: false,
  });
}

export function useMySkills() {
  return useQuery({ queryFn: careerService.mySkills, queryKey: careerKeys.mySkills() });
}

/** Huy hiệu người khác — 404 = "không chia sẻ" (trạng thái bình thường, không phải lỗi mạng) ⇒ không thử lại. */
export function useUserSkills(userId: string) {
  return useQuery({
    enabled: userId.length > 0,
    queryFn: () => careerService.userSkills(userId),
    queryKey: careerKeys.userSkills(userId),
    retry: false,
  });
}

/** Minh chứng — chỉ tải khi tấm đang mở (`skillId` khác null). */
export function useSkillProof(userId: string, skillId: string | null) {
  return useQuery({
    enabled: userId.length > 0 && skillId !== null,
    queryFn: () => careerService.proof(userId, skillId ?? ''),
    queryKey: careerKeys.proof(userId, skillId ?? ''),
    retry: false,
  });
}

export function useMyCareer() {
  return useQuery({ queryFn: careerService.myCareer, queryKey: careerKeys.me() });
}
