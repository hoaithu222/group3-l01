import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  whiteboardArchivePath,
  whiteboardPath,
  whiteboardRestorePath,
  workspaceMembersPath,
  workspacePath,
  workspaceWhiteboardsPath,
} from './whiteboard.api';
import type {
  CreateWhiteboardPayload,
  CursorPage,
  MemberOption,
  UpdateWhiteboardPayload,
  WhiteboardDetail,
  WhiteboardsFilter,
  WhiteboardView,
} from './whiteboard.types';

const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const PAGE_SIZE = 20;

/**
 * Bảng trắng của nhóm (be.md §4). Mọi lời gọi bật `skipErrorToast` — màn tự hiện lỗi đúng chỗ (form/tấm/khối trạng thái), nếu để interceptor
 * toast thì lỗi hiện HAI lần (toast + khối lỗi). Mã `WB_*` dịch ở `utils/whiteboard-errors.ts`.
 */
export const whiteboardService = {
  /** ⚠️ Cursor: đọc `data` + `meta` ở gốc phản hồi (`ResponseUtils.cursor`) — `unwrapData` vứt `meta` nên mất `nextCursor`. */
  async list(
    wsId: string,
    filter: WhiteboardsFilter,
    cursor?: string,
  ): Promise<CursorPage<WhiteboardView>> {
    const response = await apiClient.get<{
      data: WhiteboardView[];
      meta?: { nextCursor?: string | null };
    }>(workspaceWhiteboardsPath(wsId), {
      params: { cursor, limit: PAGE_SIZE, q: filter.q || undefined, status: filter.status },
      skipErrorToast: true,
    });
    return { items: response.data.data, nextCursor: response.data.meta?.nextCursor ?? null };
  },

  async detail(wbId: string): Promise<WhiteboardDetail> {
    return unwrapData<WhiteboardDetail>(
      await apiClient.get(whiteboardPath(wbId), { skipErrorToast: true }),
    );
  },

  /** `Idempotency-Key` sinh MỘT lần mỗi lượt mở tấm tạo (bấm hai lần chỉ tạo một bảng). */
  async create(
    wsId: string,
    payload: CreateWhiteboardPayload,
    idempotencyKey: string,
  ): Promise<WhiteboardDetail> {
    const response = await apiClient.post(workspaceWhiteboardsPath(wsId), payload, {
      headers: { [IDEMPOTENCY_HEADER]: idempotencyKey },
      skipErrorToast: true,
    });
    return unwrapData<WhiteboardDetail>(response);
  },

  async update(wbId: string, payload: UpdateWhiteboardPayload): Promise<WhiteboardDetail> {
    return unwrapData<WhiteboardDetail>(
      await apiClient.patch(whiteboardPath(wbId), payload, { skipErrorToast: true }),
    );
  },

  async archive(wbId: string): Promise<WhiteboardDetail> {
    return unwrapData<WhiteboardDetail>(
      await apiClient.post(whiteboardArchivePath(wbId), {}, { skipErrorToast: true }),
    );
  },

  async unarchive(wbId: string): Promise<WhiteboardDetail> {
    return unwrapData<WhiteboardDetail>(
      await apiClient.post(whiteboardRestorePath(wbId), {}, { skipErrorToast: true }),
    );
  },

  /** Vai của mình + trạng thái nhóm — để ẩn nút tạo với KHÁCH/nhóm đã lưu trữ (quyền thật do BE: 404/`WS_002`). */
  async workspaceAccess(
    wsId: string,
  ): Promise<{ canCreate: boolean; myRole: string; status: string }> {
    const ws = unwrapData<{ myRole: string; status: string }>(
      await apiClient.get(workspacePath(wsId), { skipErrorToast: true }),
    );
    return {
      canCreate: ws.status === 'ACTIVE' && ws.myRole !== 'GUEST',
      myRole: ws.myRole,
      status: ws.status,
    };
  },

  /** Thành viên (không phải khách, không phải mình) để mời làm cộng tác — tối đa 100 (trần `listMembersQuerySchema`). */
  async memberOptions(wsId: string): Promise<MemberOption[]> {
    const response = await apiClient.get<{
      data: { isMe: boolean; name: string; role: string; userId: string }[];
    }>(workspaceMembersPath(wsId), {
      params: { limit: 100, page: 1, sort: 'name', status: 'ACTIVE' },
      skipErrorToast: true,
    });
    return response.data.data
      .filter((m) => !m.isMe && m.role !== 'GUEST')
      .map((m) => ({ name: m.name, role: m.role, userId: m.userId }));
  },
};
