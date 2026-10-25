import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  MY_CAREER_PATH,
  MY_CAREER_VISIBILITY_PATH,
  MY_SKILLS_PATH,
  SKILLS_PATH,
  skillPath,
  skillProofPath,
  userSkillsPath,
} from './career.api';
import type { CareerProfile, CareerVisibility, SkillBadge, SkillCatalogItem, SkillProof } from './career.types';

/** Huy hiệu kỹ năng xác thực + quyền riêng tư nghề nghiệp (p6-06). */
export const careerService = {
  async skills(): Promise<SkillCatalogItem[]> {
    return unwrapData<SkillCatalogItem[]>(await apiClient.get(SKILLS_PATH));
  },

  /** 404 "Kỹ năng không còn" ⇒ màn tự hiện trạng thái, không toast. */
  async skill(skillId: string): Promise<SkillCatalogItem> {
    return unwrapData<SkillCatalogItem>(await apiClient.get(skillPath(skillId), { skipErrorToast: true }));
  },

  async mySkills(): Promise<SkillBadge[]> {
    return unwrapData<SkillBadge[]>(await apiClient.get(MY_SKILLS_PATH));
  },

  /** 404 trung tính (không cùng nhóm / người đó không chia sẻ) ⇒ màn hiện "Không chia sẻ huy hiệu", KHÔNG toast. */
  async userSkills(userId: string): Promise<SkillBadge[]> {
    return unwrapData<SkillBadge[]>(await apiClient.get(userSkillsPath(userId), { skipErrorToast: true }));
  },

  /** Tiêu đề task/tên nhóm đã được SERVER lọc theo người xem (CR-26). Lỗi ⇒ tấm minh chứng tự báo. */
  async proof(userId: string, skillId: string): Promise<SkillProof> {
    return unwrapData<SkillProof>(await apiClient.get(skillProofPath(userId, skillId), { skipErrorToast: true }));
  },

  async myCareer(): Promise<CareerProfile> {
    return unwrapData<CareerProfile>(await apiClient.get(MY_CAREER_PATH));
  },

  /** Lỗi do nơi gọi xử lý (rollback + toast) ⇒ `skipErrorToast`. */
  async updateVisibility(visibility: CareerVisibility): Promise<CareerProfile> {
    return unwrapData<CareerProfile>(await apiClient.put(MY_CAREER_VISIBILITY_PATH, visibility, { skipErrorToast: true }));
  },
};
