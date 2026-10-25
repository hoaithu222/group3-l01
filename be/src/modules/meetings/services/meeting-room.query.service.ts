import type { AuthUser } from "../../../core/types/express";
import type { RoomSnapshotDto } from "../entities/meeting-room.interface";
import { meetNotFound } from "./meeting-errors";
import { isInRoom, type MeetingRoomAccess } from "./meeting-room.access";
import { roomRecordingState } from "./recording-state";
import type { MeetingRoomDeps } from "./meeting-room.deps";

/**
 * `GET /meetings/:id/room` (be.md §4 `RoomSnapshotDto`): ảnh chụp trạng thái phòng để app đồng bộ sau khi vào/reconnect — vai trò, khoá, giờ tự đóng, số người
 * chờ. Hình/tiếng trực tiếp lấy từ `Room` LiveKit cục bộ, KHÔNG từ đây. Chỉ người TRONG phòng hoặc chủ trì/đồng chủ trì thấy danh sách người tham gia;
 * người khác (đang chờ, chưa vào) chỉ nhận trạng thái chung.
 */
export class MeetingRoomQueryService {
  constructor(
    private readonly d: MeetingRoomDeps,
    private readonly access: MeetingRoomAccess
  ) {}

  async snapshot(user: AuthUser, meetingId: string): Promise<RoomSnapshotDto> {
    const meeting = await this.d.repo.findById(meetingId);
    if (!meeting) throw meetNotFound();
    const serverNow = this.d.now().toISOString();
    const base = { meetingId, status: meeting.status, lockedAt: meeting.lockedAt ? meeting.lockedAt.toISOString() : null, recording: null, version: meeting.version, serverNow };
    const call = meeting.status === "LIVE" && meeting.currentCallId ? await this.d.calls.findCall(meeting.currentCallId) : null;
    if (!call || call.status === "ENDED") return { ...base, callId: null, closingAt: null, myRole: null, participants: [], lobbyCount: 0 };

    const actor = await this.access.load(meeting, user.id);
    const canSeePeople = actor.scheduleHostLike || actor.sessionRole !== null;
    const [all, live, closingAt, recording] = await Promise.all([
      this.d.calls.listParticipants(call.id),
      canSeePeople ? this.d.media().listParticipants(call.livekitRoom).catch(() => []) : Promise.resolve([]),
      this.d.store.getClosingAt(call.id),
      canSeePeople ? roomRecordingState(this.d, call.id, user.id) : Promise.resolve(null),
    ]);
    const inRoom = canSeePeople ? all.filter(isInRoom) : [];
    const names = await this.d.dir.getUsers(inRoom.map((p) => p.userId));
    const hand = new Map(live.map((p) => [p.identity, p.attributes.handRaisedAt || null]));
    const joined = (at: Date | null, fallback: Date | null): string | null => (at ?? fallback)?.toISOString() ?? null;

    return {
      ...base,
      recording,
      callId: call.id,
      closingAt,
      myRole: actor.sessionRole,
      participants: inRoom
        .map((p) => ({
          userId: p.userId,
          name: names.get(p.userId)?.name ?? "",
          role: p.role,
          state: p.state,
          handRaisedAt: hand.get(p.userId) ?? null,
          mutedByHost: p.mutedByHost,
          joinedAt: joined(p.firstJoinedAt ?? p.lastJoinedAt, p.joiningAt),
        }))
        .sort((a, b) => (a.joinedAt ?? "").localeCompare(b.joinedAt ?? "")),
      lobbyCount: actor.isHostLike ? await this.d.store.lobbyCount(meetingId) : 0,
    };
  }
}
