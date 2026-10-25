import { useQuery } from '@tanstack/react-query';

import { membersService } from '../api';

/**
 * `GET /workspaces/:id/wellbeing/indicators` (p7-03 P1, be.md §4/§5 "Chia sẻ") — CHỈ tải khi người xem là OWNER/ADMIN (`enabled`, gate ở nơi
 * gọi qua `useWorkspaceAccess`/`access.canManageMembers`, cùng cờ đã dùng cho nút "Mời thành viên"). `membersService.wellbeingIndicators` đã
 * nuốt lỗi (403/404/mất mạng → mảng rỗng) — chấm cam là tiện ích phụ, không được làm hỏng màn danh sách thành viên.
 *
 * ⚠️ Khoá KHÔNG dùng chung với feature `wellbeing` (feature không import nhau) — chấp nhận cache riêng.
 */
export function useWorkspaceWellbeingIndicators(wsId: string, enabled: boolean) {
  return useQuery({
    enabled: enabled && wsId.length > 0,
    queryFn: () => membersService.wellbeingIndicators(wsId),
    queryKey: ['members', wsId, 'wellbeing-indicators'] as const,
    retry: false,
    staleTime: 5 * 60_000,
  });
}
