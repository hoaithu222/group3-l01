import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { auditLogKeys } from '@/features/audit-log';
import { showToast } from '@/shared/utils/toast.utils';

import type { AdminSkillsParams, SkillCriteria } from '../types/skill.types';
import { skillService } from './skill.service';

/** Query key admin kỹ năng (admin.md p6-06 §3). */
export const skillKeys = {
  all: ['skill'] as const,
  list: (params: AdminSkillsParams) => ['skill', 'list', params] as const,
  detail: (id: string) => ['skill', 'detail', id] as const,
  /** `criteriaHash` = JSON tiêu chí đang nhập (hoặc `saved`). */
  preview: (id: string, criteriaHash: string) => ['skill', 'preview', id, criteriaHash] as const,
  labels: (q: string) => ['skill', 'labels', q] as const,
  /** Khoá viết theo `user` để tab "Kỹ năng" của ngăn kéo người dùng làm mới cùng hồ sơ. */
  user: (userId: string) => ['skill', 'user', userId] as const,
  proof: (userId: string, skillId: string) => ['skill', 'user', userId, 'proof', skillId] as const,
};

export const useAdminSkills = (params: AdminSkillsParams) =>
  useQuery({
    queryKey: skillKeys.list(params),
    queryFn: () => skillService.list(params),
    placeholderData: keepPreviousData,
  });

export const useAdminSkill = (id: string | undefined) =>
  useQuery({
    queryKey: skillKeys.detail(id ?? ''),
    queryFn: () => skillService.get(id ?? ''),
    enabled: !!id,
    select: (res) => res.data,
  });

/** Xem trước số người đủ điều kiện — `criteria` vắng = tiêu chí đang lưu. Chỉ gọi khi đã có kỹ năng (bản mới chưa có tiến độ). */
export const useEligiblePreview = (id: string | undefined, criteria: SkillCriteria | undefined) =>
  useQuery({
    queryKey: skillKeys.preview(id ?? '', criteria ? JSON.stringify(criteria) : 'saved'),
    queryFn: () => skillService.preview(id ?? '', criteria),
    enabled: !!id,
    select: (res) => res.data,
    retry: false,
  });

export const useLabelSuggestions = (q: string, enabled: boolean) =>
  useQuery({
    queryKey: skillKeys.labels(q),
    queryFn: () => skillService.labelSuggestions(q),
    enabled,
    select: (res) => res.data,
    staleTime: 60_000,
  });

const useInvalidateSkills = () => {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: skillKeys.all });
    void qc.invalidateQueries({ queryKey: auditLogKeys.all });
  };
};

export const useCreateSkill = () => {
  const invalidate = useInvalidateSkills();
  return useMutation({
    mutationFn: skillService.create,
    onSuccess: () => {
      showToast('success', 'Đã tạo kỹ năng (đang tắt)');
      invalidate();
    },
  });
};

/** PATCH — làm mới cả khi lỗi (`RES_003` = vừa bị sửa ở nơi khác → cần `version` mới). */
export const useUpdateSkill = () => {
  const invalidate = useInvalidateSkills();
  return useMutation({
    mutationFn: skillService.update,
    onSuccess: () => showToast('success', 'Đã lưu kỹ năng và ghi nhật ký'),
    onSettled: invalidate,
  });
};

export const useSetSkillActive = () => {
  const invalidate = useInvalidateSkills();
  return useMutation({
    mutationFn: skillService.setActive,
    onSuccess: (_r, vars) =>
      showToast(
        'success',
        vars.active ? 'Đã bật kỹ năng — đang cấp cho người đủ điều kiện' : 'Đã tắt kỹ năng',
      ),
    onSettled: invalidate,
  });
};

export const useReevaluateSkills = () =>
  useMutation({
    mutationFn: skillService.reevaluate,
    onSuccess: (res) =>
      showToast(
        'success',
        `Đã xếp đánh giá lại ${res.data.skills} kỹ năng đang bật (job ${res.data.jobId})`,
      ),
  });

export const useUserSkills = (userId: string) =>
  useQuery({
    queryKey: skillKeys.user(userId),
    queryFn: () => skillService.userSkills(userId),
    select: (res) => res.data,
  });

export const useUserSkillProof = (userId: string, skillId: string | null) =>
  useQuery({
    queryKey: skillKeys.proof(userId, skillId ?? ''),
    queryFn: () => skillService.userProof(userId, skillId ?? ''),
    enabled: !!skillId,
    select: (res) => res.data,
  });

export const useRevokeSkillBadge = () => {
  const invalidate = useInvalidateSkills();
  return useMutation({
    mutationFn: skillService.revoke,
    onSuccess: () => showToast('success', 'Đã thu hồi huy hiệu và thông báo người dùng'),
    onSettled: invalidate,
  });
};

export const useRestoreSkillBadge = () => {
  const invalidate = useInvalidateSkills();
  return useMutation({
    mutationFn: skillService.restore,
    onSuccess: () => showToast('success', 'Đã khôi phục huy hiệu'),
    onSettled: invalidate,
  });
};
