import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  workspaceArchivePath,
  workspaceLeavePath,
  workspaceMembersPath,
  workspaceMePath,
  workspaceOverviewPath,
  workspacePath,
  workspaceRestorePath,
  workspaceTransferOwnerPath,
  WORKSPACES_ENDPOINTS,
} from './workspaces.api';
import type {
  ArchiveWorkspacePayload,
  CreateWorkspacePayload,
  CreateWorkspaceResponse,
  TransferOwnerCandidate,
  TransferOwnerPayload,
  WorkspaceDetail,
  WorkspaceListItem,
  WorkspaceMePayload,
  WorkspaceMeSettings,
  WorkspaceOverview,
  UpdateWorkspacePayload,
} from './workspaces.types';

export type WorkspaceListStatus = 'ACTIVE' | 'ARCHIVED' | 'ALL';

export const workspacesService = {
  async list(status: WorkspaceListStatus = 'ACTIVE'): Promise<WorkspaceListItem[]> {
    const response = await apiClient.get<WorkspaceListItem[]>(WORKSPACES_ENDPOINTS.LIST, {
      params: { status },
    });
    return unwrapData<WorkspaceListItem[]>(response);
  },

  async get(workspaceId: string): Promise<WorkspaceDetail> {
    const response = await apiClient.get<WorkspaceDetail>(workspacePath(workspaceId));
    return unwrapData<WorkspaceDetail>(response);
  },

  async overview(workspaceId: string): Promise<WorkspaceOverview> {
    const response = await apiClient.get<WorkspaceOverview>(workspaceOverviewPath(workspaceId));
    return unwrapData<WorkspaceOverview>(response);
  },

  /** `idempotencyKey` bắt buộc — xem `useIdempotencyKey` (app.md §3). ⚠️ BE lưu cả phản hồi 4xx theo khoá 24 giờ. */
  async create(
    payload: CreateWorkspacePayload,
    idempotencyKey: string,
  ): Promise<CreateWorkspaceResponse> {
    const response = await apiClient.post<CreateWorkspaceResponse>(
      WORKSPACES_ENDPOINTS.CREATE,
      payload,
      {
        headers: { 'Idempotency-Key': idempotencyKey },
        // Tạo nhóm KÈM MẪU (p5-04): màn tự xử lý `TPL_001`/`CFG_005` (quay về "Không dùng mẫu") nên không toast chồng lên.
        skipErrorToast: payload.templateCode !== undefined,
      },
    );
    return unwrapData<CreateWorkspaceResponse>(response);
  },

  async update(workspaceId: string, payload: UpdateWorkspacePayload): Promise<WorkspaceDetail> {
    const response = await apiClient.patch<WorkspaceDetail>(workspacePath(workspaceId), payload);
    return unwrapData<WorkspaceDetail>(response);
  },

  async updateMe(workspaceId: string, payload: WorkspaceMePayload): Promise<WorkspaceMeSettings> {
    const response = await apiClient.patch<WorkspaceMeSettings>(
      workspaceMePath(workspaceId),
      payload,
    );
    return unwrapData<WorkspaceMeSettings>(response);
  },

  async archive(workspaceId: string, payload: ArchiveWorkspacePayload): Promise<WorkspaceDetail> {
    const response = await apiClient.post<WorkspaceDetail>(
      workspaceArchivePath(workspaceId),
      payload,
    );
    return unwrapData<WorkspaceDetail>(response);
  },

  async restore(workspaceId: string, expectedVersion: number): Promise<WorkspaceDetail> {
    const response = await apiClient.post<WorkspaceDetail>(workspaceRestorePath(workspaceId), {
      expectedVersion,
    });
    return unwrapData<WorkspaceDetail>(response);
  },

  async transferOwner(
    workspaceId: string,
    payload: TransferOwnerPayload,
  ): Promise<{ workspace: WorkspaceDetail; previousOwnerRole: 'ADMIN' }> {
    const response = await apiClient.post<{ workspace: WorkspaceDetail; previousOwnerRole: 'ADMIN' }>(
      workspaceTransferOwnerPath(workspaceId),
      payload,
    );
    return unwrapData(response);
  },

  async leave(workspaceId: string): Promise<void> {
    await apiClient.post(workspaceLeavePath(workspaceId));
  },

  /**
   * Người có thể NHẬN quyền chủ nhóm: thành viên ACTIVE, không phải chính mình
   * và không phải OWNER (BE trả `WS_003` cho cả hai ca — chặn sớm để không bày ra
   * lựa chọn chắc chắn lỗi). Đọc `response.data.data` chứ không qua `unwrapData`:
   * cùng lý do `membersService.list` (endpoint này có kèm `meta` phân trang).
   * `limit` 100 là trần `listMembersQuerySchema`; nhóm lớn hơn thì người dùng tìm
   * bằng `q` (BE lọc không dấu).
   */
  async listTransferCandidates(workspaceId: string, q?: string): Promise<TransferOwnerCandidate[]> {
    const response = await apiClient.get<{ data: TransferOwnerCandidate[] }>(workspaceMembersPath(workspaceId), {
      params: { status: 'ACTIVE', q: q || undefined, sort: 'name', page: 1, limit: 100 },
    });
    return response.data.data.filter((member) => !member.isMe && member.role !== 'OWNER');
  },
};
