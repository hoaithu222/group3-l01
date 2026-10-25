import type { AuthUser } from "../../../core/types/express";
import { ErrorCode } from "../../../core/utils/error.codes";
import { newObjectId } from "../../../core/utils/object-id";
import { logger } from "../../../infrastructure/logger";
import type { DeleteRecordingQueryDto, RecordingUrlQueryDto, StartRecordingDto } from "../dtos";
import type { MeetingEntity } from "../entities/meeting.interface";
import { ACTIVE_RECORDING_STATUSES, type ConsentEntry, type RecordingDto, type RecordingEntity, type RecordingStopReasonValue } from "../entities/meeting-recap.interface";
import { meetError, meetNotFound, reasonRequired } from "./meeting-errors";
import type { MeetingRoomDeps } from "./meeting-room.deps";
import { loadViewer, recordingRights, type MeetingViewer, type RecordingRights } from "./recap-recording.access";
import type { RecordingConsentService } from "./recording-consent.service";
import type { RecordingConsentStore } from "./recording-consent.store";
import { notController, type RecordingGuards } from "./recording-guards";
import type { RecordingLifecycle } from "./recording-lifecycle.service";
import { sanitizeRecordingError } from "./recording-errors";
import { recordingOutbox } from "./recording-outbox";
import type { RecordingCapability, RecordingRuntimeLimits, RecordingStoragePort } from "./recording-runtime";
import { toRecordingDto } from "./recording.mapper";

interface Loaded {
  rec: RecordingEntity;
  meeting: MeetingEntity;
  viewer: MeetingViewer;
  rights: RecordingRights;
}

/**
 * `MeetingRecordingService` (be.md §5.4–§5.8) — ghi hình room-composite của chủ trì: BẮT ĐẦU (mọi người đang trong phòng đã đồng ý; một egress/phiên; token
 * người vào sau không có quyền phát tới khi đồng ý), DỪNG, danh sách, URL phát/tải (ký 900 s/60 s), XOÁ có lý do (OWNER không chủ trì), thử lại import.
 * Chuyển trạng thái đi qua `RecordingLifecycle` (CAS); webhook/import/cron ở các service riêng.
 */
export class MeetingRecordingService {
  constructor(
    private readonly d: MeetingRoomDeps,
    private readonly guards: RecordingGuards,
    private readonly consent: RecordingConsentService,
    private readonly store: RecordingConsentStore,
    private readonly lifecycle: RecordingLifecycle,
    private readonly storage: RecordingStoragePort,
    private readonly capability: RecordingCapability,
    private readonly limits: () => Promise<RecordingRuntimeLimits>
  ) {}

  private dto(rec: RecordingEntity, rights: RecordingRights): RecordingDto {
    return toRecordingDto(rec, rights, this.d.now());
  }

  /** Nạp bản ghi + cuộc họp + quyền của người gọi; bản ghi/cuộc họp không còn → `REC_005` (404). Chưa kiểm quyền thao tác cụ thể. */
  private async load(user: AuthUser, recordingId: string): Promise<Loaded> {
    const rec = await this.d.recordings.findById(recordingId);
    if (!rec || rec.deletedAt) throw meetError(ErrorCode.REC_005, 404);
    const meeting = await this.d.repo.findById(rec.meetingId);
    if (!meeting) throw meetError(ErrorCode.REC_005, 404);
    const viewer = await loadViewer(this.d, meeting, user.id);
    // Không thấy gì về cuộc họp (không tham dự, không phải chủ workspace) → 404 trung tính, không lộ bản ghi tồn tại.
    if (!viewer.canSeeDetail && !viewer.isOwner && !viewer.isHostLike) throw meetError(ErrorCode.REC_005, 404);
    return { rec, meeting, viewer, rights: recordingRights(viewer) };
  }

  /** `POST /meetings/:id/recordings` — điều kiện: yêu cầu đồng ý còn hạn + MỌI người đang trong phòng đã đồng ý (đọc + tạo bản ghi dưới `call:lock`, RR-07/08). */
  async start(user: AuthUser, meetingId: string, dto: StartRecordingDto): Promise<RecordingDto> {
    const { meeting, call, viewer } = await this.guards.assertCanRecord(user, meetingId);
    const req = await this.store.current(call.id);
    if (!req || req.requestId !== dto.requestId) throw meetError(ErrorCode.REC_008, 409);
    const limits = await this.limits();
    const id = newObjectId();
    const now = this.d.now();
    const storageKey = `${this.capability.keyPrefix()}${meeting.workspaceId}/${meeting.id}/${id}.mp4`;

    const rec = await this.d.calls.withCallLock(call.id, async () => {
      if (await this.d.recordings.findActiveByCall(call.id)) throw meetError(ErrorCode.REC_002, 409);
      const t = await this.consent.tally(call.id, req.requestId);
      if (t.inRoom.length === 0) throw meetError(ErrorCode.REC_007, 409);
      if (t.pending.length + t.declined.length > 0) throw meetError(ErrorCode.REC_001, 409, { pendingCount: t.pending.length, declinedCount: t.declined.length });
      const snapshot: ConsentEntry[] = t.inRoom.map((p) => ({ userId: p.userId, at: new Date(t.answers.get(p.userId)?.at ?? now.toISOString()), lateJoin: false }));
      return this.d.tx.run(async (tx) => {
        const created = await this.d.recordings.create(tx, { id, meetingId: meeting.id, workspaceId: meeting.workspaceId, callId: call.id, requestId: req.requestId, layout: dto.layout, storageKey, startedBy: user.id, consentSnapshot: snapshot, startedAt: now });
        await this.d.outbox.add(tx, recordingOutbox.stopOnEnd(created, new Date(now.getTime() + limits.maxMinutes * 60_000)));
        return created;
      });
    });
    await this.store.close(call.id, req.requestId).catch(() => undefined);
    await this.d.audit.record({ actorId: user.id, action: "recording.start", targetType: "MeetingRecording", targetId: rec.id, workspaceId: meeting.workspaceId, metadata: { meetingId: meeting.id, callId: call.id, layout: dto.layout, consentCount: rec.consentSnapshot.length } });
    this.lifecycle.announceStarting(rec);

    try {
      const egress = await this.d.media().startRoomCompositeEgress(call.livekitRoom, { fileOutput: { filepath: storageKey }, layout: dto.layout === "GRID" ? "grid" : "speaker", preset: "H264_720P_30" });
      const withEgress = await this.d.recordings.transition(undefined, rec.id, ["STARTING", "RECORDING"], { egressId: egress.egressId });
      return this.dto(withEgress ?? rec, recordingRights(viewer));
    } catch (err) {
      logger.warn("[recording] startRoomCompositeEgress lỗi", { recordingId: rec.id, error: err instanceof Error ? err.message : String(err) });
      await this.lifecycle.toFailed(rec, sanitizeRecordingError(err), ["STARTING"]);
      throw meetError(ErrorCode.REC_003, 503);
    }
  }

  /** `POST /recordings/:id/stop` — chủ trì/đồng chủ trì. */
  async stop(user: AuthUser, recordingId: string): Promise<RecordingDto> {
    const { rec, meeting, viewer, rights } = await this.load(user, recordingId);
    if (!rights.canControl) throw notController(viewer);
    const stopped = await this.lifecycle.stop(rec, user.id, "HOST_STOPPED");
    if (stopped.status === "STOPPING" && stopped.stoppedBy === user.id) {
      await this.d.audit.record({ actorId: user.id, action: "recording.stop", targetType: "MeetingRecording", targetId: rec.id, workspaceId: meeting.workspaceId, metadata: { meetingId: meeting.id } });
    }
    return this.dto(stopped, rights);
  }

  /** Dừng do HỆ THỐNG (kết thúc họp / chạm trần thời lượng): bản ghi đang chạy của phiên (hoặc đúng `recordingId`) → STOPPING. Không có gì đang chạy → `null`. */
  async stopBySystem(i: { meetingId?: string; recordingId?: string }, reason: RecordingStopReasonValue): Promise<RecordingEntity | null> {
    let rec: RecordingEntity | null = null;
    if (i.recordingId) rec = await this.d.recordings.findById(i.recordingId);
    else if (i.meetingId) {
      const meeting = await this.d.repo.findById(i.meetingId, { includeDeleted: true });
      rec = meeting?.currentCallId ? await this.d.recordings.findActiveByCall(meeting.currentCallId) : null;
    }
    if (!rec || rec.deletedAt || !(rec.status === "STARTING" || rec.status === "RECORDING")) return null;
    return this.lifecycle.stop(rec, null, reason).catch((err: unknown) => {
      logger.warn("[recording] Không dừng được bản ghi khi hệ thống yêu cầu — cron stuck-check sẽ chốt", { recordingId: rec?.id, error: err instanceof Error ? err.message : String(err) });
      return null;
    });
  }

  /** `GET /meetings/:id/recordings` — người điều khiển thấy cả PROCESSING/FAILED; người xem thường chỉ READY. */
  async list(user: AuthUser, meetingId: string): Promise<RecordingDto[]> {
    const meeting = await this.d.repo.findById(meetingId);
    if (!meeting) throw meetNotFound();
    const rights = recordingRights(await loadViewer(this.d, meeting, user.id));
    if (!rights.canView) throw meetNotFound();
    const rows = await this.d.recordings.listByMeeting(meetingId, { readyOnly: !rights.canControl });
    return rows.map((r) => this.dto(r, rights));
  }

  /** `GET /recordings/:id` — bản chưa READY chỉ người điều khiển thấy. */
  async get(user: AuthUser, recordingId: string): Promise<RecordingDto> {
    const { rec, rights } = await this.load(user, recordingId);
    if (!rights.canView) throw meetError(ErrorCode.REC_005, 404);
    if (rec.status !== "READY" && !rights.canControl) throw meetError(ErrorCode.REC_005, 404);
    return this.dto(rec, rights);
  }

  /** `GET /recordings/:id/url?purpose=` — STREAM: người xem được cuộc họp; DOWNLOAD: chủ trì/đồng chủ trì + OWNER workspace (không tham dự → audit). */
  async url(user: AuthUser, recordingId: string, q: RecordingUrlQueryDto): Promise<{ url: string; expiresAt: string; mime: "video/mp4" }> {
    const { rec, meeting, viewer, rights } = await this.load(user, recordingId);
    if (q.purpose === "DOWNLOAD") {
      if (!rights.canDownload) throw rights.canView ? meetError(ErrorCode.MEET_002, 403) : meetError(ErrorCode.REC_005, 404);
    } else if (!rights.canView) {
      throw meetError(ErrorCode.REC_005, 404);
    }
    if (rec.status !== "READY") throw meetError(ErrorCode.REC_004, 409);
    const limits = await this.limits();
    const ttl = q.purpose === "STREAM" ? limits.playbackUrlTtlSeconds : limits.downloadUrlTtlSeconds;
    const url = await this.storage.signedUrl(rec.storageKey, ttl);
    if (q.purpose === "DOWNLOAD" && !viewer.isHostLike) {
      await this.d.audit.record({ actorId: user.id, action: "recording.download", targetType: "MeetingRecording", targetId: rec.id, workspaceId: meeting.workspaceId, metadata: { meetingId: meeting.id } });
    }
    return { url, expiresAt: new Date(this.d.now().getTime() + ttl * 1000).toISOString(), mime: "video/mp4" };
  }

  /** `DELETE /recordings/:id` — chủ trì THEO LỊCH hoặc OWNER workspace; OWNER không chủ trì bắt buộc lý do ≥ 10 ký tự (RR-20); đang chạy → `MEET_009`. */
  async delete(user: AuthUser, recordingId: string, q: DeleteRecordingQueryDto): Promise<void> {
    const { rec, meeting, viewer, rights } = await this.load(user, recordingId);
    if (!rights.canDelete) throw viewer.isHostLike || rights.canView ? meetError(ErrorCode.MEET_002, 403) : meetError(ErrorCode.REC_005, 404);
    if ((ACTIVE_RECORDING_STATUSES as readonly string[]).includes(rec.status)) throw meetError(ErrorCode.MEET_009, 409);
    if (!viewer.isScheduleHost && !q.reason) throw reasonRequired();
    if (!(await this.lifecycle.remove(rec, user.id, q.reason ?? "Chủ trì xoá bản ghi"))) return; // đã xoá (idempotent)
    await this.d.audit.record({ actorId: user.id, action: "recording.delete", targetType: "MeetingRecording", targetId: rec.id, workspaceId: meeting.workspaceId, reason: q.reason, metadata: { meetingId: meeting.id, status: rec.status } });
  }

  /** `POST /recordings/:id/retry-import` — bản FAILED mà egress ĐÃ ghi tệp (còn trên storage): về PROCESSING + xếp lại import. */
  async retryImport(user: AuthUser, recordingId: string): Promise<RecordingDto> {
    const { rec, meeting, viewer, rights } = await this.load(user, recordingId);
    if (!rights.canControl) throw notController(viewer);
    if (rec.status !== "FAILED" || rec.fileSizeBytes === null) throw meetError(ErrorCode.REC_004, 409);
    if (!(await this.storage.head(rec.storageKey))) throw meetError(ErrorCode.REC_004, 409);
    const updated = await this.d.tx.run(async (tx) => {
      const u = await this.d.recordings.transition(tx, rec.id, ["FAILED"], { status: "PROCESSING", error: null, importAttempts: 0 });
      if (!u) return null;
      await this.d.outbox.add(tx, recordingOutbox.import(u, u.version));
      return u;
    });
    if (!updated) throw meetError(ErrorCode.REC_004, 409);
    await this.d.audit.record({ actorId: user.id, action: "recording.retry-import", targetType: "MeetingRecording", targetId: rec.id, workspaceId: meeting.workspaceId, metadata: { meetingId: meeting.id } });
    return this.dto(updated, rights);
  }
}
