/**
 * Đường dẫn endpoint Bảng trắng (p6-02 be.md §4) — nối sau `appConfig.apiBaseUrl`.
 * `grep` một lần ở đây là thấy hết mặt tiếp xúc backend của feature.
 */

export const workspaceWhiteboardsPath = (wsId: string) => `/workspaces/${wsId}/whiteboards`;
export const whiteboardPath = (wbId: string) => `/whiteboards/${wbId}`;
export const whiteboardArchivePath = (wbId: string) => `${whiteboardPath(wbId)}/archive`;
export const whiteboardRestorePath = (wbId: string) => `${whiteboardPath(wbId)}/restore`;
export const whiteboardCollabTokenPath = (wbId: string) => `${whiteboardPath(wbId)}/collab-token`;
export const whiteboardCollaboratorsPath = (wbId: string) =>
  `${whiteboardPath(wbId)}/collaborators`;
export const whiteboardCollaboratorPath = (wbId: string, userId: string) =>
  `${whiteboardCollaboratorsPath(wbId)}/${userId}`;
export const whiteboardSnapshotsPath = (wbId: string) => `${whiteboardPath(wbId)}/snapshots`;
export const whiteboardSnapshotRestorePath = (wbId: string, snapshotId: string) =>
  `${whiteboardSnapshotsPath(wbId)}/${snapshotId}/restore`;

/** Đọc từ phân hệ khác bằng endpoint của họ (không import feature khác — `feature-structure.md`). */
export const workspaceMembersPath = (wsId: string) => `/workspaces/${wsId}/members`;
export const workspacePath = (wsId: string) => `/workspaces/${wsId}`;
