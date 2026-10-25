import { LIMITS } from "../../../core/constants/limits";
import { runtimeConfig } from "../../../core/config/runtime-config";
import { createContextLogger } from "../../../infrastructure/logger";

const log = createContextLogger({ service: "DocumentLimits" });

export interface DocumentLimits {
  titleMax: number;
  collaboratorsMax: number;
  concurrentEditorsMax: number;
  snapshotsAuto: number;
  snapshotsManualMax: number;
  perWorkspaceMax: number;
}

/**
 * Giới hạn hiệu lực = `LIMITS.document` ⊕ override `SystemConfig` `limits.document` (admin chỉ HẠ được, kẹp bởi registry).
 * Lỗi đọc cấu hình (Redis/DB) → dùng mặc định cứng — không để việc đọc cấu hình làm hỏng thao tác tài liệu.
 */
export async function getDocumentLimits(): Promise<DocumentLimits> {
  const fallback: DocumentLimits = {
    titleMax: LIMITS.document.titleMax,
    collaboratorsMax: LIMITS.document.collaboratorsMax,
    concurrentEditorsMax: LIMITS.document.concurrentEditorsMax,
    snapshotsAuto: LIMITS.document.snapshotsAuto,
    snapshotsManualMax: LIMITS.document.snapshotsManualMax,
    perWorkspaceMax: LIMITS.document.perWorkspaceMax,
  };
  try {
    const eff = (await runtimeConfig.getEffective("limits.document")) as Partial<DocumentLimits>;
    return {
      titleMax: eff.titleMax ?? fallback.titleMax,
      collaboratorsMax: eff.collaboratorsMax ?? fallback.collaboratorsMax,
      concurrentEditorsMax: eff.concurrentEditorsMax ?? fallback.concurrentEditorsMax,
      snapshotsAuto: eff.snapshotsAuto ?? fallback.snapshotsAuto,
      snapshotsManualMax: eff.snapshotsManualMax ?? fallback.snapshotsManualMax,
      perWorkspaceMax: eff.perWorkspaceMax ?? fallback.perWorkspaceMax,
    };
  } catch (err) {
    log.warn("Không đọc được limits.document, dùng mặc định", { error: err instanceof Error ? err.message : String(err) });
    return fallback;
  }
}
