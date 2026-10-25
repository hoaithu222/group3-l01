import { logger } from "../../infrastructure/logger";
import type { CollabKind } from "./collab-token.service";

/**
 * Cron chụp bản lưu AUTO DÙNG CHUNG cho mọi loại tài nguyên cộng tác (p6-02 be.md §7: `collab.snapshot-hourly` thay `document.snapshot-hourly`).
 * Mỗi module (documents, whiteboards) đăng ký MỘT runner cho loại của mình lúc nạp file job; cron chạy lần lượt các runner đã đăng ký. Tách khỏi
 * `collab-snapshot-hourly.ts` (phần đăng ký job/cron, kéo `infrastructure/queue`) để test runner thuần và để barrel `shared/collab` không kéo BullMQ/Redis.
 */
export const COLLAB_SNAPSHOT_JOB = { queue: "cron", name: "collab.snapshot-hourly" } as const;

export interface CollabSnapshotRunResult {
  scanned: number;
  created: number;
  pruned: number;
}

export type CollabSnapshotRunner = () => Promise<CollabSnapshotRunResult>;

const runners = new Map<CollabKind, CollabSnapshotRunner>();

/** Đăng ký lại cùng `kind` sẽ GHI ĐÈ (idempotent khi file job được import nhiều lần — API `PROCESS_ROLE=all` và test). */
export function registerCollabSnapshotRunner(kind: CollabKind, runner: CollabSnapshotRunner): void {
  runners.set(kind, runner);
}

/** Chỉ dùng trong test để cô lập giữa các case. */
export function clearCollabSnapshotRunners(): void {
  runners.clear();
}

/** Loại đã đăng ký (đã sắp xếp) — test parity/chẩn đoán. */
export function listCollabSnapshotKinds(): CollabKind[] {
  return [...runners.keys()].sort();
}

/**
 * Chạy MỌI runner đã đăng ký. Lỗi của một loại KHÔNG chặn loại còn lại (bảng trắng hỏng không được làm tài liệu mất bản lưu tự động); có lỗi thì
 * ném ở CUỐI để job hiện thất bại (cron `attempts: 1`, giờ sau tự chạy lại — runner idempotent).
 */
export async function runCollabSnapshotHourly(): Promise<Partial<Record<CollabKind, CollabSnapshotRunResult>>> {
  const results: Partial<Record<CollabKind, CollabSnapshotRunResult>> = {};
  const failed: CollabKind[] = [];
  for (const [kind, runner] of runners) {
    try {
      results[kind] = await runner();
    } catch (err) {
      failed.push(kind);
      logger.error("[collab.snapshot-hourly] runner lỗi", { kind, error: err instanceof Error ? err.message : String(err) });
    }
  }
  if (failed.length > 0) throw new Error(`collab.snapshot-hourly: lỗi ở loại ${failed.join(", ")}`);
  return results;
}
