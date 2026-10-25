import type { AuthUser } from "../../../core/types/express";
import { ErrorCode } from "../../../core/utils/error.codes";
import { issueMediaToken, roomNames, type MediaTokenInput, type MediaTokenResult } from "../../../infrastructure/media";
import type { CallEntity, CallParticipantEntity, CallTokenResponse } from "../entities/call.interface";
import { callError, type CallScopeService } from "./call-scope.resolver";
import { isConnectedLike } from "./call-state.machine";

export type IssueTokenFn = (input: MediaTokenInput) => Promise<MediaTokenResult>;

/**
 * `CallTokenService` (be.md §5.8) — bọc `issueMediaToken` (p0-08). Điều kiện: participant `JOINING/CONNECTED/RECONNECTING`,
 * cuộc gọi chưa ENDED, quyền phạm vi còn hiệu lực. Token CHỈ để kết nối (TTL `limits.call.tokenTtlSeconds`); không
 * `roomAdmin`/`roomCreate` — host control đi qua REST → `IMediaServer`. `identity = userId` từ phiên server.
 */
export class CallTokenService {
  constructor(
    private readonly scopes: CallScopeService,
    private readonly issue: IssueTokenFn = issueMediaToken
  ) {}

  /** Nguồn publish của participant — `mutedByHost` bỏ MICROPHONE (be.md §5.8). */
  static publishOf(p: Pick<CallParticipantEntity, "publishPermissions" | "mutedByHost">) {
    return {
      audio: p.publishPermissions.audio && !p.mutedByHost,
      video: p.publishPermissions.video,
      screen: p.publishPermissions.screen,
    };
  }

  async issueFor(user: AuthUser, call: CallEntity, participant: CallParticipantEntity): Promise<CallTokenResponse> {
    if (call.status === "ENDED") throw callError(ErrorCode.CALL_005, 410, { endReason: call.endReason });
    if (!isConnectedLike(participant.state)) throw callError(ErrorCode.CALL_014, 403);
    if (!(await this.scopes.canStayInScope(user, call))) throw callError(ErrorCode.CALL_014, 403);
    // Kênh/nhóm đã lưu trữ: `channel.read` vẫn đúng (xem preview) nhưng KHÔNG cấp token mới (p2-03 be.md §3.4).
    if (call.scopeType === "CHANNEL" && !(await this.scopes.isChannelOpen(call.scopeId))) throw callError(ErrorCode.CALL_018, 409);

    const room = call.scopeType === "MEETING" ? call.livekitRoom : roomNames.call(call.id);
    const result = await this.issue({
      userId: user.id,
      displayName: user.name ?? "",
      room,
      publish: CallTokenService.publishOf(participant),
      metadata: { callId: call.id, role: participant.role },
    });
    return { token: result.token, livekitUrl: result.url, expiresAt: result.expiresAt };
  }
}
