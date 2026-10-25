import { LIMITS } from "../../../core/constants/limits";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode } from "../../../core/utils/error.codes";
import type { CallParticipantStateValue } from "../entities/call.interface";
import type { CallDeps } from "./call.deps";
import { callError } from "./call-scope.resolver";
import { isConnectedLike } from "./call-state.machine";

export type JoinBlockedReason = "FULL" | "REMOVED" | "ARCHIVED";

export interface VoicePreviewParticipant {
  userId: string;
  name: string;
  avatarUrl: string | null;
  isHost: boolean;
  /** QUYỀN phát mic/camera (chưa có snapshot track thật từ webhook `track_*` — xem be.md §5.8, "điểm lệch"). */
  micEnabled: boolean;
  cameraEnabled: boolean;
  handRaisedAt: string | null;
  sharingScreen: boolean;
}

export interface VoicePreview {
  channel: { id: string; name: string; voiceSettings: { allowVideo: boolean; maxParticipants: number } };
  call: { id: string; hostId: string | null; startedAt: string; version: number } | null;
  participants: VoicePreviewParticipant[];
  seatsLeft: number;
  limits: { maxParticipants: number; maxScreenShares: number };
  myActions: { canJoin: boolean; joinBlockedReason?: JoinBlockedReason };
  serverNow: string;
}

const SHOWN: readonly CallParticipantStateValue[] = ["CONNECTED", "RECONNECTING"];

/**
 * `VoicePreviewService` (p2-03 be.md §5.8) — `GET /channels/:id/voice`: ai đang trong phòng, còn bao nhiêu chỗ, tôi vào được
 * không. Chỉ đọc DB/Redis (không gọi LiveKit mỗi lần xem). Không thấy kênh → 404 `CALL_001` (trung tính, như kênh không tồn tại).
 */
export class VoicePreviewService {
  constructor(private readonly d: CallDeps) {}

  async preview(user: AuthUser, channelId: string): Promise<VoicePreview> {
    const channel = await this.d.reader.getChannel(channelId);
    if (!channel || !(await this.d.scopes.canReadChannel(user, channelId))) throw callError(ErrorCode.CALL_001, 404);
    if (channel.type !== "VOICE") throw callError(ErrorCode.CALL_013, 400);

    const allowVideo = channel.voiceSettings?.allowVideo ?? true;
    const maxParticipants = Math.min(channel.voiceSettings?.maxParticipants ?? LIMITS.voice.maxParticipants, LIMITS.voice.maxParticipants);
    const archived = channel.status !== "ACTIVE" || (await this.d.reader.getWorkspaceStatus(channel.workspaceId)) !== "ACTIVE";
    const base = {
      channel: { id: channel.id, name: channel.name, voiceSettings: { allowVideo, maxParticipants } },
      limits: { maxParticipants, maxScreenShares: LIMITS.voice.maxScreenShares },
      serverNow: this.d.now().toISOString(),
    };

    const empty: VoicePreview = {
      ...base,
      call: null,
      participants: [],
      seatsLeft: maxParticipants,
      myActions: archived ? { canJoin: false, joinBlockedReason: "ARCHIVED" } : { canJoin: true },
    };
    const [open] = await this.d.repo.findOpenByScope("CHANNEL", [channelId]);
    if (!open) return empty;

    const all = await this.d.repo.findParticipants(open.id);
    const occupied = all.filter((p) => isConnectedLike(p.state)).length;
    // Phiên còn trong DB nhưng không ai ở trong (chờ `emptyTimeout` tự đóng): coi như chưa có phòng — người vào sau mở phiên mới.
    if (occupied === 0) return empty;
    const shown = all.filter((p) => SHOWN.includes(p.state));
    const [profiles, holder] = await Promise.all([this.d.reader.getUserProfiles(shown.map((p) => p.userId)), this.d.store.peekScreen(open.id).catch(() => null)]);
    const me = all.find((p) => p.userId === user.id);

    let reason: JoinBlockedReason | undefined;
    if (me?.state === "REMOVED") reason = "REMOVED";
    else if (archived) reason = "ARCHIVED";
    else if (occupied >= maxParticipants && !(me && isConnectedLike(me.state))) reason = "FULL";

    return {
      ...base,
      call: { id: open.id, hostId: open.hostId, startedAt: open.startedAt.toISOString(), version: open.version },
      participants: shown
        .sort((a, b) => (a.firstJoinedAt?.getTime() ?? 0) - (b.firstJoinedAt?.getTime() ?? 0))
        .map((p) => ({
          userId: p.userId,
          name: profiles.get(p.userId)?.name ?? "",
          avatarUrl: profiles.get(p.userId)?.avatarUrl ?? null,
          isHost: open.hostId === p.userId,
          micEnabled: p.publishPermissions.audio && !p.mutedByHost,
          cameraEnabled: p.publishPermissions.video,
          handRaisedAt: p.handRaisedAt ? p.handRaisedAt.toISOString() : null,
          sharingScreen: holder === p.userId,
        })),
      seatsLeft: Math.max(0, maxParticipants - occupied),
      myActions: reason ? { canJoin: false, joinBlockedReason: reason } : { canJoin: true },
    };
  }
}
