import { logger } from "../../../infrastructure/logger";
import type { RecordingEntity } from "../entities/meeting-recap.interface";
import type { MeetingAssetsPort } from "./meeting-assets.port";
import { meetingEvents } from "./meeting-events";
import type { MeetingRoomDeps } from "./meeting-room.deps";
import type { RecordingLifecycle } from "./recording-lifecycle.service";
import { recordingOutbox } from "./recording-outbox";
import type { RecordingRuntimeLimits, RecordingStoragePort } from "./recording-runtime";

/** `Asset.size` là Int32 (Prisma+Mongo) — tệp lớn hơn không đăng ký được (đã chặn từ đầu bằng trần thời lượng `LIMITS.recording.maxMinutes`). */
const INT32_MAX = 2_147_483_647;

/** "Kết thúc buổi họp 12/09" không dấu gạch chéo/khoảng trắng lạ — tên tệp tải về. */
const fileNameOf = (title: string, at: Date): string => {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "cuoc-hop"}-${at.toISOString().slice(0, 10)}.mp4`;
};

export type ImportOutcome = "READY" | "SKIPPED" | "FAILED" | "RETRY";

/** Ném trong transaction để HOÀN TÁC (không để lại asset mồ côi) khi bản ghi đã bị xoá/đổi trạng thái giữa chừng. */
class ImportSkipped extends Error {}

/**
 * `recording.import` (be.md §5.7, queue `media`): egress đã GHI THẲNG vào bucket nên KHÔNG tải lại tệp — `HEAD` xác nhận kích thước, rồi TRONG MỘT transaction
 * đăng ký `Asset READY` (scope RECORDING), gắn `AssetLink MEETING_RECORDING`, chuyển bản ghi PROCESSING → READY và ghi outbox `recording-ready` (thẻ chat +
 * hộp thư). Idempotent: CAS `PROCESSING → READY` thắng đúng một lần (RR-12); lượt sau thấy `READY` → bỏ qua. Chưa thấy object → ném lỗi để BullMQ thử lại
 * (backoff), đủ `importMaxAttempts` thì FAILED (người điều khiển có nút "Thử lại" nếu tệp về sau xuất hiện).
 */
export class RecordingImportService {
  constructor(
    private readonly d: MeetingRoomDeps,
    private readonly lifecycle: RecordingLifecycle,
    private readonly assets: MeetingAssetsPort,
    private readonly storage: RecordingStoragePort,
    private readonly limits: () => Promise<RecordingRuntimeLimits>
  ) {}

  async run(recordingId: string): Promise<ImportOutcome> {
    const rec = await this.d.recordings.findById(recordingId);
    if (!rec || rec.deletedAt || rec.status !== "PROCESSING") return "SKIPPED";

    const head = await this.storage.head(rec.storageKey);
    if (!head) return this.missingObject(rec);
    if (head.size <= 0 || head.size > INT32_MAX) {
      await this.lifecycle.toFailed(rec, head.size <= 0 ? "Tệp ghi hình rỗng" : "Tệp ghi hình vượt 2 GiB", ["PROCESSING"]);
      return "FAILED";
    }

    const meeting = await this.d.repo.findById(rec.meetingId, { includeDeleted: true });
    const title = meeting?.title ?? "Cuộc họp";
    try {
      await this.d.tx.run(async (tx) => {
        const { assetId } = await this.assets.registerRecording(tx, {
          ownerId: rec.startedBy,
          workspaceId: rec.workspaceId,
          fileName: fileNameOf(title, rec.startedAt),
          storageKey: rec.storageKey,
          size: head.size,
          durationMs: rec.durationSec !== null ? rec.durationSec * 1000 : undefined,
        });
        const u = await this.d.recordings.transition(tx, rec.id, ["PROCESSING"], { status: "READY", assetId, fileSizeBytes: head.size });
        if (!u) throw new ImportSkipped(); // bị xoá/đổi trạng thái giữa chừng: hoàn tác cả asset vừa tạo
        await this.assets.attach(tx, { assetId, target: "MEETING_RECORDING", targetId: u.id, meetingId: u.meetingId, actorId: u.startedBy });
        await this.d.outbox.add(tx, meetingEvents.recordingReady({ meetingId: u.meetingId, version: u.version, recordingId: u.id }));
      });
    } catch (err) {
      if (err instanceof ImportSkipped) return "SKIPPED";
      throw err;
    }
    await this.lifecycle.refreshStorageGauge();
    logger.info("[recording] Import xong", { recordingId: rec.id, sizeBytes: head.size });
    return "READY";
  }

  /**
   * Chưa thấy object: đếm lượt thử; còn lượt → HẸN LẠI bằng hàng outbox có `availableAt` (backoff 1 → 2 → 4 → 8 phút…, trần 30 phút — bền qua restart, KHÔNG dựa vào
   * retry mặc định 3 lần/2 giây của BullMQ); hết lượt → FAILED (người điều khiển có nút "Thử lại" nếu tệp về sau xuất hiện).
   */
  private async missingObject(rec: RecordingEntity): Promise<ImportOutcome> {
    const attempts = rec.importAttempts + 1;
    if (attempts >= (await this.limits()).importMaxAttempts) {
      await this.d.recordings.transition(undefined, rec.id, ["PROCESSING"], { importAttempts: attempts });
      await this.lifecycle.toFailed(rec, "Không tìm thấy tệp ghi hình trên lưu trữ", ["PROCESSING"]);
      return "FAILED";
    }
    const delayMs = Math.min(60_000 * 2 ** (attempts - 1), 30 * 60_000);
    await this.d.tx.run(async (tx) => {
      const u = await this.d.recordings.transition(tx, rec.id, ["PROCESSING"], { importAttempts: attempts });
      if (u) await this.d.outbox.add(tx, recordingOutbox.import(u, u.version, new Date(this.d.now().getTime() + delayMs)));
    });
    logger.warn("[recording] Chưa thấy tệp ghi hình trên storage — hẹn import lại", { recordingId: rec.id, attempts, delayMs });
    return "RETRY";
  }
}

