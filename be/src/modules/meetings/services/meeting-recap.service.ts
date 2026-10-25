import { AppError, NotFoundError, VersionConflictError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode } from "../../../core/utils/error.codes";
import type { PublishRecapDto, UpsertRecapDto } from "../dtos";
import type { MeetingEntity } from "../entities/meeting.interface";
import type { RecapDto, RecapEntity } from "../entities/meeting-recap.interface";
import { RecapConflictError } from "../repositories/meeting-recap.repository.interface";
import { isBlankRecap } from "./recap-content";
import { loadViewer, recapRights, type MeetingViewer, type RecapRights } from "./recap-recording.access";
import { meetError, meetNotFound } from "./meeting-errors";
import { meetingEvents } from "./meeting-events";
import type { MeetingAssetInfo, MeetingAssetsPort } from "./meeting-assets.port";
import { toAttachmentDto, toRecapDto } from "./meeting-recap.mapper";
import type { MeetingRoomDeps } from "./meeting-room.deps";
import type { RecordingRuntimeLimits } from "./recording-runtime";

/**
 * `MeetingRecapService` (be.md §5.1) — biên bản họp do NGƯỜI viết: một bản/cuộc họp (`meetingId` unique), nháp chỉ người sửa thấy, CÔNG BỐ → mọi người xem
 * được cuộc họp thấy `publishedContent`. Sửa bằng CAS `version` (hai người sửa đồng thời → 409 `RES_003`, người thua giữ bản nhập ở client). Tệp đính kèm
 * đi qua luồng asset chuẩn (`AssetLink MEETING_RECAP`). Sau commit mọi tác động (tin chat, socket, push) đi qua outbox `meeting.events` (sink p2-06).
 */
export class MeetingRecapService {
  constructor(
    private readonly d: MeetingRoomDeps,
    private readonly assets: MeetingAssetsPort,
    private readonly limits: () => Promise<RecordingRuntimeLimits>
  ) {}

  private async meeting(meetingId: string): Promise<MeetingEntity> {
    const m = await this.d.repo.findById(meetingId);
    if (!m) throw meetNotFound();
    return m;
  }

  /** Người thấy được cuộc họp nhưng không được làm → 403; người không thuộc nhóm nào của biên bản → 404 (không lộ có/không có nháp). */
  private denied(v: MeetingViewer) {
    return v.canSeeDetail ? meetError(ErrorCode.MEET_002, 403) : meetNotFound();
  }

  private writable(m: MeetingEntity): boolean {
    return m.status === "LIVE" || m.status === "ENDED";
  }

  private assertWritable(m: MeetingEntity): void {
    if (!this.writable(m)) throw meetError(ErrorCode.MEET_021, 409);
  }

  private async attachmentsOf(recap: RecapEntity, asEditor: boolean) {
    const linked = await this.assets.linkedAssetIds("MEETING_RECAP", recap.id);
    const ids = asEditor ? linked : linked.filter((id) => recap.publishedAssetIds.includes(id));
    const infos = await this.assets.getMany(ids);
    const byId = new Map<string, MeetingAssetInfo>(infos.map((a) => [a.id, a]));
    return ids.flatMap((id) => (byId.has(id) ? [toAttachmentDto(byId.get(id) as MeetingAssetInfo)] : []));
  }

  private async dto(meeting: MeetingEntity, recap: RecapEntity | null, rights: RecapRights, asEditor: boolean): Promise<RecapDto> {
    const canWrite = this.writable(meeting);
    return toRecapDto({
      meeting,
      recap,
      asEditor,
      canEdit: rights.isEditor && canWrite,
      canPublish: rights.canPublish && canWrite,
      attachments: recap ? await this.attachmentsOf(recap, asEditor) : [],
      now: this.d.now(),
    });
  }

  /** `GET /meetings/:id/recap` — nháp chỉ người sửa; người xem thường nhận bản đã công bố (chưa công bố → 404 `MEET_001`, RR-02). */
  async get(user: AuthUser, meetingId: string): Promise<RecapDto> {
    const meeting = await this.meeting(meetingId);
    const [recap, viewer] = await Promise.all([this.d.recaps.findByMeetingId(meetingId), loadViewer(this.d, meeting, user.id)]);
    const rights = recapRights(viewer, recap);
    if (!recap) {
      if (!viewer.isHostLike) throw meetNotFound();
      return this.dto(meeting, null, rights, true);
    }
    if (rights.canViewDraft) return this.dto(meeting, recap, rights, true);
    if (rights.canViewPublished) return this.dto(meeting, recap, rights, false);
    throw meetNotFound();
  }

  /** Tạo bản ghi đầu tiên (người tạo = `authorId`). Hai lượt tạo đồng thời: bên thua đọc lại và nhận `RES_003` (cần `expectedVersion` của bản vừa tạo). */
  private async createFirst(meeting: MeetingEntity, userId: string, init: { content: string; startedAt?: Date; endedAt?: Date }): Promise<RecapEntity> {
    try {
      return await this.d.tx.run((tx) =>
        this.d.recaps.create(tx, {
          meetingId: meeting.id,
          workspaceId: meeting.workspaceId,
          content: init.content,
          startedAt: init.startedAt ?? meeting.startedAt,
          endedAt: init.endedAt ?? meeting.endedAt,
          authorId: userId,
          lastEditedBy: userId,
        })
      );
    } catch (err) {
      if (!(err instanceof RecapConflictError)) throw err;
      const fresh = await this.d.recaps.findByMeetingId(meeting.id);
      throw new VersionConflictError(fresh?.version ?? 1);
    }
  }

  /** `PUT /meetings/:id/recap` — lưu NHÁP (không công bố). */
  async upsert(user: AuthUser, meetingId: string, dto: UpsertRecapDto): Promise<RecapDto> {
    const meeting = await this.meeting(meetingId);
    const [existing, viewer] = await Promise.all([this.d.recaps.findByMeetingId(meetingId), loadViewer(this.d, meeting, user.id)]);
    const rights = recapRights(viewer, existing);
    if (!rights.isEditor) throw this.denied(viewer);
    this.assertWritable(meeting);

    if (!existing) {
      const created = await this.createFirst(meeting, user.id, dto);
      return this.dto(meeting, created, recapRights(viewer, created), true);
    }
    if (dto.expectedVersion === undefined) throw new VersionConflictError(existing.version);
    const updated = await this.d.tx.run((tx) =>
      this.d.recaps.update(tx, meetingId, dto.expectedVersion as number, {
        content: dto.content,
        lastEditedBy: user.id,
        ...(dto.startedAt !== undefined ? { startedAt: dto.startedAt } : {}),
        ...(dto.endedAt !== undefined ? { endedAt: dto.endedAt } : {}),
      })
    );
    if (!updated) throw new VersionConflictError((await this.d.recaps.findByMeetingId(meetingId))?.version ?? existing.version);
    return this.dto(meeting, updated, rights, true);
  }

  /** `POST /meetings/:id/recap/attachments` — gắn asset READY của CHÍNH người gửi (scope `MEETING`), tối đa `attachmentsMax` (`MEET_022`). */
  async attach(user: AuthUser, meetingId: string, assetId: string): Promise<RecapDto> {
    const meeting = await this.meeting(meetingId);
    const [existing, viewer] = await Promise.all([this.d.recaps.findByMeetingId(meetingId), loadViewer(this.d, meeting, user.id)]);
    const rights = recapRights(viewer, existing);
    if (!rights.isEditor) throw this.denied(viewer);
    this.assertWritable(meeting);

    const [asset] = await this.assets.getMany([assetId]);
    if (!asset) throw new NotFoundError("Không tìm thấy tệp");
    if (asset.ownerId !== user.id || (asset.workspaceId && asset.workspaceId !== meeting.workspaceId)) throw new AppError("Tệp không thuộc quyền sử dụng của bạn", 403, ErrorCode.ASSET_005);
    if (asset.scope !== "MEETING") throw new AppError("Loại tệp không hợp lệ cho mục đích này", 415, ErrorCode.ASSET_001);
    if (asset.status !== "READY") throw new AppError("Tệp chưa xử lý xong", 409, ErrorCode.ASSET_003);

    const recap = existing ?? (await this.createFirst(meeting, user.id, { content: "" }));
    const already = (await this.assets.linkedAssetIds("MEETING_RECAP", recap.id)).includes(assetId);
    if (!already) {
      const max = (await this.limits()).attachmentsMax;
      await this.d.tx.run(async (tx) => {
        if (!(await this.d.recaps.adjustAttachments(tx, recap.id, 1, max))) throw meetError(ErrorCode.MEET_022, 409);
        await this.assets.attach(tx, { assetId, target: "MEETING_RECAP", targetId: recap.id, meetingId, actorId: user.id });
      });
    }
    return this.get(user, meetingId);
  }

  /** `DELETE /meetings/:id/recap/attachments/:assetId` — gỡ khỏi biên bản (asset mất hết link được `assets.cleanup` dọn theo lịch). */
  async detach(user: AuthUser, meetingId: string, assetId: string): Promise<RecapDto> {
    const meeting = await this.meeting(meetingId);
    const [recap, viewer] = await Promise.all([this.d.recaps.findByMeetingId(meetingId), loadViewer(this.d, meeting, user.id)]);
    const rights = recapRights(viewer, recap);
    if (!rights.isEditor) throw this.denied(viewer);
    this.assertWritable(meeting);
    if (!recap || !(await this.assets.linkedAssetIds("MEETING_RECAP", recap.id)).includes(assetId)) throw new NotFoundError("Không tìm thấy tệp đính kèm");
    await this.d.tx.run(async (tx) => {
      await this.assets.detach(tx, { assetId, target: "MEETING_RECAP", targetId: recap.id });
      await this.d.recaps.adjustAttachments(tx, recap.id, -1);
    });
    return this.get(user, meetingId);
  }

  /** `POST /meetings/:id/recap/publish` — chủ trì/đồng chủ trì; lần đầu → thẻ + push, công bố lại → chỉ sửa thẻ (sink outbox). */
  async publish(user: AuthUser, meetingId: string, dto: PublishRecapDto): Promise<RecapDto> {
    const meeting = await this.meeting(meetingId);
    const [recap, viewer] = await Promise.all([this.d.recaps.findByMeetingId(meetingId), loadViewer(this.d, meeting, user.id)]);
    const rights = recapRights(viewer, recap);
    if (!rights.canPublish) throw this.denied(viewer);
    this.assertWritable(meeting);
    if (!recap) throw meetError(ErrorCode.MEET_023, 400);
    const linked = await this.assets.linkedAssetIds("MEETING_RECAP", recap.id);
    if (isBlankRecap(recap.content) && linked.length === 0) throw meetError(ErrorCode.MEET_023, 400);

    const firstPublish = recap.publishedAt === null;
    const updated = await this.d.tx.run(async (tx) => {
      const u = await this.d.recaps.update(tx, meetingId, dto.expectedVersion, {
        publishedContent: recap.content,
        publishedAssetIds: linked,
        publishedAt: recap.publishedAt ?? this.d.now(),
        publishedBy: user.id,
        publishedVersion: dto.expectedVersion + 1,
      });
      if (!u) return null;
      await this.d.outbox.add(tx, meetingEvents.recapPublished({ meetingId, version: u.version, recapId: u.id, firstPublish, actorId: user.id }));
      return u;
    });
    if (!updated) throw new VersionConflictError((await this.d.recaps.findByMeetingId(meetingId))?.version ?? recap.version);
    await this.d.audit.record({ actorId: user.id, action: "meeting.recap-publish", targetType: "Meeting", targetId: meetingId, workspaceId: meeting.workspaceId, metadata: { recapId: updated.id, publishedVersion: updated.version, firstPublish } });
    return this.dto(meeting, updated, rights, true);
  }
}
