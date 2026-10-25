import type { AxiosResponse } from 'axios';

import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import type {
  AddMembersPayload,
  AddMembersResult,
  ChangeRoleResult,
  ConversationDetail,
  ConversationsPage,
  CursorMeta,
  CreateGroupPayload,
  DissolveResult,
  LeaveResult,
  ListConversationsParams,
  MediaKind,
  MediaPage,
  MeSettingsPayload,
  MembersPage,
  MyConversationState,
  PatchConversationPayload,
  PersonOption,
  ReadReceiptsResult,
  RemoveMemberResult,
  SendFirstMessagePayload,
  SentMessageResult,
  WorkspaceOption,
} from './conversations.types';

const base = (id: string) => `/conversations/${id}`;

/**
 * ⛔ Danh sách cursor KHÔNG dùng `unwrapData`: BE trả `{ data: [...], meta }` ngay ở gốc thân, `unwrapData` bóc `.data`
 * và VỨT `meta` → `getNextPageParam` đọc `last.meta.hasMore` trên mảng trần và nổ (cùng bẫy `chatService.list`).
 */
const cursorPage = <T>({ data: body }: AxiosResponse<{ data: T[]; meta: CursorMeta }>) => ({ data: body.data, meta: body.meta });

/**
 * Gọi thẳng `apiClient` theo be.md §4 — mọi path thật của module `conversations`.
 * `myWorkspaces()` gọi endpoint của `workspaces` (p1-01) TRỰC TIẾP (không import
 * feature đó, `feature-structure.md`) — cùng mẫu `channelsService.searchWorkspaceMembers`.
 */
export const conversationsService = {
  async list(params: ListConversationsParams): Promise<ConversationsPage> {
    const response = await apiClient.get<ConversationsPage>('/conversations', { params });
    return cursorPage(response);
  },

  async people(q: string, workspaceId?: string): Promise<PersonOption[]> {
    const response = await apiClient.get<PersonOption[]>('/conversations/people', { params: { q, workspaceId } });
    return unwrapData<PersonOption[]>(response);
  },

  async getDirect(userId: string): Promise<ConversationDetail> {
    const response = await apiClient.get<ConversationDetail>(`/conversations/direct/${userId}`);
    return unwrapData<ConversationDetail>(response);
  },

  async createDirect(userId: string): Promise<{ created: boolean; detail: ConversationDetail }> {
    const response = await apiClient.post<ConversationDetail>('/conversations/direct', { userId });
    return { created: response.status === 201, detail: unwrapData<ConversationDetail>(response) };
  },

  async createGroup(payload: CreateGroupPayload, idempotencyKey: string): Promise<ConversationDetail> {
    const response = await apiClient.post<ConversationDetail>('/conversations', payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    return unwrapData<ConversationDetail>(response);
  },

  async get(id: string): Promise<ConversationDetail> {
    const response = await apiClient.get<ConversationDetail>(base(id));
    return unwrapData<ConversationDetail>(response);
  },

  async patch(id: string, payload: PatchConversationPayload): Promise<ConversationDetail> {
    const response = await apiClient.patch<ConversationDetail>(base(id), payload);
    return unwrapData<ConversationDetail>(response);
  },

  async dissolve(id: string, confirmTitle: string): Promise<DissolveResult> {
    const response = await apiClient.post<DissolveResult>(`${base(id)}/dissolve`, { confirmTitle });
    return unwrapData<DissolveResult>(response);
  },

  async listMembers(id: string, params: { cursor?: string; limit?: number; role?: string }): Promise<MembersPage> {
    const response = await apiClient.get<MembersPage>(`${base(id)}/members`, { params });
    return cursorPage(response);
  },

  async addMembers(id: string, payload: AddMembersPayload): Promise<AddMembersResult> {
    const response = await apiClient.post<AddMembersResult>(`${base(id)}/members`, payload);
    return unwrapData<AddMembersResult>(response);
  },

  async changeRole(id: string, userId: string, role: 'ADMIN' | 'MEMBER'): Promise<ChangeRoleResult> {
    const response = await apiClient.patch<ChangeRoleResult>(`${base(id)}/members/${userId}`, { role });
    return unwrapData<ChangeRoleResult>(response);
  },

  async removeMember(id: string, userId: string): Promise<RemoveMemberResult> {
    const response = await apiClient.delete<RemoveMemberResult>(`${base(id)}/members/${userId}`);
    return unwrapData<RemoveMemberResult>(response);
  },

  async transferOwner(id: string, toUserId: string): Promise<ConversationDetail> {
    const response = await apiClient.post<ConversationDetail>(`${base(id)}/transfer-owner`, { toUserId });
    return unwrapData<ConversationDetail>(response);
  },

  async leave(id: string): Promise<LeaveResult> {
    const response = await apiClient.post<LeaveResult>(`${base(id)}/leave`);
    return unwrapData<LeaveResult>(response);
  },

  async updateMe(id: string, payload: MeSettingsPayload): Promise<MyConversationState> {
    const response = await apiClient.patch<MyConversationState>(`${base(id)}/me`, payload);
    return unwrapData<MyConversationState>(response);
  },

  async clear(id: string): Promise<MyConversationState> {
    const response = await apiClient.post<MyConversationState>(`${base(id)}/clear`);
    return unwrapData<MyConversationState>(response);
  },

  async readReceipts(id: string, seq: number): Promise<ReadReceiptsResult> {
    const response = await apiClient.get<ReadReceiptsResult>(`${base(id)}/read-receipts`, { params: { seq } });
    return unwrapData<ReadReceiptsResult>(response);
  },

  async media(id: string, kind: MediaKind, cursor?: string, limit?: number): Promise<MediaPage> {
    const response = await apiClient.get<MediaPage>(`${base(id)}/media`, { params: { kind, cursor, limit } });
    return cursorPage(response);
  },

  /** be.md p1-01 §4 `GET /workspaces` — chỉ lấy `id/name/avatarUrl` cho bước 1 của `CreateGroupScreen`. */
  async myWorkspaces(): Promise<WorkspaceOption[]> {
    const response = await apiClient.get<WorkspaceOption[]>('/workspaces', { params: { status: 'ACTIVE' } });
    return unwrapData<WorkspaceOption[]>(response);
  },

  /** Tin ĐẦU của `DraftDirectScreen` — alias `/conversations/:id/messages` (be.md §4), xem ghi chú ở `useDirectConversation.ts`. */
  async sendFirstMessage(id: string, payload: SendFirstMessagePayload): Promise<SentMessageResult> {
    const response = await apiClient.post<SentMessageResult>(`${base(id)}/messages`, payload);
    return unwrapData<SentMessageResult>(response);
  },
};
