import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';
import { parseCollabGrant, type CollabGrant } from '@/shared/collab';

import {
  assetUrlPath,
  documentAssetsPath,
  documentCollaboratorPath,
  documentCollaboratorsPath,
  documentCollabTokenPath,
  documentSnapshotPath,
  documentSnapshotRestorePath,
  documentSnapshotsPath,
} from './docs.api';
import type {
  Collaborator,
  CollaboratorRole,
  CursorPage,
  RestoreResult,
  SnapshotDetail,
  SnapshotView,
} from './docs.types';

/** Lỗi khi phản hồi `collab-token` sai hình dạng (BE đổi hợp đồng) — KHÔNG mang nội dung phản hồi (nó chứa token). */
export class CollabGrantError extends Error {
  constructor() {
    super('Phản hồi collab-token không hợp lệ');
    this.name = 'CollabGrantError';
  }
}

/** Mã kết nối cộng tác, người cộng tác, bản lưu, gắn ảnh (be.md §4). Mọi lời gọi bật `skipErrorToast` — xem `docs.service.ts`. */
export const docsCollabService = {
  /**
   * `POST /documents/:id/collab-token` → token 5 phút + `url` + `documentName` + `mode`. BE trả `Cache-Control: no-store` và giới hạn 30
   * lần/phút/người. ⚠️ Mỗi lời gọi là một lượt cấp MỚI — ai gọi (WebView nối lại, bridge `requestToken`, hẹn giờ) cũng đi qua
   * `CollabTokenProvider` để dồn lượt trùng.
   */
  async issueToken(docId: string): Promise<CollabGrant> {
    const response = await apiClient.post(
      documentCollabTokenPath(docId),
      {},
      { skipErrorToast: true },
    );
    const grant = parseCollabGrant(unwrapData<unknown>(response));
    if (!grant) throw new CollabGrantError();
    return grant;
  },

  async collaborators(docId: string): Promise<Collaborator[]> {
    return unwrapData<Collaborator[]>(
      await apiClient.get(documentCollaboratorsPath(docId), { skipErrorToast: true }),
    );
  },

  /** Thêm hoặc ĐỔI VAI (upsert theo `userId`) — trả danh sách mới. Tối đa 20 người mỗi lượt (BE). */
  async addCollaborators(
    docId: string,
    userIds: string[],
    role: CollaboratorRole,
  ): Promise<Collaborator[]> {
    return unwrapData<Collaborator[]>(
      await apiClient.post(
        documentCollaboratorsPath(docId),
        { role, userIds },
        { skipErrorToast: true },
      ),
    );
  },

  async removeCollaborator(docId: string, userId: string): Promise<void> {
    await apiClient.delete(documentCollaboratorPath(docId, userId), { skipErrorToast: true });
  },

  /** Gắn ảnh đã tải lên (scope `DOC`, READY, của chính mình) vào tài liệu để MỌI người đọc lấy được URL ký — cần quyền sửa. */
  async attachAsset(docId: string, assetId: string): Promise<void> {
    await apiClient.post(documentAssetsPath(docId), { assetId }, { skipErrorToast: true });
  },

  /** `GET /assets/:id/url` — URL ký cho node ảnh (WebView xin qua bridge `resolveAssetUrl`). Lỗi để nơi gọi đổi thành `not-found`/`forbidden`/`failed`. */
  async assetUrl(assetId: string): Promise<{ expiresAt: string; url: string }> {
    return unwrapData<{ expiresAt: string; url: string }>(
      await apiClient.get(assetUrlPath(assetId), {
        params: { variant: 'ORIGINAL' },
        skipErrorToast: true,
      }),
    );
  },

  async snapshots(docId: string, cursor?: string): Promise<CursorPage<SnapshotView>> {
    const response = await apiClient.get<{
      data: SnapshotView[];
      meta?: { nextCursor?: string | null };
    }>(documentSnapshotsPath(docId), { params: { cursor, limit: 20 }, skipErrorToast: true });
    return { items: response.data.data, nextCursor: response.data.meta?.nextCursor ?? null };
  },

  async snapshot(docId: string, snapshotId: string): Promise<SnapshotDetail> {
    return unwrapData<SnapshotDetail>(
      await apiClient.get(documentSnapshotPath(docId, snapshotId), { skipErrorToast: true }),
    );
  },

  async createSnapshot(docId: string, label: string | undefined): Promise<SnapshotView> {
    return unwrapData<SnapshotView>(
      await apiClient.post(documentSnapshotsPath(docId), { label }, { skipErrorToast: true }),
    );
  },

  /** `expectedVersion` = `version` metadata đang thấy; lệch → 409 `RES_003` (màn tải lại rồi báo "Tài liệu vừa thay đổi"). */
  async restoreSnapshot(
    docId: string,
    snapshotId: string,
    expectedVersion: number,
  ): Promise<RestoreResult> {
    return unwrapData<RestoreResult>(
      await apiClient.post(
        documentSnapshotRestorePath(docId, snapshotId),
        { expectedVersion },
        { skipErrorToast: true },
      ),
    );
  },
};
