import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';
import { parseCollabGrant, type CollabGrant } from '@/shared/collab';

import {
  whiteboardCollaboratorPath,
  whiteboardCollaboratorsPath,
  whiteboardCollabTokenPath,
  whiteboardSnapshotRestorePath,
  whiteboardSnapshotsPath,
} from './whiteboard.api';
import type {
  Collaborator,
  CollaboratorRole,
  CursorPage,
  RestoreResult,
  SnapshotView,
} from './whiteboard.types';

/** Lỗi khi phản hồi `collab-token` sai hình dạng (BE đổi hợp đồng) — KHÔNG mang nội dung phản hồi (nó chứa token). */
export class WhiteboardGrantError extends Error {
  constructor() {
    super('Phản hồi collab-token của bảng trắng không hợp lệ');
    this.name = 'WhiteboardGrantError';
  }
}

/** Mã kết nối cộng tác, người cộng tác, bản lưu (be.md §4). Mọi lời gọi bật `skipErrorToast` — xem `whiteboard.service.ts`. */
export const whiteboardCollabService = {
  /**
   * `POST /whiteboards/:id/collab-token` → token 5 phút + `url` + `documentName` (`wb:<id>`) + `mode` + `limits`. BE trả `Cache-Control: no-store`
   * và giới hạn 30 lần/phút/người. ⚠️ Mỗi lời gọi là một lượt cấp MỚI — ai gọi (nối lại, hẹn giờ làm mới) cũng đi qua `CollabTokenProvider` để
   * dồn lượt trùng.
   */
  async issueToken(wbId: string): Promise<CollabGrant> {
    const response = await apiClient.post(
      whiteboardCollabTokenPath(wbId),
      {},
      { skipErrorToast: true },
    );
    const grant = parseCollabGrant(unwrapData<unknown>(response), 'wb');
    if (!grant) throw new WhiteboardGrantError();
    return grant;
  },

  async collaborators(wbId: string): Promise<Collaborator[]> {
    return unwrapData<Collaborator[]>(
      await apiClient.get(whiteboardCollaboratorsPath(wbId), { skipErrorToast: true }),
    );
  },

  /** Thêm hoặc ĐỔI VAI (upsert theo `userId`) — trả danh sách mới. Tối đa 20 người mỗi lượt (BE). */
  async addCollaborators(
    wbId: string,
    userIds: string[],
    role: CollaboratorRole,
  ): Promise<Collaborator[]> {
    return unwrapData<Collaborator[]>(
      await apiClient.post(
        whiteboardCollaboratorsPath(wbId),
        { role, userIds },
        { skipErrorToast: true },
      ),
    );
  },

  async removeCollaborator(wbId: string, userId: string): Promise<void> {
    await apiClient.delete(whiteboardCollaboratorPath(wbId, userId), { skipErrorToast: true });
  },

  async snapshots(wbId: string, cursor?: string): Promise<CursorPage<SnapshotView>> {
    const response = await apiClient.get<{
      data: SnapshotView[];
      meta?: { nextCursor?: string | null };
    }>(whiteboardSnapshotsPath(wbId), { params: { cursor, limit: 20 }, skipErrorToast: true });
    return { items: response.data.data, nextCursor: response.data.meta?.nextCursor ?? null };
  },

  async createSnapshot(wbId: string, label: string | undefined): Promise<SnapshotView> {
    return unwrapData<SnapshotView>(
      await apiClient.post(whiteboardSnapshotsPath(wbId), { label }, { skipErrorToast: true }),
    );
  },

  /** `expectedVersion` = `version` metadata đang thấy; lệch → 409 `RES_003` (màn tải lại rồi báo "Bảng vừa thay đổi"). */
  async restoreSnapshot(
    wbId: string,
    snapshotId: string,
    expectedVersion: number,
  ): Promise<RestoreResult> {
    return unwrapData<RestoreResult>(
      await apiClient.post(
        whiteboardSnapshotRestorePath(wbId, snapshotId),
        { expectedVersion },
        { skipErrorToast: true },
      ),
    );
  },
};
