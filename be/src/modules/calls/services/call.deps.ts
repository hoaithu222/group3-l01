import type { IMediaServer } from "../../../infrastructure/media";
import type { ICallRepository } from "../repositories/call.repository.interface";
import type { IOutboxPort, ITxRunner } from "../repositories/tx";
import type { ICallScopeReader } from "../repositories/call-scope.reader";
import type { CallRedisStore } from "./call-redis.store";
import type { CallDtoMapper } from "./call-dto.mapper";
import type { CallScopeService } from "./call-scope.resolver";
import type { CallTokenService } from "./call-token.service";

/** Việc nền do service yêu cầu ngoài outbox (không bắt buộc bền: recovery quét bù). */
export interface CallJobsPort {
  /** Đối soát với LiveKit sau `delayMs` (BullMQ `deduplication` gộp webhook dồn dập). */
  scheduleReconcile(callId: string, delayMs: number): Promise<void>;
  /** (p2-03) Failover chủ phòng ROOM sau `delayMs` (0 khi chủ rời chủ động). Tuỳ chọn để bản giả trong test cũ không phải khai. */
  scheduleHostFailover?(callId: string, version: number, delayMs: number): Promise<void>;
}

export interface CallRuntimeLimits {
  ringTimeoutSeconds: number;
  ringMaxInvitees: number;
  maxParticipants: number;
  reconnectGraceSeconds: number;
  staleRingGraceSeconds: number;
  joiningStaleSeconds: number;
}

/** Phụ thuộc chung của mọi service cuộc gọi (DI thủ công — `calls.container.ts`). */
export interface CallDeps {
  repo: ICallRepository;
  tx: ITxRunner;
  outbox: IOutboxPort;
  store: CallRedisStore;
  scopes: CallScopeService;
  tokens: CallTokenService;
  mapper: CallDtoMapper;
  reader: ICallScopeReader;
  /** Máy chủ media — lấy lười để test đổi `setMediaServerForTests` sau khi dựng container. */
  media: () => IMediaServer;
  jobs: CallJobsPort;
  limits: () => Promise<CallRuntimeLimits>;
  now: () => Date;
}
