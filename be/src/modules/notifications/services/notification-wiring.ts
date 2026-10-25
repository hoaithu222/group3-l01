import { LIMITS } from "../../../core/constants/limits";
import { MODULES } from "../../../core/constants/modules";
import { runtimeConfig } from "../../../core/config/runtime-config";
import { getResolver, permissionService, type Action, type ScopeType } from "../../../core/permission";
import { redis } from "../../../infrastructure/redis";
import { getPushSender } from "../../../infrastructure/push";
import { emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { isViewing } from "../../../infrastructure/socket/socket.viewing";
import { notificationFanoutDuration, pushSentTotal, pushSuppressedTotal } from "../../../infrastructure/metrics";
import { createDeviceService } from "../../devices/public";
import { getMessageScope } from "../../messages/public";
import { listThreadSubscribers } from "../../threads/public";
import { createUnreadService, invalidateUnreadSummary } from "../../read-state/public";
import type { MessageScopeType } from "../entities/message-notification.types";
import { PrismaFanoutRepository } from "../repositories/fanout.repository.prisma";
import { PrismaNotificationRepository } from "../repositories/notification.repository.prisma";
import { PrismaMessagePreferenceRepository } from "../repositories/message-preference.repository.prisma";
import { getNotificationBlockFilter } from "./block-filter.holder";
import { DeliveryPolicy } from "./delivery.policy";
import { FanoutService } from "./fanout.service";
import { FanoutEditService } from "./fanout-edit.service";
import type { FanoutDeps } from "./fanout.types";
import { MessagePushService, type MessagePushDeps } from "./message-push.service";
import { pendingKeys, PushDispatchService, type PendingInfo } from "./push-dispatch.service";
import { MessagePreferenceResolver } from "./preference-resolver.service";
import { messageDefaultsLoader } from "./notification-defaults";
import { STAT, fanoutBucketFor, recordStat } from "./notification-stats";
import { requireRegisteredMessageScope, requireRegisteredResolver } from "./runtime-guards";

/**
 * Composition root của pipeline thông báo tin nhắn (p1-07) — nối repository/cổng module khác vào service thuần.
 * Job file (`fanout-message.job.ts`, `message-push.jobs.ts`) chỉ gọi `getFanoutService()`… — không tự `new`.
 * Tiến trình worker riêng KHÔNG import `router.ts` nên mọi thứ ở đây tự dựng, không dựa registry của `router.ts`
 * ngoại trừ `getMessageScope()` (registry của `messages`, đăng ký bởi `registerChannelModule()`/
 * `registerConversationModule()`) và resolver quyền (`registerScopeResolver`) — hiện CHỈ được boot ở tiến trình API/`all`;
 * worker riêng chưa boot thì các chốt `runtime-guards.ts` ném lỗi to thay vì bỏ thông báo lặng lẽ (README p1-07 §10).
 */

const READ_ACTION: Record<MessageScopeType, Action> = { CHANNEL: "channel.read", CONVERSATION: "conversation.read" };
const PUSHED_TTL_SECONDS = 86_400;

export const messagePreferenceResolver = new MessagePreferenceResolver(new PrismaMessagePreferenceRepository(), messageDefaultsLoader);

async function blockersOf(authorId: string, userIds: string[]): Promise<Set<string>> {
  const allowed = new Set(await getNotificationBlockFilter().filterNotificationRecipients(authorId, userIds));
  return new Set(userIds.filter((u) => !allowed.has(u)));
}

const pushedKey = (messageId: string, userId: string): string => `push:sent:${messageId}:${userId}`;

const pushEnabled = (): Promise<boolean> => runtimeConfig.isFeatureEnabled(MODULES.PUSH);

let fanout: FanoutService | null = null;
let fanoutEdit: FanoutEditService | null = null;
let messagePush: MessagePushService | null = null;

function buildFanoutDeps(): FanoutDeps {
  return {
    repo: new PrismaFanoutRepository(),
    prefs: messagePreferenceResolver,
    async readers(scopeType, scopeId) {
      return requireRegisteredMessageScope(getMessageScope(scopeType), scopeType).readerIds(scopeId);
    },
    async threadSubscribers(threadId) {
      const ids: string[] = [];
      let cursor: string | null = null;
      do {
        const page = await listThreadSubscribers(threadId, cursor);
        ids.push(...page.data.map((s) => s.userId));
        cursor = page.nextCursor;
      } while (cursor && ids.length < LIMITS.thread.subscribersMax);
      return ids;
    },
    blockersOf,
    isViewing,
    wasPushed: (messageId, userId) => redis.exists(pushedKey(messageId, userId)),
    pushEnabled,
    dispatch: new PushDispatchService(),
    emitToUsers,
    invalidateSummary: invalidateUnreadSummary,
    record: {
      suppressed: (reason) => {
        pushSuppressedTotal.inc({ reason });
        void recordStat(STAT.suppressed(reason));
      },
      fanoutSeconds: (seconds) => {
        notificationFanoutDuration.observe(seconds);
        void recordStat(STAT.fanout(fanoutBucketFor(seconds)));
      },
      inboxCreated: (count) => void recordStat(STAT.inboxCreated, count),
    },
    chunkSize: LIMITS.notification.fanoutChunkSize,
  };
}

export function getFanoutService(): FanoutService {
  fanout ??= new FanoutService(buildFanoutDeps());
  return fanout;
}

export function getFanoutEditService(): FanoutEditService {
  fanoutEdit ??= new FanoutEditService(buildFanoutDeps());
  return fanoutEdit;
}

function buildMessagePushDeps(): MessagePushDeps {
  const devices = createDeviceService();
  const unread = createUnreadService();
  return {
    repo: new PrismaFanoutRepository(),
    prefs: messagePreferenceResolver,
    pushEnabled,
    async canReadScope(userId, scopeType, scopeId) {
      requireRegisteredResolver(getResolver(scopeType as ScopeType), scopeType);
      return permissionService.can({ id: userId, email: "" }, READ_ACTION[scopeType], {
        type: scopeType as ScopeType,
        id: scopeId,
      });
    },
    async hasBlockedAuthor(userId, authorId) {
      return (await blockersOf(authorId, [userId])).has(userId);
    },
    isViewing,
    getFcmTokens: (userId) => devices.getActiveFcmTokens(userId),
    async revokeTokens(tokens) {
      await devices.revokeTokens(tokens, "FCM_UNREGISTERED");
      void recordStat(STAT.invalidTokens, tokens.length);
    },
    sender: getPushSender,
    badgeFor: async (userId) => (await unread.summary(userId, { fresh: true })).badgeTotal,
    async markPushed(messageId, userId) {
      await redis.set(pushedKey(messageId, userId), "1", PUSHED_TTL_SECONDS);
    },
    async takePending(userId, scopeKey) {
      const keys = pendingKeys(userId, scopeKey);
      const [count, last] = await Promise.all([redis.getdel<number>(keys.count), redis.getdel<PendingInfo>(keys.last)]);
      return { count: Number(count) || 0, last: last ?? null };
    },
    record: {
      sent: (type, status) => {
        pushSentTotal.inc({ type, status });
        void recordStat(status === "sent" ? STAT.pushSent : STAT.pushFailed);
        if (status === "sent") void recordStat(STAT.byType(type));
      },
      suppressed: (reason) => {
        pushSuppressedTotal.inc({ reason });
        void recordStat(STAT.suppressed(reason));
      },
    },
  };
}

export function getMessagePushService(): MessagePushService {
  messagePush ??= new MessagePushService(buildMessagePushDeps());
  return messagePush;
}

let delivery: DeliveryPolicy | null = null;

/**
 * `DeliveryPolicy` cho `deliver.recipient` (loại thông báo do module khác ghi bằng `notify()`). Loại gắn với luồng chat
 * (CHANNEL/CONVERSATION) dùng CÙNG ma trận cài đặt + khoá "đang xem" Redis với push tin nhắn — mute/mention-only/DND
 * nhất quán giữa mọi loại; đọc "đang xem" qua Redis nên không cần `getIO()` (worker riêng vẫn cần boot registry quyền — xem trên).
 */
export function getDeliveryPolicy(): DeliveryPolicy {
  if (!delivery) {
    const scopeRepo = new PrismaFanoutRepository();
    delivery = new DeliveryPolicy(new PrismaNotificationRepository(), createDeviceService(), {
      chatPrefs: {
        loadScopeMeta: (scopeType, scopeId) => scopeRepo.loadScopeMeta(scopeType, scopeId),
        resolveOne: (scope, userId) => messagePreferenceResolver.resolveOne(scope, userId),
      },
      isViewing,
    });
  }
  return delivery;
}
