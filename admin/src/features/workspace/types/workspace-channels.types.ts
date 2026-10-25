/**
 * Kiểu dữ liệu tab `channels` — khớp `AdminChannelRow` phía BE
 * (`be/src/modules/channels/entities/channel.interface.ts`, p1-03 be.md §4,
 * mở rộng thêm `isDefault`/`archiveReason` + `meta` phân trang server sau khi
 * phát hiện `toAdminChannelRow()`/controller ban đầu bỏ sót 2 việc này —
 * xem README p1-03 §10).
 */

export type ChannelTypeValue = 'TEXT' | 'VOICE' | 'POMODORO';
export type PostingPolicyValue = 'MEMBERS' | 'ADMINS_ONLY';
export type ChannelStatusValue = 'ACTIVE' | 'ARCHIVED';
export type ChannelArchiveReasonValue = 'MANUAL' | 'NO_MANAGER' | 'PLATFORM';

export interface AdminChannelRow {
  id: string;
  name: string;
  type: ChannelTypeValue;
  postingPolicy: PostingPolicyValue;
  status: ChannelStatusValue;
  isDefault: boolean;
  archiveReason: ChannelArchiveReasonValue | null;
  memberCount: number;
  /** Số tin nhắn của kênh trong 7 ngày gần nhất (BE `countMessages7d` đếm `Message` theo `scopeId`). */
  messages7d: number;
  createdAt: string;
}

/** `GET /admin/workspaces/:workspaceId/channels` — `validateQuery(paginationSchema)`, chỉ `page`/`limit` (không `status`/`type`/`sort` server-side như p1-02's `AdminListMembersParams`). */
export interface AdminChannelListParams {
  page: number;
  limit: number;
}

export interface AdminChannelListMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AdminChannelListResult {
  public: AdminChannelRow[];
  privateCount: number;
  privateArchivedCount: number;
  meta: AdminChannelListMeta;
}

export interface ChannelActionPayload {
  channelId: string;
  reason: string;
}
