import type { AuthUser } from "../../../core/types/express";
import { ErrorCode } from "../../../core/utils/error.codes";
import type { MeetingEntity } from "../entities/meeting.interface";
import type { LobbyEntryDto } from "../entities/meeting-room.interface";
import { meetError, meetNotFound } from "./meeting-errors";
import type { MeetingRoomAccess } from "./meeting-room.access";
import type { MeetingRoomDeps } from "./meeting-room.deps";
import type { MeetingRoomSignals } from "./meeting-room.signals";

/**
 * Phòng chờ (lobby, be.md §5.2 + README §2 "Duyệt lobby"): hàng đợi ở Redis (`meet:lobby:<meetingId>`), MỌI quyết định nguyên tử bằng `HDEL`
 * (hai chủ trì cùng bấm "Cho vào" → đúng MỘT người nhận `admitted: true`, không lỗi — MR-05). Duyệt chỉ đặt cờ `meet:admitted:<callId>:<userId>`
 * (TTL 10 phút) + báo `meeting:lobby ADMITTED`; TOKEN vẫn chỉ cấp qua `join` nên quyền vào không thể "đi tắt" qua socket.
 */
export class MeetingLobbyService {
  constructor(
    private readonly d: MeetingRoomDeps,
    private readonly access: MeetingRoomAccess,
    private readonly signals: MeetingRoomSignals
  ) {}

  /** Cuộc họp LIVE + người thao tác là chủ trì/đồng chủ trì (lịch hoặc phiên). */
  private async hostCtx(user: AuthUser, meetingId: string): Promise<{ meeting: MeetingEntity; callId: string }> {
    const meeting = await this.d.repo.findById(meetingId);
    if (!meeting) throw meetNotFound();
    this.access.assertHostLike(await this.access.load(meeting, user.id));
    if (meeting.status !== "LIVE" || !meeting.currentCallId) throw meetError(ErrorCode.MEET_009, 409);
    return { meeting, callId: meeting.currentCallId };
  }

  async list(user: AuthUser, meetingId: string): Promise<LobbyEntryDto[]> {
    const meeting = await this.d.repo.findById(meetingId);
    if (!meeting) throw meetNotFound();
    this.access.assertHostLike(await this.access.load(meeting, user.id));
    if (meeting.status !== "LIVE") return [];
    return (await this.d.store.listLobby(meetingId)).map((e) => ({ userId: e.userId, displayName: e.displayName, requestedAt: e.requestedAt }));
  }

  async admit(user: AuthUser, meetingId: string, targetId: string): Promise<{ admitted: boolean }> {
    const { meeting, callId } = await this.hostCtx(user, meetingId);
    return { admitted: await this.admitOne(meeting, callId, targetId, user.id) };
  }

  async admitAll(user: AuthUser, meetingId: string): Promise<{ admittedUserIds: string[] }> {
    const { meeting, callId } = await this.hostCtx(user, meetingId);
    const admittedUserIds: string[] = [];
    for (const entry of await this.d.store.listLobby(meetingId)) {
      if (await this.admitOne(meeting, callId, entry.userId, user.id)) admittedUserIds.push(entry.userId);
    }
    return { admittedUserIds };
  }

  private async admitOne(meeting: MeetingEntity, callId: string, targetId: string, byUserId: string): Promise<boolean> {
    if (!(await this.d.store.removeLobby(meeting.id, targetId))) return false; // đã xử lý (chủ trì khác/người dùng tự huỷ)
    await this.d.store.setAdmitted(callId, targetId, byUserId);
    await this.signals.lobbyToRequester(meeting, "ADMITTED", targetId);
    await this.signals.lobbyToHosts(meeting, "CANCELLED", targetId, { reason: "ADMITTED" }); // chủ trì khác gỡ khỏi danh sách chờ
    return true;
  }

  /** Từ chối: chặn xin vào lại `deniedTtlSeconds` (chống spam) — hết hạn hoặc phiên mới thì xin lại được. */
  async deny(user: AuthUser, meetingId: string, targetId: string): Promise<{ denied: boolean }> {
    const { meeting, callId } = await this.hostCtx(user, meetingId);
    if (!(await this.d.store.removeLobby(meetingId, targetId))) return { denied: false };
    await this.d.store.setDenied(callId, targetId);
    await this.signals.lobbyToRequester(meeting, "DENIED", targetId);
    await this.signals.lobbyToHosts(meeting, "CANCELLED", targetId, { reason: "DENIED" });
    return { denied: true };
  }

  /** Người xin vào tự huỷ (`DELETE /lobby/me`) — idempotent, kể cả khi cuộc họp không còn LIVE. */
  async cancelMine(user: AuthUser, meetingId: string): Promise<void> {
    const meeting = await this.d.repo.findById(meetingId);
    if (!meeting) throw meetNotFound();
    if (await this.d.store.removeLobby(meetingId, user.id)) await this.signals.lobbyToHosts(meeting, "CANCELLED", user.id, { reason: "CANCELLED" });
  }
}
