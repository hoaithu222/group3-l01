import { emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import type { ScanRow } from "../repositories/scan.repository";

/** `plagiarism:scan-updated` → `user:{requestedBy}` (be.md §6) — chỉ người yêu cầu, mọi thiết bị. */
export interface IScanEmitter {
  scanUpdated(scan: Pick<ScanRow, "id" | "workspaceId" | "requestedBy" | "status" | "progress" | "failureCode">): void;
}

export class SocketScanEmitter implements IScanEmitter {
  scanUpdated(scan: Pick<ScanRow, "id" | "workspaceId" | "requestedBy" | "status" | "progress" | "failureCode">): void {
    try {
      emitToUsers([scan.requestedBy], SocketEvent.PLAGIARISM_SCAN_UPDATED, {
        v: 1,
        scanId: scan.id,
        workspaceId: scan.workspaceId,
        status: scan.status,
        progress: scan.progress,
        ...(scan.failureCode && { failureCode: scan.failureCode }),
        serverNow: new Date().toISOString(),
      });
    } catch {
      // Best-effort — báo cáo qua GET vẫn là nguồn sự thật, app refetch khi focus màn.
    }
  }
}
