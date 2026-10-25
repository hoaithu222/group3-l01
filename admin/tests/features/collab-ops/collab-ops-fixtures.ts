/**
 * Đồ dùng chung cho bài kiểm `collab-ops` (p6-01 admin): fixture theo ĐÚNG hợp đồng BE
 * (`be/src/modules/documents/services/collab-admin.service.ts`). Không phải `*.test.*`.
 */
import type {
  CollabHealthView,
  CollabStatsView,
  LargeDocumentRow,
} from '@/features/collab-ops/types/collab-ops.types';

export const HEALTH_OK: CollabHealthView = {
  enabled: true,
  status: 'ok',
  detail: {
    status: 'ok',
    service: 'collab',
    version: '1.4.2',
    instance: 'collab-1',
    uptimeSeconds: 3 * 86400 + 4 * 3600 + 120,
    kinds: ['document', 'whiteboard'],
    connections: 12,
    documents: 5,
    pendingStates: 2,
    redis: 'ready',
    be: { lastOkAt: '2026-09-26T14:59:00.000Z', lastErrorAt: null },
  },
};

export const STATS_LIVE: CollabStatsView = {
  enabled: true,
  live: {
    connections: { document: 9, whiteboard: 3 },
    documents: { document: 4, whiteboard: 1 },
    pendingStates: 2,
  },
};

export function makeLargeDoc(over: Partial<LargeDocumentRow> = {}): LargeDocumentRow {
  return {
    id: '665f1c2e8a1b2c3d4e5f6a01',
    workspaceId: '665f1c2e8a1b2c3d4e5f6a02',
    workspaceName: 'Nhóm Alpha',
    title: 'Kế hoạch quý 4',
    visibility: 'WORKSPACE',
    status: 'ACTIVE',
    stateBytes: 3 * 1024 * 1024,
    snapshotCount: 14,
    lastEditedAt: '2026-09-25T08:30:00.000Z',
    ...over,
  };
}

export const LARGE_DOCS: LargeDocumentRow[] = [
  makeLargeDoc(),
  makeLargeDoc({
    id: '665f1c2e8a1b2c3d4e5f6a03',
    // BE che tiêu đề tài liệu PRIVATE (`title: null`) — bài kiểm "lỡ trả" tự ghi đè trường này.
    title: null,
    visibility: 'PRIVATE',
    workspaceName: 'Nhóm Beta',
    stateBytes: 2 * 1024 * 1024,
    snapshotCount: 3,
  }),
  makeLargeDoc({
    id: '665f1c2e8a1b2c3d4e5f6a04',
    title: 'Biên bản cũ',
    status: 'ARCHIVED',
    stateBytes: 1024 * 1024,
    snapshotCount: 0,
    lastEditedAt: null,
  }),
];
