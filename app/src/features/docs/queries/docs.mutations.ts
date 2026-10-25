import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { docsCollabService } from '../api/docs-collab.service';
import { docsService } from '../api/docs.service';
import type {
  CollaboratorRole,
  CreateDocumentPayload,
  DocumentDetail,
  UpdateDocumentPayload,
} from '../api/docs.types';
import { docsKeys } from './docs.keys';

/** Metadata đổi (tạo, đổi tên, visibility, lưu trữ/khôi phục): ghi bản mới vào chi tiết + làm mới MỌI danh sách của nhóm. */
function syncDocument(qc: QueryClient, doc: DocumentDetail): void {
  qc.setQueryData(docsKeys.detail(doc.id), doc);
  void qc.invalidateQueries({ queryKey: docsKeys.listsOf(doc.workspaceId) });
}

export function useCreateDocument(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { idempotencyKey: string; payload: CreateDocumentPayload }) =>
      docsService.create(wsId, vars.payload, vars.idempotencyKey),
    onSuccess: (doc) => syncDocument(qc, doc),
  });
}

/** Đổi tên/visibility. `expectedVersion` do nơi gọi truyền (đọc từ chi tiết đang hiển thị); lệch → 409 `RES_003`. */
export function useUpdateDocument(docId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateDocumentPayload) => docsService.update(docId, payload),
    onError: () => void qc.invalidateQueries({ queryKey: docsKeys.detail(docId) }),
    onSuccess: (doc) => syncDocument(qc, doc),
  });
}

/** Lưu trữ / khôi phục nhận `docId` khi gọi (không gắn lúc dựng hook) — danh sách dùng CHUNG một hook cho mọi hàng. Cần quyền `manage`. */
export function useArchiveDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (docId: string) => docsService.archive(docId),
    onSuccess: (doc) => syncDocument(qc, doc),
  });
}

export function useUnarchiveDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (docId: string) => docsService.unarchive(docId),
    onSuccess: (doc) => syncDocument(qc, doc),
  });
}

/** Thêm HOẶC đổi vai (BE upsert) — trả danh sách mới nên ghi thẳng vào cache, khỏi gọi lại. */
export function useAddCollaborators(docId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { role: CollaboratorRole; userIds: string[] }) =>
      docsCollabService.addCollaborators(docId, vars.userIds, vars.role),
    onSuccess: (list) => qc.setQueryData(docsKeys.collaborators(docId), list),
  });
}

export function useRemoveCollaborator(docId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => docsCollabService.removeCollaborator(docId, userId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: docsKeys.collaborators(docId) }),
  });
}

/** Lưu phiên bản thủ công (nhãn tuỳ chọn ≤ 100 ký tự). BE ép collab lưu state đang sống TRƯỚC khi chụp. */
export function useCreateSnapshot(docId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (label: string | undefined) => docsCollabService.createSnapshot(docId, label),
    onSuccess: () => void qc.invalidateQueries({ queryKey: docsKeys.snapshots(docId) }),
  });
}

/**
 * Khôi phục một bản: gửi `expectedVersion` của METADATA đang thấy. Thành công hay 409 đều tải lại chi tiết + danh sách bản lưu
 * (BE vừa thêm bản `PRE_RESTORE`, `version` đã tăng; 409 = ai đó đổi tài liệu xen giữa — nơi gọi báo "Tài liệu vừa thay đổi").
 * Nội dung mới tới các máy đang mở qua collab (`RESTORED`), không qua React Query.
 */
export function useRestoreSnapshot(docId: string) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: docsKeys.detail(docId) });
    void qc.invalidateQueries({ queryKey: docsKeys.snapshots(docId) });
  };
  return useMutation({
    mutationFn: (vars: { expectedVersion: number; snapshotId: string }) =>
      docsCollabService.restoreSnapshot(docId, vars.snapshotId, vars.expectedVersion),
    onError: refresh,
    onSuccess: refresh,
  });
}
