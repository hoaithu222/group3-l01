import type {
  CallDto,
  CallEntity,
  CallHistoryItem,
  CallParticipantDto,
  CallParticipantEntity,
  CallScopeInfo,
  CallUserRef,
  MyCallActions,
} from "../entities/call.interface";
import { callIdToUuid } from "../../../core/utils/call-uuid";
import type { ICallScopeReader } from "../repositories/call-scope.reader";
import type { CallScopeService } from "./call-scope.resolver";
import { isConnectedLike, isOneToOne, isRingingLike } from "./call-state.machine";

export interface IncomingCallView {
  id: string;
  /** (p2-02) UUID v5 của `id` — cùng giá trị với `CallDto.callUuid` và `data.callUuid` của push. */
  callUuid: string;
  scopeType: CallEntity["scopeType"];
  scopeId: string;
  workspaceId: string | null;
  mediaKind: CallEntity["mediaKind"];
  mode: CallEntity["mode"];
  initiator: CallUserRef;
  scope: CallScopeInfo;
  participantsPreview: CallUserRef[];
  startedAt: string;
  version: number;
}

export interface ActionContext {
  isScopeMember: boolean;
  isScopeAdmin: boolean;
  maxParticipants: number;
}

const NO_ACTIONS: MyCallActions = {
  canAnswer: false,
  canDecline: false,
  canCancel: false,
  canJoin: false,
  canLeave: false,
  canEnd: false,
  canInvite: false,
};

/** `myActions` do SERVER tính (be.md §5.12) — client chỉ vẽ nút, không tự suy từ vai trò. */
export function computeMyActions(
  call: Pick<CallEntity, "status" | "mode" | "invitedCount" | "initiatorId"> & Partial<Pick<CallEntity, "hostId">>,
  participants: ReadonlyArray<Pick<CallParticipantEntity, "userId" | "state" | "role" | "firstJoinedAt">>,
  viewerId: string,
  ctx: ActionContext
): MyCallActions {
  if (call.status === "ENDED") return { ...NO_ACTIONS };
  const me = participants.find((p) => p.userId === viewerId);
  const activeCount = participants.filter((p) => isConnectedLike(p.state)).length;
  const oneToOne = isOneToOne(call);
  const othersConnected = participants.some((p) => p.userId !== call.initiatorId && (p.state === "JOINING" || p.state === "CONNECTED"));

  const ringing = !!me && isRingingLike(me.state);
  const connected = !!me && isConnectedLike(me.state);
  return {
    canAnswer: ringing,
    canDecline: ringing,
    canCancel: viewerId === call.initiatorId && call.status === "RINGING" && !othersConnected,
    canJoin: ctx.isScopeMember && me?.state !== "REMOVED" && !connected,
    canLeave: connected,
    // ROOM (phòng thoại kênh): chỉ chủ phòng kết thúc; vào phòng bằng `join`, không mời/đổ chuông.
    canEnd: call.mode === "ROOM" ? viewerId === call.hostId : oneToOne ? connected : viewerId === call.initiatorId || ctx.isScopeAdmin,
    canInvite: call.mode !== "ROOM" && !oneToOne && me?.state === "CONNECTED" && activeCount < ctx.maxParticipants,
  };
}

/** Dựng `CallDto`/`CallHistoryItem` (tên người dùng, tiêu đề phạm vi). `livekitRoom` KHÔNG bao giờ có trong DTO. */
export class CallDtoMapper {
  constructor(
    private readonly reader: ICallScopeReader,
    private readonly scopes: CallScopeService
  ) {}

  private participantDto(p: CallParticipantEntity, names: Map<string, { name: string; avatarUrl: string | null }>): CallParticipantDto {
    const profile = names.get(p.userId);
    return {
      userId: p.userId,
      name: profile?.name ?? "",
      avatarUrl: profile?.avatarUrl ?? null,
      role: p.role,
      state: p.state,
      handRaisedAt: p.handRaisedAt ? p.handRaisedAt.toISOString() : null,
      mutedByHost: p.mutedByHost,
      screenSharing: p.publishPermissions.screen,
      ringAckedAt: p.lastRingAckAt ? p.lastRingAckAt.toISOString() : null,
    };
  }

  async toDto(call: CallEntity, participants: CallParticipantEntity[], viewerId: string, ctx: ActionContext, now: Date): Promise<CallDto> {
    const profiles = await this.reader.getUserProfiles(participants.map((p) => p.userId).concat(call.initiatorId));
    const scope = await this.scopes.scopeInfo(
      viewerId,
      call,
      participants.map((p) => p.userId)
    );
    const initiator = profiles.get(call.initiatorId);
    return {
      id: call.id,
      callUuid: callIdToUuid(call.id),
      scopeType: call.scopeType,
      scopeId: call.scopeId,
      workspaceId: call.workspaceId,
      mode: call.mode,
      mediaKind: call.mediaKind,
      status: call.status,
      endReason: call.endReason,
      initiator: { id: call.initiatorId, name: initiator?.name ?? "", avatarUrl: initiator?.avatarUrl ?? null },
      hostId: call.hostId,
      scope,
      participants: participants.map((p) => this.participantDto(p, profiles)),
      startedAt: call.startedAt.toISOString(),
      answeredAt: call.answeredAt ? call.answeredAt.toISOString() : null,
      endedAt: call.endedAt ? call.endedAt.toISOString() : null,
      durationSec: call.durationSec,
      version: call.version,
      serverNow: now.toISOString(),
      myActions: computeMyActions(call, participants, viewerId, ctx),
    };
  }

  /** Bản rút gọn cho `call:incoming` (be.md §6): người gọi, phạm vi (theo góc nhìn người nhận), loại media, xem trước ≤ 3 người. */
  async toIncomingView(call: CallEntity, participants: CallParticipantEntity[], viewerId: string): Promise<IncomingCallView> {
    const profiles = await this.reader.getUserProfiles(participants.map((p) => p.userId).concat(call.initiatorId));
    const scope = await this.scopes.scopeInfo(viewerId, call, participants.map((p) => p.userId));
    const initiator = profiles.get(call.initiatorId);
    return {
      id: call.id,
      callUuid: callIdToUuid(call.id),
      scopeType: call.scopeType,
      scopeId: call.scopeId,
      workspaceId: call.workspaceId,
      mediaKind: call.mediaKind,
      mode: call.mode,
      initiator: { id: call.initiatorId, name: initiator?.name ?? "", avatarUrl: initiator?.avatarUrl ?? null },
      scope,
      participantsPreview: participants
        .filter((p) => p.userId !== viewerId && p.userId !== call.initiatorId)
        .slice(0, 3)
        .map((p) => ({ id: p.userId, name: profiles.get(p.userId)?.name ?? "", avatarUrl: profiles.get(p.userId)?.avatarUrl ?? null })),
      startedAt: call.startedAt.toISOString(),
      version: call.version,
    };
  }

  /** Lịch sử: 1 dòng/participant — `participantsPreview` ≤ 3 người còn lại của cuộc gọi. */
  async toHistoryItems(rows: CallParticipantEntity[], viewerId: string, callsById: Map<string, CallEntity>, previews: Map<string, string[]>): Promise<CallHistoryItem[]> {
    const allIds = [...new Set([...previews.values()].flat())];
    const profiles = await this.reader.getUserProfiles(allIds);
    const items: CallHistoryItem[] = [];
    for (const row of rows) {
      const call = callsById.get(row.callId);
      const previewIds = (previews.get(row.callId) ?? []).filter((id) => id !== viewerId).slice(0, 3);
      const preview: CallUserRef[] = previewIds.map((id) => ({ id, name: profiles.get(id)?.name ?? "", avatarUrl: profiles.get(id)?.avatarUrl ?? null }));
      items.push({
        callId: row.callId,
        scopeType: row.scopeType,
        scopeId: row.scopeId,
        scope: await this.scopes.scopeInfo(viewerId, { scopeType: row.scopeType, scopeId: row.scopeId, initiatorId: call?.initiatorId ?? viewerId }, previewIds),
        mediaKind: row.mediaKind,
        mode: row.mode,
        outcome: row.outcome,
        direction: call?.initiatorId === viewerId ? "OUTGOING" : "INCOMING",
        startedAt: row.callStartedAt.toISOString(),
        durationSec: call?.durationSec ?? null,
        participantsPreview: preview,
      });
    }
    return items;
  }
}
