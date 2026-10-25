import { LIMITS } from "../../../core/constants/limits";
import { roomNames } from "../../../infrastructure/media";
import type { AdminCallListQueryDto, AdminMeetingListQueryDto } from "../dtos";
import type { AdminCallDetail, AdminCallRow, AdminMeetingDetail, AdminMeetingRow, CallRecord, MeetingRecord } from "../entities/admin-media.types";
import type { IMediaOpsCallReader, IMediaOpsMeetingReader } from "../repositories/media-ops-read.repository.interface";
import { callNotFound, meetingNotFound } from "./admin-media-errors";
import { toCallDetail, toCallRow, toMeetingDetail, toMeetingRow } from "./admin-media-redactor";

/** Tên các phòng LiveKit đang mở (cache ngắn) — `null` khi LiveKit chưa cấu hình/không trả lời (thì bỏ `roomActive`). */
export interface ActiveRoomsPort {
  names(): Promise<ReadonlySet<string> | null>;
}

const SESSIONS_MAX = 20;
const paging = (page: number, limit: number, total: number) => {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
};

/** Tên phòng LiveKit của một phiên: cuộc gọi `call_<id>`; họp `meet_<mã>` (phiên bắt đầu lại có hậu tố `_<8 ký tự cuối callId>`). */
function roomCandidates(c: CallRecord, meetingCode: string | undefined): string[] {
  if (c.scopeType !== "MEETING") return [roomNames.call(c.id)];
  if (!meetingCode) return [];
  const base = roomNames.meeting(meetingCode);
  return [base, `${base}_${c.id.slice(-8)}`];
}

/**
 * Danh sách + chi tiết cuộc họp/cuộc gọi cho admin (p2-07 be.md §5.2). Chỉ ĐỌC; mọi DTO dựng qua `AdminMediaRedactor`. Không audit (không thao tác ghi, không có nội dung riêng tư).
 */
export class AdminMediaQueryService {
  constructor(
    private readonly meetings: IMediaOpsMeetingReader,
    private readonly calls: IMediaOpsCallReader,
    private readonly rooms: ActiveRoomsPort
  ) {}

  // ── cuộc họp ────────────────────────────────────────────────────────────────

  private async meetingRows(records: MeetingRecord[]): Promise<AdminMeetingRow[]> {
    const ids = records.map((m) => m.id);
    const [aggs, recordings, workspaces, hosts] = await Promise.all([
      this.meetings.sessionAggs(ids),
      this.meetings.readyRecordingCounts(ids),
      this.meetings.workspaceNames(records.map((m) => m.workspaceId)),
      this.meetings.userNames(records.map((m) => m.hostId)),
    ]);
    return records.map((m) => toMeetingRow(m, aggs.get(m.id), recordings.get(m.id) ?? 0, { workspace: workspaces.get(m.workspaceId), host: hosts.get(m.hostId) }));
  }

  async listMeetings(q: AdminMeetingListQueryDto) {
    const { rows, total } = await this.meetings.listMeetings({ workspaceId: q.workspaceId, q: q.q, statuses: q.status, platform: q.platform, from: q.from, to: q.to, sort: q.sort, page: q.page, limit: q.limit });
    return { data: await this.meetingRows(rows), meta: paging(q.page, q.limit, total) };
  }

  async meetingDetail(id: string): Promise<AdminMeetingDetail> {
    const m = await this.meetings.findMeeting(id);
    if (!m) throw meetingNotFound();
    const [[row], sessions, recordings] = await Promise.all([this.meetingRows([m]), this.meetings.recentSessions(id, SESSIONS_MAX), this.meetings.recordingSummary(id)]);
    let current: { call: CallRecord; connectedCount: number; lockedAt: Date | null } | undefined;
    if (m.status === "LIVE" && m.currentCallId) {
      const call = sessions.find((c) => c.id === m.currentCallId) ?? (await this.calls.findCall(m.currentCallId));
      if (call && call.status !== "ENDED") current = { call, connectedCount: await this.meetings.connectedCount(call.id), lockedAt: m.lockedAt };
    }
    return toMeetingDetail(row, { sessions, current, recordings });
  }

  // ── cuộc gọi ────────────────────────────────────────────────────────────────

  async listCalls(q: AdminCallListQueryDto) {
    const { rows, total } = await this.calls.listCalls({
      workspaceId: q.workspaceId, meetingId: q.meetingId, scopeType: q.scopeType, mode: q.mode, mediaKind: q.mediaKind, statuses: q.status, endReasons: q.endReason,
      from: q.from, to: q.to, sort: q.sort, page: q.page, limit: q.limit,
    });
    const ctx = await this.calls.context(rows);
    return { data: rows.map((c): AdminCallRow => toCallRow(c, ctx)), meta: paging(q.page, q.limit, total) };
  }

  async callDetail(id: string): Promise<AdminCallDetail> {
    const call = await this.calls.findCall(id);
    if (!call) throw callNotFound();
    const [ctx, counts, setup, activeRooms] = await Promise.all([
      this.calls.context([call]),
      this.calls.participantCounts(id),
      this.calls.setupCounts(id, LIMITS.adminMedia.setupSuccessSeconds * 1000),
      call.status === "ENDED" ? Promise.resolve(null) : this.rooms.names(),
    ]);
    const row = toCallRow(call, ctx);
    const roomActive = activeRooms ? roomCandidates(call, row.meeting?.code).some((n) => activeRooms.has(n)) : undefined;
    return toCallDetail(row, counts, setup, roomActive);
  }
}
