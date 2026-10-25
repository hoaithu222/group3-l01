import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { whiteboardCollabService } from '../api/whiteboard-collab.service';
import { whiteboardService } from '../api/whiteboard.service';
import type {
  CollaboratorRole,
  CreateWhiteboardPayload,
  UpdateWhiteboardPayload,
  WhiteboardDetail,
} from '../api/whiteboard.types';
import { whiteboardKeys } from './whiteboard.keys';

/** Metadata đổi (tạo, đổi tên, visibility, lưu trữ/khôi phục): ghi bản mới vào chi tiết + làm mới MỌI danh sách của nhóm. */
function syncWhiteboard(qc: QueryClient, board: WhiteboardDetail): void {
  qc.setQueryData(whiteboardKeys.detail(board.id), board);
  void qc.invalidateQueries({ queryKey: whiteboardKeys.listsOf(board.workspaceId) });
}

export function useCreateWhiteboard(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { idempotencyKey: string; payload: CreateWhiteboardPayload }) =>
      whiteboardService.create(wsId, vars.payload, vars.idempotencyKey),
    onSuccess: (board) => syncWhiteboard(qc, board),
  });
}

/** Đổi tên/visibility. `expectedVersion` do nơi gọi truyền (đọc từ chi tiết đang hiển thị); lệch → 409 `RES_003`. */
export function useUpdateWhiteboard(wbId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateWhiteboardPayload) => whiteboardService.update(wbId, payload),
    onError: () => void qc.invalidateQueries({ queryKey: whiteboardKeys.detail(wbId) }),
    onSuccess: (board) => syncWhiteboard(qc, board),
  });
}

/** Lưu trữ / khôi phục nhận `wbId` khi gọi (không gắn lúc dựng hook) — danh sách dùng CHUNG một hook cho mọi hàng. Cần quyền `manage`. */
export function useArchiveWhiteboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (wbId: string) => whiteboardService.archive(wbId),
    onSuccess: (board) => syncWhiteboard(qc, board),
  });
}

export function useUnarchiveWhiteboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (wbId: string) => whiteboardService.unarchive(wbId),
    onSuccess: (board) => syncWhiteboard(qc, board),
  });
}

/** Thêm HOẶC đổi vai (BE upsert) — trả danh sách mới nên ghi thẳng vào cache, khỏi gọi lại. */
export function useAddCollaborators(wbId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { role: CollaboratorRole; userIds: string[] }) =>
      whiteboardCollabService.addCollaborators(wbId, vars.userIds, vars.role),
    onSuccess: (list) => qc.setQueryData(whiteboardKeys.collaborators(wbId), list),
  });
}

export function useRemoveCollaborator(wbId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => whiteboardCollabService.removeCollaborator(wbId, userId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: whiteboardKeys.collaborators(wbId) }),
  });
}

/** Lưu phiên bản thủ công (nhãn tuỳ chọn ≤ 100 ký tự). BE ép collab lưu state đang sống TRƯỚC khi chụp. */
export function useCreateSnapshot(wbId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (label: string | undefined) => whiteboardCollabService.createSnapshot(wbId, label),
    onSuccess: () => void qc.invalidateQueries({ queryKey: whiteboardKeys.snapshots(wbId) }),
  });
}

/**
 * Khôi phục một bản: gửi `expectedVersion` của METADATA đang thấy. Thành công hay 409 đều tải lại chi tiết + danh sách bản lưu (BE vừa thêm bản
 * `PRE_RESTORE`, `version` đã tăng; 409 = ai đó đổi bảng xen giữa — nơi gọi báo "Bảng vừa thay đổi"). Nội dung mới tới các máy đang mở qua
 * collab (thông báo `RESTORED`), không qua React Query.
 */
export function useRestoreSnapshot(wbId: string) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: whiteboardKeys.detail(wbId) });
    void qc.invalidateQueries({ queryKey: whiteboardKeys.snapshots(wbId) });
  };
  return useMutation({
    mutationFn: (vars: { expectedVersion: number; snapshotId: string }) =>
      whiteboardCollabService.restoreSnapshot(wbId, vars.snapshotId, vars.expectedVersion),
    onError: refresh,
    onSuccess: refresh,
  });
}
