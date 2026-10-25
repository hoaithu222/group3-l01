import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';
import { includesSearch } from '@/shared/utils/format/string.utils';

import {
  DISCOVERY_ENDPOINTS,
  messagePinPath,
  scopeMembersPath,
  scopePinsPath,
  scopeSearchPath,
} from './discovery.api';
import type {
  DiscoveryScope,
  PinsMeta,
  PinsPage,
  PinnedItem,
  SavedItem,
  SavedListParams,
  SavedPage,
  ScopeMember,
  ScopeSearchParams,
  SearchHit,
  SearchMeta,
  SearchPage,
  WorkspaceOption,
} from './discovery.types';

type ScopeRef = Pick<DiscoveryScope, 'scopeId' | 'scopeType'>;

/** Mỗi dòng danh bạ (kênh lẫn hội thoại) có ba trường app cần; các trường còn lại (vai trò, hiện diện) bỏ qua. */
interface MemberRow {
  userId: string;
  name: string;
  avatarUrl?: string | null;
}

const toMember = ({ userId, name, avatarUrl }: MemberRow): ScopeMember => ({
  userId,
  name,
  avatarUrl: avatarUrl ?? null,
});

/**
 * ⛔ Các danh sách cursor ĐỌC `response.data.data` + `response.data.meta` trực tiếp, KHÔNG `unwrapData`: BE trả
 * `{ success, data: [...], meta }` ở gốc thân phản hồi, `unwrapData` bóc `.data` và VỨT `meta` — `getNextPageParam`
 * sau đó đọc `meta.hasMore` trên một mảng trần và nổ (cùng bẫy `chatService.list`).
 *
 * Tìm/ghim dùng `skipErrorToast`: lỗi (`SRCH_*`, 404, 429) hiện TẠI CHỖ trong màn, không toast trùng.
 */
export const discoveryService = {
  async listSaved(params: SavedListParams): Promise<SavedPage> {
    const response = await apiClient.get<{ data: SavedItem[]; meta: SavedPage['meta'] }>(
      DISCOVERY_ENDPOINTS.SAVED,
      {
        params,
        skipErrorToast: true,
      },
    );
    return { data: response.data.data, meta: response.data.meta };
  },

  async listWorkspaces(): Promise<WorkspaceOption[]> {
    const response = await apiClient.get<WorkspaceOption[]>(DISCOVERY_ENDPOINTS.WORKSPACES, {
      params: { status: 'ACTIVE' },
      skipErrorToast: true,
    });
    return unwrapData<WorkspaceOption[]>(response).map(({ id, name }) => ({ id, name }));
  },

  /** `limit` mặc định 30 ≥ trần ghim (20/10) nên thường đủ một trang; vẫn phân trang theo `cursor` cho đúng hợp đồng. */
  async listPins(scope: ScopeRef, cursor?: string): Promise<PinsPage> {
    const response = await apiClient.get<{ data: PinnedItem[]; meta: PinsMeta }>(
      scopePinsPath(scope),
      {
        params: { cursor },
        skipErrorToast: true,
      },
    );
    return { data: response.data.data, meta: response.data.meta };
  },

  /** `DELETE /messages/:id/pin` (p1-04) — quyền gỡ do BE kiểm; nút chỉ hiện khi `myPermissions.canPin`. Lỗi để interceptor toast. */
  async unpin(messageId: string): Promise<void> {
    await apiClient.delete(messagePinPath(messageId));
  },

  async search(
    scope: ScopeRef,
    params: ScopeSearchParams & { cursor?: string; limit?: number },
  ): Promise<SearchPage> {
    const response = await apiClient.get<{ data: SearchHit[]; meta: SearchMeta }>(
      scopeSearchPath(scope),
      {
        params,
        skipErrorToast: true,
      },
    );
    return { data: response.data.data, meta: response.data.meta };
  },

  /**
   * Danh bạ người gửi: kênh lọc THEO SERVER (`q`, tìm trong cả kênh lớn); hội thoại (≤ 200 người, DTO không có `q`)
   * kéo một trang 100 rồi lọc client bằng `includesSearch` (bỏ dấu).
   */
  async listMembers(scope: ScopeRef, q: string): Promise<ScopeMember[]> {
    const isChannel = scope.scopeType === 'CHANNEL';
    const response = await apiClient.get<{ data: MemberRow[] }>(scopeMembersPath(scope), {
      params: isChannel ? { page: 1, limit: 100, q: q || undefined } : { limit: 100 },
      skipErrorToast: true,
    });
    const members = response.data.data.map(toMember);
    return isChannel || !q ? members : members.filter((member) => includesSearch(member.name, q));
  },
};
