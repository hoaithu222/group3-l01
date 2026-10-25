/**
 * Đường dẫn endpoint Real-time Docs (p6-01 be.md §4) — nối sau `appConfig.apiBaseUrl`.
 * `grep` một lần ở đây là thấy hết mặt tiếp xúc backend của feature.
 */

export const workspaceDocumentsPath = (wsId: string) => `/workspaces/${wsId}/documents`;
export const documentPath = (docId: string) => `/documents/${docId}`;
export const documentArchivePath = (docId: string) => `${documentPath(docId)}/archive`;
export const documentRestorePath = (docId: string) => `${documentPath(docId)}/restore`;
export const documentCollabTokenPath = (docId: string) => `${documentPath(docId)}/collab-token`;
export const documentAssetsPath = (docId: string) => `${documentPath(docId)}/assets`;
export const documentCollaboratorsPath = (docId: string) => `${documentPath(docId)}/collaborators`;
export const documentCollaboratorPath = (docId: string, userId: string) =>
  `${documentCollaboratorsPath(docId)}/${userId}`;
export const documentSnapshotsPath = (docId: string) => `${documentPath(docId)}/snapshots`;
export const documentSnapshotPath = (docId: string, snapshotId: string) =>
  `${documentSnapshotsPath(docId)}/${snapshotId}`;
export const documentSnapshotRestorePath = (docId: string, snapshotId: string) =>
  `${documentSnapshotPath(docId, snapshotId)}/restore`;

/** Đọc từ phân hệ khác bằng endpoint của họ (không import feature khác — `feature-structure.md`). */
export const workspaceMembersPath = (wsId: string) => `/workspaces/${wsId}/members`;
export const workspacePath = (wsId: string) => `/workspaces/${wsId}`;
/** URL ký (sống ≤ 60 s) của một ảnh trong tài liệu — dùng chung endpoint `assets` của `core/uploads`, gọi riêng để tự xử lý lỗi (không toast). */
export const assetUrlPath = (assetId: string) => `/assets/${assetId}/url`;
