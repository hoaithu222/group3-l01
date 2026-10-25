import { LIMITS } from "../../../core/constants/limits";

/**
 * `jobId` + độ trễ của job tính lại DEBOUNCE: cùng bảng trong cùng cửa sổ `recomputeDebounceSeconds` ⇒ cùng id ⇒ BullMQ bỏ bản thêm. KHÔNG dùng id cố định theo bảng:
 * job đã xong còn nằm trong `removeOnComplete`, add trùng id bị bỏ ⇒ tính lại không bao giờ được xếp nữa.
 * File THUẦN (không import hạ tầng) để service dùng được mà không kéo Redis/BullMQ vào test đơn vị.
 */
export function recomputeJobId(boardId: string, atMs: number): { jobId: string; delayMs: number } {
  const delayMs = LIMITS.contribution.recomputeDebounceSeconds * 1000;
  return { jobId: `contribution.recompute:board:${boardId}:t${Math.floor(atMs / delayMs)}`, delayMs };
}
