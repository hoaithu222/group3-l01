import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { useSearchInput } from '@/shared/ui/search';
import { showToast } from '@/shared/utils/toast.utils';

import type { DocumentStatus, DocumentView } from '../api/docs.types';
import { useArchiveDocument, useUnarchiveDocument } from '../queries/docs.mutations';
import { useDocuments, useWorkspaceDocsAccess } from '../queries/docs.queries';
import { docsErrorMessage } from '../utils/docs-errors';
import { docEditorHref, docHistoryHref, docShareHref } from '../utils/docs-routes';
import { useDocumentsSocket } from './useDocumentsSocket';
import { useSheetTarget } from './useSheetTarget';

/**
 * Trạng thái + thao tác của màn danh sách tài liệu: bộ lọc (tìm chạy ở SERVER, debounce 300 ms bằng `useSearchInput` — ô tìm giữ UNCONTROLLED nên
 * không mất dấu khi gõ Telex), tab Đang dùng/Lưu trữ, dữ liệu phân trang, đồng bộ socket, và các thao tác từ menu "⋯" của từng hàng.
 * Lưu trữ cần xác nhận (Dialog); khôi phục thì làm ngay.
 */
export function useDocumentList(wsId: string) {
  const search = useSearchInput();
  const [status, setStatus] = useState<DocumentStatus>('ACTIVE');
  const filter = useMemo(() => ({ q: search.value.trim(), status }), [search.value, status]);

  const query = useDocuments(wsId, filter);
  const access = useWorkspaceDocsAccess(wsId);
  useDocumentsSocket(wsId);
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

  const archive = useArchiveDocument();
  const unarchive = useUnarchiveDocument();

  const [creating, setCreating] = useState(false);
  const menu = useSheetTarget<DocumentView>();
  const rename = useSheetTarget<DocumentView>();
  const archiveTarget = useSheetTarget<DocumentView>();

  const confirmArchive = () => {
    const doc = archiveTarget.target;
    if (!doc) return;
    archive.mutate(doc.id, {
      onError: (error) => showToast('error', docsErrorMessage(error)),
      onSettled: archiveTarget.close,
      onSuccess: () => showToast('success', 'Đã lưu trữ tài liệu'),
    });
  };

  const restore = (doc: DocumentView) =>
    unarchive.mutate(doc.id, {
      onError: (error) => showToast('error', docsErrorMessage(error)),
      onSuccess: () => showToast('success', 'Đã khôi phục tài liệu'),
    });

  return {
    access: access.data,
    archive: { ...archiveTarget, confirm: confirmArchive, pending: archive.isPending },
    creating,
    filter,
    items,
    menu,
    open: (doc: DocumentView) => router.push(docEditorHref(wsId, doc.id)),
    openCreated: (docId: string) => router.push(docEditorHref(wsId, docId)),
    openHistory: (doc: DocumentView) => router.push(docHistoryHref(wsId, doc.id)),
    openShare: (doc: DocumentView) => router.push(docShareHref(wsId, doc.id)),
    query,
    rename,
    restore,
    search,
    setCreating,
    setStatus,
    status,
  };
}
