import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  documentArchivePath,
  documentPath,
  documentRestorePath,
  workspaceDocumentsPath,
  workspaceMembersPath,
  workspacePath,
} from './docs.api';
import type {
  CreateDocumentPayload,
  CursorPage,
  DocumentDetail,
  DocumentsFilter,
  DocumentView,
  MemberOption,
  UpdateDocumentPayload,
} from './docs.types';

const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const PAGE_SIZE = 20;

/**
 * Tài liệu của nhóm (be.md §4). Mọi lời gọi bật `skipErrorToast` — màn tự hiện lỗi đúng chỗ (form/tấm/khối trạng thái), nếu để
 * interceptor toast thì lỗi hiện HAI lần (toast + khối lỗi). Mã `DOC_*` dịch ở `utils/docs-errors.ts`.
 */
export const docsService = {
  /** ⚠️ Cursor: đọc `data` + `meta` ở gốc phản hồi (`ResponseUtils.cursor`) — `unwrapData` vứt `meta` nên mất `nextCursor`. */
  async list(
    wsId: string,
    filter: DocumentsFilter,
    cursor?: string,
  ): Promise<CursorPage<DocumentView>> {
    const response = await apiClient.get<{
      data: DocumentView[];
      meta?: { nextCursor?: string | null };
    }>(workspaceDocumentsPath(wsId), {
      params: { cursor, limit: PAGE_SIZE, q: filter.q || undefined, status: filter.status },
      skipErrorToast: true,
    });
    return { items: response.data.data, nextCursor: response.data.meta?.nextCursor ?? null };
  },

  async detail(docId: string): Promise<DocumentDetail> {
    return unwrapData<DocumentDetail>(
      await apiClient.get(documentPath(docId), { skipErrorToast: true }),
    );
  },

  /** `Idempotency-Key` sinh MỘT lần mỗi lượt mở tấm tạo (bấm hai lần chỉ tạo một tài liệu). */
  async create(
    wsId: string,
    payload: CreateDocumentPayload,
    idempotencyKey: string,
  ): Promise<DocumentDetail> {
    const response = await apiClient.post(workspaceDocumentsPath(wsId), payload, {
      headers: { [IDEMPOTENCY_HEADER]: idempotencyKey },
      skipErrorToast: true,
    });
    return unwrapData<DocumentDetail>(response);
  },

  async update(docId: string, payload: UpdateDocumentPayload): Promise<DocumentDetail> {
    return unwrapData<DocumentDetail>(
      await apiClient.patch(documentPath(docId), payload, { skipErrorToast: true }),
    );
  },

  async archive(docId: string): Promise<DocumentDetail> {
    return unwrapData<DocumentDetail>(
      await apiClient.post(documentArchivePath(docId), {}, { skipErrorToast: true }),
    );
  },

  async unarchive(docId: string): Promise<DocumentDetail> {
    return unwrapData<DocumentDetail>(
      await apiClient.post(documentRestorePath(docId), {}, { skipErrorToast: true }),
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

  /** Thành viên (không phải khách, không phải mình) để mời làm cộng tác viên — tối đa 100 (trần `listMembersQuerySchema`). */
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
