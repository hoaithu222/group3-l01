import { ErrorCode } from "../../../core/utils/error.codes";
import type { AdminDeleteRecordingQueryDto, AdminRecordingListQueryDto } from "../dtos";
import { ACTIVE_RECORDING_STATUSES } from "../entities/meeting-recap.interface";
import type { AdminRecordingRecord, AdminRecordingSummary, IAdminRecordingReader } from "../repositories/admin-recording.reader";
import type { AuditPort } from "./meeting.deps";
import { meetError } from "./meeting-errors";
import type { RecordingLifecycle } from "./recording-lifecycle.service";
import type { RecordingStoragePort } from "./recording-runtime";
import type { IMeetingRecordingRepository } from "../repositories/meeting-recording.repository.interface";

/** Một dòng bản ghi hình cho tab "Ghi hình" của admin — CHỈ metadata (xem `AdminRecordingRecord`). Không phát/tải, không URL ký. */
export interface AdminRecordingRow {
  id: string;
  meeting: { id: string; title: string | null };
  workspace: { id: string; name: string | null };
  startedBy: { id: string; name: string | null };
  status: AdminRecordingRecord["status"];
  layout: AdminRecordingRecord["layout"];
  startedAt: string;
  stoppedAt: string | null;
  durationSec: number | null;
  fileSizeBytes: number | null;
  retentionExpiresAt: string | null;
  /** Số ngày còn lại tới hạn lưu trữ (âm = đã quá hạn); `null` khi chưa có hạn. */
  retentionDaysLeft: number | null;
  deletedAt: string | null;
  deleteReason: string | null;
  error: string | null;
}

export interface AdminRecordingDetail extends AdminRecordingRow {
  callId: string;
  egressId: string | null;
  stoppedBy: { id: string; name: string | null } | null;
  stopReason: AdminRecordingRecord["stopReason"];
  /** Số người đã đồng ý — KHÔNG có danh sách tên. */
  consentCount: number;
  /** Khoá object che một phần (`recordings/…/<id>.mp4`) — không lộ workspace/cuộc họp trong đường dẫn. */
  storageKeyMasked: string;
  /** Kết quả `HEAD` object khi mở drawer; `null` khi không kiểm được (storage lỗi). */
  object: { exists: boolean; sizeBytes: number | null } | null;
}

const DAY_MS = 86_400_000;
const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

/** `recordings/66f…/77a…/88b….mp4` → `recordings/…/88b….mp4`. */
export function maskStorageKey(key: string): string {
  const parts = key.split("/").filter(Boolean);
  if (parts.length <= 2) return key;
  return `${parts[0]}/…/${parts[parts.length - 1]}`;
}

/**
 * Giám sát bản ghi hình cho admin nền tảng (p2-06 admin.md, D-24): danh sách/tóm tắt/chi tiết CHỈ metadata + xoá có lý do (audit `recording.delete`). Admin KHÔNG phát,
 * KHÔNG tải, KHÔNG đọc nội dung biên bản. Xoá dùng chung `RecordingLifecycle.remove` với chủ trì/cron nên cùng luật (xoá mềm, gỡ link, xoá object bằng job).
 */
export class AdminRecordingService {
  constructor(
    private readonly reader: IAdminRecordingReader,
    private readonly recordings: IMeetingRecordingRepository,
    private readonly lifecycle: RecordingLifecycle,
    private readonly storage: RecordingStoragePort,
    private readonly audit: AuditPort,
    private readonly now: () => Date
  ) {}

  private async rows(records: AdminRecordingRecord[]): Promise<AdminRecordingRow[]> {
    const [titles, workspaces, users] = await Promise.all([
      this.reader.meetingTitles(records.map((r) => r.meetingId)),
      this.reader.workspaceNames(records.map((r) => r.workspaceId)),
      this.reader.userNames(records.flatMap((r) => (r.stoppedBy ? [r.startedBy, r.stoppedBy] : [r.startedBy]))),
    ]);
    const now = this.now().getTime();
    return records.map((r) => ({
      id: r.id,
      meeting: { id: r.meetingId, title: titles.get(r.meetingId) ?? null },
      workspace: { id: r.workspaceId, name: workspaces.get(r.workspaceId) ?? null },
      startedBy: { id: r.startedBy, name: users.get(r.startedBy) ?? null },
      status: r.status,
      layout: r.layout,
      startedAt: r.startedAt.toISOString(),
      stoppedAt: iso(r.stoppedAt),
      durationSec: r.durationSec,
      fileSizeBytes: r.fileSizeBytes,
      retentionExpiresAt: iso(r.retentionExpiresAt),
      retentionDaysLeft: r.retentionExpiresAt ? Math.ceil((r.retentionExpiresAt.getTime() - now) / DAY_MS) : null,
      deletedAt: iso(r.deletedAt),
      deleteReason: r.deleteReason,
      error: r.error,
    }));
  }

  async list(q: AdminRecordingListQueryDto) {
    const { rows, total } = await this.reader.list(q, this.now());
    const totalPages = Math.max(1, Math.ceil(total / q.limit));
    return { data: await this.rows(rows), meta: { page: q.page, limit: q.limit, total, totalPages, hasNext: q.page < totalPages, hasPrev: q.page > 1 } };
  }

  summary(workspaceId?: string): Promise<AdminRecordingSummary> {
    return this.reader.summary(this.now(), workspaceId);
  }

  async detail(id: string): Promise<AdminRecordingDetail> {
    const rec = await this.reader.findById(id);
    if (!rec) throw meetError(ErrorCode.REC_005, 404);
    const [row] = await this.rows([rec]);
    const stopper = rec.stoppedBy ? (await this.reader.userNames([rec.stoppedBy])).get(rec.stoppedBy) ?? null : null;
    const object = rec.deletedAt || !["READY", "PROCESSING", "FAILED"].includes(rec.status) ? null : await this.storage.head(rec.storageKey).then((h) => ({ exists: !!h, sizeBytes: h?.size ?? null }), () => null);
    return { ...(row as AdminRecordingRow), callId: rec.callId, egressId: rec.egressId, stoppedBy: rec.stoppedBy ? { id: rec.stoppedBy, name: stopper } : null, stopReason: rec.stopReason, consentCount: rec.consentCount, storageKeyMasked: maskStorageKey(rec.storageKey), object };
  }

  /** `DELETE /admin/recordings/:id?reason=` — không xoá bản đang chạy (`MEET_009`); đã xoá → 404 (idempotent về mặt kết quả). */
  async delete(actorId: string, id: string, q: AdminDeleteRecordingQueryDto): Promise<void> {
    const rec = await this.recordings.findById(id);
    if (!rec || rec.deletedAt) throw meetError(ErrorCode.REC_005, 404);
    if ((ACTIVE_RECORDING_STATUSES as readonly string[]).includes(rec.status)) throw meetError(ErrorCode.MEET_009, 409);
    if (!(await this.lifecycle.remove(rec, actorId, q.reason))) throw meetError(ErrorCode.REC_005, 404);
    await this.audit.record({ actorId, action: "recording.delete", targetType: "MeetingRecording", targetId: rec.id, workspaceId: rec.workspaceId, reason: q.reason, metadata: { meetingId: rec.meetingId, status: rec.status, byAdmin: true } });
  }
}
