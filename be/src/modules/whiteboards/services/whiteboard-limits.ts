import { LIMITS } from "../../../core/constants/limits";

export interface WhiteboardLimits {
  nameMax: number;
  collaboratorsMax: number;
  concurrentEditorsMax: number;
  snapshotsAuto: number;
  snapshotsManualMax: number;
  perWorkspaceMax: number;
  elementsMax: number;
  stateMaxBytes: number;
}

/**
 * Giới hạn hiệu lực của bảng trắng — hiện CHÍNH LÀ `LIMITS.whiteboard` (kế hoạch p6-02 không có khoá SystemConfig `limits.whiteboard`, khác `limits.document`).
 * Giữ một cửa đọc bất đồng bộ để khi thêm khoá registry chỉ sửa ở đây (đọc `runtimeConfig.getEffective("limits.whiteboard")` như `document-limits.ts`) và để test hạ trần
 * bằng `jest.mock` mà không phải tạo hàng trăm bảng.
 */
export function getWhiteboardLimits(): Promise<WhiteboardLimits> {
  const w = LIMITS.whiteboard;
  return Promise.resolve({
    nameMax: w.nameMax,
    collaboratorsMax: w.collaboratorsMax,
    concurrentEditorsMax: w.concurrentEditorsMax,
    snapshotsAuto: w.snapshotsAuto,
    snapshotsManualMax: w.snapshotsManualMax,
    perWorkspaceMax: w.perWorkspaceMax,
    elementsMax: w.elementsMax,
    stateMaxBytes: w.stateMaxBytes,
  });
}
