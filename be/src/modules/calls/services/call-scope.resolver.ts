import { AppError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages, type ErrorCodeType } from "../../../core/utils/error.codes";
import { LIMITS } from "../../../core/constants/limits";
import {
  registerScopeResolver,
  type Action,
  type ResolvedAccess,
  type ScopeRef,
} from "../../../core/permission";
import type { AuthUser } from "../../../core/types/express";
import type { BlockPort } from "../../../shared/ports/block.port";
import { avatarUrlOf } from "../../../shared/media";
import { ROOM } from "../../../infrastructure/socket/socket.rooms";
import type { CallEntity, CallMediaKindValue, CallModeValue, CallScopeInfo, CallScopeTypeValue } from "../entities/call.interface";
import type { ICallRepository } from "../repositories/call.repository.interface";
import type { ICallScopeReader } from "../repositories/call-scope.reader";

export function callError(code: ErrorCodeType, status: 400 | 403 | 404 | 409 | 410 | 429 | 502 | 503, details?: unknown): AppError {
  return new AppError(ErrorMessages[code], status, code, details);
}

/** Cổng quyền tối thiểu (`permissionService` khớp) — tách để unit test không cần resolver thật. */
export interface CallPermissionPort {
  resolve(user: AuthUser, scope: ScopeRef): Promise<ResolvedAccess>;
  can(user: AuthUser, action: Action, scope: ScopeRef): Promise<boolean>;
}

/** Phần của `BlockPort` (`shared/ports`) mà đổ chuông cần — tách để unit test không cần Redis/DB thật. */
export type CallBlockPort = Pick<BlockPort, "filterNotificationRecipients">;

export interface CallScopeLimits {
  ringMaxInvitees: number;
  maxParticipants: number;
}

/** Kết quả kiểm phạm vi lúc tạo cuộc gọi (be.md §5.2 bước 2). */
export interface ResolvedCallScope {
  scopeType: CallScopeTypeValue;
  scopeId: string;
  workspaceId: string | null;
  mode: CallModeValue;
  kind: CallScopeInfo["kind"];
  title: string;
  /** Người được đổ chuông (≤ `ringMaxInvitees`). */
  ringIds: string[];
  /** Người chỉ nhận banner "Đang có cuộc gọi — Tham gia" (nhóm > trần). */
  silentIds: string[];
  maxParticipants: number;
  allowVideo: boolean;
}

/**
 * `CallScopeService` (be.md `call-scope.resolver.ts`): quyền + dữ kiện phạm vi của cuộc gọi. Quyền luôn qua
 * `PermissionService` (không tự đọc membership để quyết định) — reader chỉ cấp dữ kiện (loại hội thoại, trạng thái,
 * danh sách thành viên để chọn người đổ chuông).
 */
export class CallScopeService {
  constructor(
    private readonly reader: ICallScopeReader,
    private readonly permission: CallPermissionPort,
    private readonly limits: () => Promise<CallScopeLimits> = () =>
      Promise.resolve({ ringMaxInvitees: LIMITS.call.ringMaxInvitees, maxParticipants: LIMITS.call.maxParticipants }),
    /** p1-08: nhóm chat không đổ chuông người ĐÃ CHẶN người gọi. Không truyền ⇒ không lọc (unit test cũ); `calls.container.ts` truyền `BlockPort` thật. */
    private readonly blocks: CallBlockPort | null = null
  ) {}

  async resolveForCreate(user: AuthUser, scopeType: CallScopeTypeValue, scopeId: string, mediaKind: CallMediaKindValue): Promise<ResolvedCallScope> {
    if (scopeType === "MEETING") throw callError(ErrorCode.CALL_013, 400);
    if (scopeType === "CHANNEL") return this.resolveChannel(user, scopeId, mediaKind);
    return this.resolveConversation(user, scopeId);
  }

  private async resolveConversation(user: AuthUser, conversationId: string): Promise<ResolvedCallScope> {
    const access = await this.permission.resolve(user, { type: "CONVERSATION", id: conversationId });
    if (!access.visible) throw callError(ErrorCode.CALL_001, 404);
    const conv = await this.reader.getConversation(conversationId);
    if (!conv) throw callError(ErrorCode.CALL_001, 404);
    // `conversation.call.start` chỉ có khi hội thoại ACTIVE và còn nhắn được (DIRECT chưa chặn/không chỉ đọc, D-16).
    if (conv.status !== "ACTIVE" || !access.actions.has("conversation.call.start")) throw callError(ErrorCode.CALL_002, 403);
    if (conv.meetingId && (await this.reader.getMeetingStatus(conv.meetingId)) === "LIVE") {
      throw callError(ErrorCode.CALL_007, 409, { meetingId: conv.meetingId });
    }

    const limits = await this.limits();
    const members = (await this.reader.listConversationMembers(conversationId)).filter((m) => m.userId !== user.id);
    // Ưu tiên OWNER/ADMIN rồi người hoạt động gần nhất (`lastReadAt` giảm dần) khi vượt trần đổ chuông.
    const rank = { OWNER: 0, ADMIN: 1, MEMBER: 2 } as const;
    members.sort((a, b) => rank[a.role] - rank[b.role] || (b.lastReadAt?.getTime() ?? 0) - (a.lastReadAt?.getTime() ?? 0));
    // p1-08 (BLOCK-07): nhóm chat có người ĐÃ CHẶN người gọi → người đó KHÔNG được đổ chuông (không chiếm suất chuông, không push, không có
    // `CallParticipant`), chỉ còn banner "Đang có cuộc gọi — Tham gia" như người ngoài trần — tin trong nhóm vẫn hiển thị theo README p1-08 §2.
    // 1-1 không cần lọc: bị chặn ⇒ đã không có `conversation.call.start` (CALL_002, ở trên).
    const blockers = await this.blockersAmong(user.id, conv.kind, members.map((m) => m.userId));
    const ringable = members.filter((m) => !blockers.has(m.userId));
    const ringIds = ringable.slice(0, limits.ringMaxInvitees).map((m) => m.userId);
    const silentIds = [...ringable.slice(limits.ringMaxInvitees), ...members.filter((m) => blockers.has(m.userId))].map((m) => m.userId);

    let title = conv.title ?? "";
    if (conv.kind === "DIRECT") {
      const peer = ringIds[0];
      title = peer ? ((await this.reader.getUserProfiles([peer])).get(peer)?.name ?? "") : "";
    }
    return {
      scopeType: "CONVERSATION",
      scopeId: conversationId,
      workspaceId: conv.workspaceId,
      mode: "RING",
      kind: conv.kind,
      title,
      ringIds,
      silentIds,
      maxParticipants: limits.maxParticipants,
      allowVideo: true,
    };
  }

  /** Trong `candidateIds` (thành viên nhóm chat), những người đã chặn `callerId` (một chiều — người CHẶN mới được bảo vệ khỏi chuông). */
  private async blockersAmong(callerId: string, kind: CallScopeInfo["kind"], candidateIds: string[]): Promise<Set<string>> {
    if (kind !== "GROUP" || !this.blocks || candidateIds.length === 0) return new Set();
    const allowed = new Set(await this.blocks.filterNotificationRecipients(callerId, candidateIds));
    return new Set(candidateIds.filter((id) => !allowed.has(id)));
  }

  /**
   * Nhánh CHANNEL (p2-03 be.md §5.1): kênh phải thấy được (`channel.read`, không thấy → 404 `CALL_001`), là kênh VOICE (`CALL_013`),
   * kênh/workspace chưa lưu trữ (`CALL_018`). Trả phạm vi ROOM: không đổ chuông, trần chỗ = min(cấu hình kênh, `LIMITS.voice`).
   */
  async resolveChannel(user: AuthUser, channelId: string, _mediaKind: CallMediaKindValue): Promise<ResolvedCallScope> {
    const channel = await this.reader.getChannel(channelId);
    if (!channel || !(await this.permission.can(user, "channel.read", { type: "CHANNEL", id: channelId }))) throw callError(ErrorCode.CALL_001, 404);
    if (channel.type !== "VOICE") throw callError(ErrorCode.CALL_013, 400);
    if (!(await this.isChannelOpen(channelId, channel))) throw callError(ErrorCode.CALL_018, 409);
    const allowVideo = channel.voiceSettings?.allowVideo ?? true;
    return {
      scopeType: "CHANNEL",
      scopeId: channelId,
      workspaceId: channel.workspaceId,
      mode: "ROOM",
      kind: "CHANNEL",
      title: channel.name,
      ringIds: [],
      silentIds: [],
      maxParticipants: Math.min(channel.voiceSettings?.maxParticipants ?? LIMITS.voice.maxParticipants, LIMITS.voice.maxParticipants),
      allowVideo,
    };
  }

  /**
   * Kênh còn mở để ở trong phòng thoại: kênh VÀ nhóm cha đều ACTIVE (be.md §3.4). `channel.read` vẫn đúng với kênh đã lưu trữ
   * (xem preview chỉ đọc) nên KHÔNG đủ để chặn token/vào phòng — phải kiểm riêng. Không thấy kênh → `false`.
   */
  async isChannelOpen(channelId: string, known?: { status: string; workspaceId: string } | null): Promise<boolean> {
    const channel = known ?? (await this.reader.getChannel(channelId));
    if (!channel || channel.status !== "ACTIVE") return false;
    return (await this.reader.getWorkspaceStatus(channel.workspaceId)) === "ACTIVE";
  }

  /** Người dùng thấy được kênh (`channel.read`) — preview phòng thoại, kiểm ứng viên chủ phòng (p2-03). */
  canReadChannel(user: AuthUser, channelId: string): Promise<boolean> {
    return this.permission.can(user, "channel.read", { type: "CHANNEL", id: channelId });
  }

  /** Người dùng còn quyền ở lại phạm vi (token/join) — hội thoại: còn là thành viên ACTIVE (không đòi còn nhắn được). */
  async canStayInScope(user: AuthUser, call: Pick<CallEntity, "scopeType" | "scopeId">): Promise<boolean> {
    if (call.scopeType === "CONVERSATION") return this.permission.can(user, "conversation.read", { type: "CONVERSATION", id: call.scopeId });
    if (call.scopeType === "CHANNEL") return this.permission.can(user, "channel.read", { type: "CHANNEL", id: call.scopeId });
    return this.permission.can(user, "meeting.read", { type: "MEETING", id: call.scopeId });
  }

  /** OWNER/ADMIN nhóm chat được "Kết thúc cho mọi người" (be.md §6). */
  async isScopeAdmin(userId: string, call: Pick<CallEntity, "scopeType" | "scopeId">): Promise<boolean> {
    if (call.scopeType !== "CONVERSATION") return false;
    const role = await this.reader.getConversationMemberRole(call.scopeId, userId);
    return role === "OWNER" || role === "ADMIN";
  }

  /** Tiêu đề/ảnh/loại phạm vi trong DTO: DIRECT → tên + avatar người kia (góc nhìn `viewerId`); GROUP → ảnh nhóm chat; kênh/họp không có ảnh. */
  async scopeInfo(viewerId: string, call: Pick<CallEntity, "scopeType" | "scopeId" | "initiatorId">, otherUserIds: string[]): Promise<CallScopeInfo> {
    if (call.scopeType === "CONVERSATION") {
      const conv = await this.reader.getConversation(call.scopeId);
      if (!conv) return { title: "", avatarUrl: null, kind: "GROUP" };
      if (conv.kind === "DIRECT") {
        const peerId = otherUserIds.find((id) => id !== viewerId) ?? call.initiatorId;
        const peer = peerId === viewerId ? undefined : (await this.reader.getUserProfiles([peerId])).get(peerId);
        return { title: peer?.name ?? "", avatarUrl: peer?.avatarUrl ?? null, kind: "DIRECT" };
      }
      return { title: conv.title ?? "", avatarUrl: avatarUrlOf(conv.avatarAssetId), kind: "GROUP" };
    }
    if (call.scopeType === "CHANNEL") {
      const channel = await this.reader.getChannel(call.scopeId);
      return { title: channel?.name ?? "", avatarUrl: null, kind: "CHANNEL" };
    }
    return { title: "", avatarUrl: null, kind: "MEETING" };
  }
}

/**
 * Đăng ký resolver scope `CALL` vào `PermissionService` (be.md §6 "Room guard call"): participant tồn tại thì THẤY cuộc
 * gọi; `call.join` (vào room socket `call:{id}`) trừ khi đã DECLINED/MISSED/REMOVED/BUSY. Cache theo `permissionVersion`
 * → khi participant bị `REMOVED` phải `bumpVersion({ type: "CALL", id })` (xem `CallEndService.removeParticipant`).
 */
export function registerCallPermissionResolver(repo: Pick<ICallRepository, "findParticipant">): void {
  registerScopeResolver({
    type: "CALL",
    async resolve(user, callId): Promise<ResolvedAccess> {
      const p = await repo.findParticipant(callId, user.id);
      if (!p) return { visible: false, role: null, actions: new Set() };
      const actions = new Set<Action>();
      if (!["DECLINED", "MISSED", "REMOVED", "BUSY"].includes(p.state)) actions.add("call.join");
      if (["JOINING", "CONNECTED", "RECONNECTING"].includes(p.state)) {
        actions.add("call.leave");
        if (p.state !== "JOINING") actions.add("call.invite");
        if (p.role === "INITIATOR" || p.role === "HOST" || p.role === "CO_HOST") actions.add("call.end");
      }
      return { visible: true, role: p.role, actions };
    },
    roomsFor(callId) {
      return [ROOM.call(callId)];
    },
  });
}
