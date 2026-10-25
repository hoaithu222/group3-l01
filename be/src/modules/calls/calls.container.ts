import { runtimeConfig } from "../../core/config/runtime-config";
import { LIMITS } from "../../core/constants/limits";
import { permissionService } from "../../core/permission";
import { enqueue, toSafeJobId } from "../../infrastructure/queue";
import { logger } from "../../infrastructure/logger";
import { getLiveKit } from "../../infrastructure/media";
import { createSystemMessageService } from "../messages/public";
import { getBlockPort } from "../blocks/public";
import { PrismaCallRepository } from "./repositories/call.repository.prisma";
import { PrismaOutboxPort, PrismaTxRunner } from "./repositories/tx";
import { PrismaCallScopeReader, type ICallScopeReader } from "./repositories/call-scope.reader";
import type { ICallRepository } from "./repositories/call.repository.interface";
import type { IOutboxPort, ITxRunner } from "./repositories/tx";
import type { CallDeps, CallJobsPort, CallRuntimeLimits } from "./services/call.deps";
import { CallDtoMapper } from "./services/call-dto.mapper";
import { CallEndService } from "./services/call-end.service";
import { CallHostService } from "./services/call-host.service";
import { CallQueryService } from "./services/call-query.service";
import { CallReconcileService } from "./services/call-reconcile.service";
import { CallRecoveryService } from "./services/call-recovery.service";
import { CallRedisStore, NodeRedisCallPort, type CallRedisPort } from "./services/call-redis.store";
import { CallResponseService } from "./services/call-response.service";
import { CallRingAckService } from "./services/call-ring-ack.service";
import { CallRevocationService } from "./services/call-revocation.service";
import { CallRingService } from "./services/call-ring.service";
import { CallRoomInteractionService } from "./services/call-room-interaction.service";
import { CallRoomService } from "./services/call-room.service";
import { CallScopeService, type CallBlockPort } from "./services/call-scope.resolver";
import { CallSignalDispatcher, type CallEmitter, type ChannelAudienceFn, type NotifyFn } from "./services/call-signal.dispatcher";
import { CallSummaryService, type SystemMessagePoster } from "./services/call-summary.service";
import { CallTokenService, type IssueTokenFn } from "./services/call-token.service";
import { VoicePreviewService } from "./services/voice-preview.service";

/** Thời gian chờ tối đa khi xếp job — `queueConnection` treo vô hạn nếu Redis mất (xem `outbox.writer.ts`). */
const ENQUEUE_TIMEOUT_MS = 1000;

export class QueueCallJobs implements CallJobsPort {
  async scheduleReconcile(callId: string, delayMs: number): Promise<void> {
    try {
      await Promise.race([
        enqueue("calls", "call.reconcile", { callId }, {
          // BullMQ giữ job đã xong nên `jobId` cố định sẽ chặn mọi lần xếp sau → gắn mốc thời gian; `deduplication` mới là chỗ gộp.
          jobId: toSafeJobId(`call.reconcile:call:${callId}:${Date.now()}`),
          delay: delayMs,
          deduplication: { id: `call.reconcile:${callId}`, ttl: Math.max(delayMs, 1000) },
        }),
        new Promise<never>((_r, reject) => setTimeout(() => reject(new Error("enqueue call.reconcile quá hạn")), ENQUEUE_TIMEOUT_MS).unref()),
      ]);
    } catch (err) {
      // Không bắt buộc bền: recovery (cron 1 phút) quét bù các cuộc ACTIVE chưa đối soát.
      logger.warn("[calls] Không xếp được call.reconcile", { callId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  async scheduleHostFailover(callId: string, version: number, delayMs: number): Promise<void> {
    try {
      await Promise.race([
        enqueue("calls", "call.host-failover", { callId, version }, { jobId: toSafeJobId(`call.host-failover:call:${callId}:v${version}:${Date.now()}`), delay: delayMs, deduplication: { id: `call.host-failover:${callId}:v${version}`, ttl: Math.max(delayMs, 1000) } }),
        new Promise<never>((_r, reject) => setTimeout(() => reject(new Error("enqueue call.host-failover quá hạn")), ENQUEUE_TIMEOUT_MS).unref()),
      ]);
    } catch (err) {
      logger.warn("[calls] Không xếp được call.host-failover", { callId, error: err instanceof Error ? err.message : String(err) });
    }
  }
}

async function runtimeLimits(): Promise<CallRuntimeLimits> {
  const eff = await runtimeConfig.getEffective("limits.call");
  const num = (key: string, fallback: number): number => (typeof eff[key] === "number" ? eff[key] : fallback);
  return {
    ringTimeoutSeconds: num("ringTimeoutSeconds", LIMITS.call.ringTimeoutSeconds),
    ringMaxInvitees: num("ringMaxInvitees", LIMITS.call.ringMaxInvitees),
    maxParticipants: num("maxParticipants", LIMITS.call.maxParticipants),
    reconnectGraceSeconds: num("reconnectGraceSeconds", LIMITS.call.reconnectGraceSeconds),
    staleRingGraceSeconds: LIMITS.call.staleRingGraceSeconds,
    joiningStaleSeconds: LIMITS.call.joiningStaleSeconds,
  };
}

export interface CallsContainerOverrides {
  repo?: ICallRepository;
  tx?: ITxRunner;
  outbox?: IOutboxPort;
  reader?: ICallScopeReader;
  redisPort?: CallRedisPort;
  jobs?: CallJobsPort;
  limits?: () => Promise<CallRuntimeLimits>;
  now?: () => Date;
  issueToken?: IssueTokenFn;
  emitter?: CallEmitter;
  notify?: NotifyFn;
  /** (p2-03) Người đọc được kênh riêng tư — test thay bằng danh sách cố định (adapter `MessageScope` CHANNEL chỉ có khi `router.ts` boot). */
  channelAudience?: ChannelAudienceFn;
  systemMessages?: SystemMessagePoster;
  /** (p1-08) Cổng chặn người dùng — mặc định `getBlockPort()` (tra lười lúc tạo cuộc gọi nhóm); test truyền bản giả. */
  blocks?: CallBlockPort;
}

export interface CallsContainer {
  deps: CallDeps;
  ring: CallRingService;
  responses: CallResponseService;
  /** (p2-02) `POST /calls/:id/ack` — thiết bị xác nhận đang đổ chuông. */
  ringAck: CallRingAckService;
  ends: CallEndService;
  query: CallQueryService;
  reconcile: CallReconcileService;
  recovery: CallRecoveryService;
  dispatcher: CallSignalDispatcher;
  summary: CallSummaryService;
  revocation: CallRevocationService;
  /** (p2-03) phòng thoại kênh: tạo/vào/rời, host actions + failover, giơ tay/chia sẻ màn hình, preview. */
  rooms: CallRoomService;
  host: CallHostService;
  interaction: CallRoomInteractionService;
  preview: VoicePreviewService;
}

/** Dựng toàn bộ đồ thị phụ thuộc (DI thủ công) — dùng chung routes (API) và job (worker), như `getResourcesContainer()`. */
export function createCallsContainer(o: CallsContainerOverrides = {}): CallsContainer {
  const repo = o.repo ?? new PrismaCallRepository();
  const reader = o.reader ?? new PrismaCallScopeReader();
  const limits = o.limits ?? runtimeLimits;
  const scopes = new CallScopeService(
    reader,
    permissionService,
    async () => {
      const l = await limits();
      return { ringMaxInvitees: l.ringMaxInvitees, maxParticipants: l.maxParticipants };
    },
    o.blocks ?? { filterNotificationRecipients: (senderId, ids) => getBlockPort().filterNotificationRecipients(senderId, ids) }
  );
  const deps: CallDeps = {
    repo,
    tx: o.tx ?? new PrismaTxRunner(),
    outbox: o.outbox ?? new PrismaOutboxPort(),
    store: new CallRedisStore(o.redisPort ?? new NodeRedisCallPort()),
    scopes,
    tokens: new CallTokenService(scopes, o.issueToken),
    mapper: new CallDtoMapper(reader, scopes),
    reader,
    media: () => getLiveKit(),
    jobs: o.jobs ?? new QueueCallJobs(),
    limits,
    now: o.now ?? (() => new Date()),
  };
  const ends = new CallEndService(deps);
  const responses = new CallResponseService(deps, ends);
  const host = new CallHostService(deps, ends);
  const rooms = new CallRoomService(deps, ends, responses, host);
  const summary = new CallSummaryService(deps, o.systemMessages ?? createSystemMessageService());
  ends.summaryNow = (callId) => summary.post(callId);
  return {
    deps,
    ends,
    responses,
    ringAck: new CallRingAckService(deps),
    ring: new CallRingService(deps, ends, responses, rooms),
    rooms,
    host,
    interaction: new CallRoomInteractionService(deps),
    preview: new VoicePreviewService(deps),
    query: new CallQueryService(deps),
    reconcile: new CallReconcileService(deps, ends),
    recovery: new CallRecoveryService(deps, ends),
    dispatcher: new CallSignalDispatcher(deps, o.emitter, o.notify, o.channelAudience),
    summary,
    revocation: new CallRevocationService(deps, ends),
  };
}

let container: CallsContainer | null = null;

export function getCallsContainer(): CallsContainer {
  container ??= createCallsContainer();
  return container;
}

/** Test: thay container (`null` = dựng lại mặc định lần sau). */
export function setCallsContainerForTests(next: CallsContainer | null): void {
  container = next;
}
