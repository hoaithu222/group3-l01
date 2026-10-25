import { QueryClient, type InfiniteData } from '@tanstack/react-query';

import type {
  CursorPage,
  DocumentDetail,
  DocumentUpdatedPayload,
  DocumentView,
} from '../api/docs.types';
import { docsKeys } from '../queries/docs.keys';
import { applyDocumentUpdate, patchDocumentPages } from '../utils/documents-cache';

/**
 * `document:updated` (socket) → cache: vá tại chỗ khi `version` mới hơn, gỡ khỏi danh sách khi đổi trạng thái (lưu trữ ↔ đang dùng),
 * tải lại khi tài liệu chưa có trong danh sách (mới/vừa được mời), bỏ qua sự kiện tới trễ.
 */
const doc = (over: Partial<DocumentView> = {}): DocumentView => ({
  createdAt: '2026-09-27T00:00:00.000Z',
  createdBy: 'u1',
  id: 'd1',
  lastEditedAt: null,
  lastEditedBy: null,
  myRole: 'CREATOR',
  status: 'ACTIVE',
  title: 'Báo cáo',
  updatedAt: '2026-09-27T00:00:00.000Z',
  version: 3,
  visibility: 'WORKSPACE',
  wordCount: 0,
  workspaceId: 'ws1',
  yjsVersion: 0,
  ...over,
});
const pages = (...items: DocumentView[]): InfiniteData<CursorPage<DocumentView>> => ({
  pageParams: [undefined],
  pages: [{ items, nextCursor: null }],
});
const event = (over: Partial<DocumentUpdatedPayload> = {}): DocumentUpdatedPayload => ({
  id: 'd1',
  lastEditedAt: '2026-09-27T10:00:00.000Z',
  status: 'ACTIVE',
  title: 'Báo cáo tuần 3',
  version: 4,
  visibility: 'PRIVATE',
  workspaceId: 'ws1',
  ...over,
});
const ACTIVE = { q: '', status: 'ACTIVE' } as const;

describe('patchDocumentPages', () => {
  it('có trong danh sách và mới hơn → vá tiêu đề/chế độ/phiên bản', () => {
    const outcome = patchDocumentPages(pages(doc()), event(), ACTIVE);
    expect(outcome.kind).toBe('patched');
    if (outcome.kind !== 'patched') return;
    expect(outcome.data.pages[0]?.items[0]).toMatchObject({
      lastEditedAt: '2026-09-27T10:00:00.000Z',
      title: 'Báo cáo tuần 3',
      version: 4,
      visibility: 'PRIVATE',
    });
  });

  it('sự kiện cũ hơn (tới trễ) → giữ nguyên hàng', () => {
    const outcome = patchDocumentPages(pages(doc({ version: 9 })), event({ version: 4 }), ACTIVE);
    expect(outcome.kind === 'patched' && outcome.data.pages[0]?.items[0]?.version).toBe(9);
  });

  it('lưu trữ → GỠ khỏi danh sách "Đang dùng"', () => {
    const outcome = patchDocumentPages(pages(doc()), event({ status: 'ARCHIVED' }), ACTIVE);
    expect(outcome.kind === 'patched' && outcome.data.pages[0]?.items).toEqual([]);
  });

  it('chưa có trong danh sách: khớp bộ lọc → stale (tải lại); khác bộ lọc → không đổi', () => {
    expect(patchDocumentPages(pages(), event(), ACTIVE).kind).toBe('stale');
    expect(patchDocumentPages(pages(), event({ status: 'ARCHIVED' }), ACTIVE).kind).toBe(
      'unchanged',
    );
    expect(patchDocumentPages(undefined, event(), ACTIVE).kind).toBe('unchanged');
  });
});

describe('applyDocumentUpdate', () => {
  it('vá mọi danh sách của nhóm, không đụng danh sách nhóm khác; chi tiết mới hơn thì làm mới', () => {
    const qc = new QueryClient();
    qc.setQueryData(docsKeys.list('ws1', ACTIVE), pages(doc()));
    qc.setQueryData(docsKeys.list('ws2', ACTIVE), pages(doc({ workspaceId: 'ws2' })));
    qc.setQueryData(docsKeys.detail('d1'), { version: 3 } as DocumentDetail);
    const invalidate = jest.spyOn(qc, 'invalidateQueries');

    applyDocumentUpdate(qc, event());

    const ws1 = qc.getQueryData<InfiniteData<CursorPage<DocumentView>>>(
      docsKeys.list('ws1', ACTIVE),
    );
    const ws2 = qc.getQueryData<InfiniteData<CursorPage<DocumentView>>>(
      docsKeys.list('ws2', ACTIVE),
    );
    expect(ws1?.pages[0]?.items[0]?.title).toBe('Báo cáo tuần 3');
    expect(ws2?.pages[0]?.items[0]?.title).toBe('Báo cáo');
    expect(invalidate).toHaveBeenCalledWith({ exact: true, queryKey: docsKeys.detail('d1') });
  });
});
