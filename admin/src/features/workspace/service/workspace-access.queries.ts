import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { AdminListInvitationsParams } from '../types/workspace-access.types';
import { workspaceAccessService } from './workspace-access.service';

export const workspaceAccessKeys = {
  summary: (workspaceId: string) => ['workspace', 'access-summary', workspaceId] as const,
  invitations: (workspaceId: string, params: AdminListInvitationsParams) =>
    ['workspace', 'invitations', workspaceId, params] as const,
};

/** Dùng chung cho trang tổng quan, tab thành viên và tab kênh — cùng key nên chỉ MỘT lượt gọi. */
export const useWorkspaceAccessSummary = (workspaceId: string | undefined) =>
  useQuery({
    queryKey: workspaceAccessKeys.summary(workspaceId ?? ''),
    queryFn: () => workspaceAccessService.summary(workspaceId as string),
    enabled: !!workspaceId,
  });

/** `placeholderData: keepPreviousData` — đổi trang không nháy trắng bảng. */
export const useWorkspaceInvitations = (workspaceId: string, params: AdminListInvitationsParams) =>
  useQuery({
    queryKey: workspaceAccessKeys.invitations(workspaceId, params),
    queryFn: () => workspaceAccessService.invitations(workspaceId, params),
    placeholderData: keepPreviousData,
  });
