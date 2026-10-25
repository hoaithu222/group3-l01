import { useQuery } from '@tanstack/react-query';

import { studyService } from '../api/study.service';
import { studyKeys } from './study.keys';

/**
 * `myRole`/`status` của nhóm — quyết định "Tạo bộ cho nhóm" (nhóm ARCHIVED chỉ xem) và ẩn lối vào với GUEST (BE 404
 * mọi bộ học của nhóm với khách, README p4-01 §6). `enabled` để hub nhóm không gọi khi cờ `study` tắt.
 */
export function useWorkspaceStudyAccess(workspaceId: string, enabled = true) {
  return useQuery({
    queryKey: studyKeys.workspaceAccess(workspaceId),
    queryFn: () => studyService.workspaceAccess(workspaceId),
    enabled: enabled && Boolean(workspaceId),
    retry: false,
    staleTime: 30_000,
  });
}
