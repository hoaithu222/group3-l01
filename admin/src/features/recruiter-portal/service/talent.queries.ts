import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { TALENT_PAGE_SIZE } from '../constants/portal.constants';
import type { TalentSearchParams } from '../types/talent.types';
import { portalKeys } from './portal.keys';
import { talentService } from './talent.service';

const SKILLS_STALE_MS = 5 * 60_000;

/**
 * Tìm ứng viên — `useInfiniteQuery` (cursor, "Tải thêm"). `enabled` PHẢI là `false` khi doanh nghiệp chưa APPROVED: BE trả `403 RECR_002` cho mọi lượt gọi đó
 * (và CR-08 đòi cổng KHÔNG gọi API ứng viên ở trạng thái đó) — trang vẽ `Callout` trạng thái thay vì để BE từ chối.
 * `retry: false`: `RECR_002`/`RECR_010` không tự khỏi khi gọi lại. Đổi bộ lọc không nháy trắng lưới (`keepPreviousData`).
 */
export const useTalentSearch = (
  companyId: string | undefined,
  filters: TalentSearchParams,
  enabled: boolean,
) =>
  useInfiniteQuery({
    queryKey: portalKeys.talent(companyId ?? '', filters),
    queryFn: ({ pageParam }) =>
      talentService.search(companyId as string, { ...filters, limit: TALENT_PAGE_SIZE }, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined),
    placeholderData: keepPreviousData,
    enabled: enabled && !!companyId,
    retry: false,
  });

/**
 * Hồ sơ ứng viên. ⚠ MỖI LẦN BE trả hồ sơ là một dòng nhật ký `talent.profile-view` và tốn một lượt trong trần 300 lượt/ngày (`RECR_010`), nên KHÔNG refetch ngầm:
 * `staleTime: Infinity` + tắt `refetchOn*` + `retry: false` nên KHÔNG có lượt gọi lại ngầm khi ngăn kéo đang mở (đổi tab trình duyệt, mạng chập chờn). `gcTime: 0`: đóng ngăn kéo là bỏ cache,
 * nên MỞ LẠI hồ sơ là một lượt xem MỚI (README: audit MỌI lượt xem) — không để cache lặng lẽ nuốt lượt xem thứ hai khỏi nhật ký.
 */
export const useTalentProfile = (
  companyId: string | undefined,
  userId: string | null,
  enabled: boolean,
) =>
  useQuery({
    queryKey: portalKeys.profile(companyId ?? '', userId ?? ''),
    queryFn: () => talentService.profile(companyId as string, userId as string),
    enabled: enabled && !!companyId && !!userId,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

/** Minh chứng một huy hiệu (`…/skills/:skillId/proof`) — cũng tính vào trần xem hồ sơ nên chỉ tải khi HR bấm "Xem minh chứng" (`enabled`). */
export const useTalentProof = (
  companyId: string | undefined,
  userId: string | null,
  skillId: string | null,
) =>
  useQuery({
    queryKey: portalKeys.proof(companyId ?? '', userId ?? '', skillId ?? ''),
    queryFn: () => talentService.proof(companyId as string, userId as string, skillId as string),
    enabled: !!companyId && !!userId && !!skillId,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });

/** Danh mục kỹ năng cho ô lọc (đổi hiếm — cache 5 phút). */
export const useSkillOptions = (enabled = true) =>
  useQuery({
    queryKey: portalKeys.skills(),
    queryFn: talentService.skills,
    staleTime: SKILLS_STALE_MS,
    enabled,
  });
