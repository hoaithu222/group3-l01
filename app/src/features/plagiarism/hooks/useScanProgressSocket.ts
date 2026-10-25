import { useQueryClient } from '@tanstack/react-query';

import { SocketEvent, useSocketEvent } from '@/core/socket';

import { plagiarismKeys } from '../api/plagiarism.keys';
import type { PlagiarismScanUpdatedPayload, ScanSummary } from '../api/plagiarism.types';

const TERMINAL: ReadonlySet<string> = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED']);

/**
 * Đồng bộ `plagiarism:scan-updated` (app.md §4) — ghi ngay `status`/`progress` vào cache `['plagiarism','scan',id]` để
 * thanh tiến độ đổi tức thì; đổi sang trạng thái KẾT THÚC thì `invalidate` báo cáo + danh sách (kết quả/thất bại chỉ có
 * qua `GET`, socket không mang). Gắn MỘT lần ở `ScanListScreen` và `ScanReportScreen` (app.md §4).
 */
export function useScanProgressSocket(): void {
  const queryClient = useQueryClient();

  useSocketEvent<PlagiarismScanUpdatedPayload>(SocketEvent.PLAGIARISM_SCAN_UPDATED, (payload) => {
    if (!payload?.scanId) return;
    const key = plagiarismKeys.scan(payload.scanId);
    const cached = queryClient.getQueryData<ScanSummary>(key);
    if (cached) {
      queryClient.setQueryData<ScanSummary>(key, {
        ...cached,
        status: payload.status,
        progress: payload.progress,
        failureCode: payload.failureCode ?? cached.failureCode,
        serverNow: payload.serverNow,
      });
    }
    void queryClient.invalidateQueries({ queryKey: plagiarismKeys.scan(payload.scanId) });
    void queryClient.invalidateQueries({ queryKey: ['plagiarism', 'scans', payload.workspaceId] });
    if (TERMINAL.has(payload.status)) {
      void queryClient.invalidateQueries({ queryKey: plagiarismKeys.report(payload.scanId) });
    }
  });
}
