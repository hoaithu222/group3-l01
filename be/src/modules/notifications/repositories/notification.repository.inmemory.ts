import { randomBytes } from "crypto";
import { listNotificationTypes } from "../services/notification-types";
import type {
  INotificationRepository,
  ListInboxParams,
  MarkAllReadParams,
  NotificationRow,
  RecipientRow,
  RecipientWithNotification,
  UnreadCountResult,
  UpdateRecipientDeliveryInput,
} from "./notification.repository.interface";
import type {
  NotificationFilter,
  NotificationInboxItem,
  NotificationPreferenceEntity,
  PreferenceScope,
  UpsertPreferenceInput,
} from "../entities/notification.interface";

const notifications = new Map<string, NotificationRow & { dedupeKey: string }>();
const recipients = new Map<string, RecipientRow & { dedupeKey: string }>();
const preferences = new Map<string, NotificationPreferenceEntity>();

function nextId(): string {
  return randomBytes(12).toString("hex");
}

/** Bucket lọc suy từ registry (giống `notify()` ghi `filterBucket = def.inboxFilter`). */
function bucketOfType(type: string): string {
  return listNotificationTypes().find((d) => d.type === type)?.inboxFilter ?? "all";
}

function matchesFilter(r: { filterBucket?: string | null }, filter: NotificationFilter): boolean {
  return filter === "all" || r.filterBucket === filter;
}

function prefKey(userId: string, scope: string, scopeKey: string): string {
  return `${userId}:${scope}:${scopeKey}`;
}

/** In-memory — dùng cho test (unit của `NotificationService`/`DeliveryPolicy`). */
export class InMemoryNotificationRepository implements INotificationRepository {
  static clearStore(): void {
    notifications.clear();
    recipients.clear();
    preferences.clear();
  }

  /** Helper test — tạo trực tiếp Notification + Recipient mà không qua `notify()`/transaction thật. */
  static seed(input: {
    type: string;
    scopeType?: NotificationRow["scopeType"];
    scopeId?: string;
    workspaceId?: string;
    actorId?: string;
    refs?: Record<string, unknown>;
    recipientId: string;
    kind?: string;
    inInbox?: boolean;
    createdAt?: Date;
    filterBucket?: string;
    streamKey?: string;
    streamSeq?: number;
  }): { notificationId: string; recipientId: string } {
    const notificationId = nextId();
    const dedupeKey = nextId();
    notifications.set(notificationId, {
      id: notificationId,
      type: input.type,
      scopeType: input.scopeType ?? "NONE",
      scopeId: input.scopeId ?? null,
      workspaceId: input.workspaceId ?? null,
      actorId: input.actorId ?? null,
      refs: input.refs ?? null,
      dedupeKey,
    });
    const recipientRowId = nextId();
    recipients.set(recipientRowId, {
      id: recipientRowId,
      notificationId,
      recipientId: input.recipientId,
      kind: input.kind ?? "DEFAULT",
      inInbox: input.inInbox ?? true,
      scopeType: input.scopeType ?? "NONE",
      scopeId: input.scopeId ?? null,
      workspaceId: input.workspaceId ?? null,
      readAt: null,
      pushStatus: "NONE",
      createdAt: input.createdAt ?? new Date(),
      dedupeKey: nextId(),
      filterBucket: input.filterBucket ?? bucketOfType(input.type),
      streamKey: input.streamKey ?? null,
      streamSeq: input.streamSeq ?? null,
    });
    return { notificationId, recipientId: recipientRowId };
  }

  static getRecipientRow(id: string): RecipientRow | undefined {
    return recipients.get(id);
  }

  async listInbox(userId: string, params: ListInboxParams): Promise<{ data: NotificationInboxItem[]; hasMore: boolean }> {
    let rows = [...recipients.values()]
      .filter((r) => r.recipientId === userId && r.inInbox)
      .filter((r) => !params.unreadOnly || !r.readAt)
      .filter((r) => !params.workspaceId || r.workspaceId === params.workspaceId)
      .filter((r) => matchesFilter(r, params.filter))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));

    if (params.cursor) {
      const idx = rows.findIndex((r) => r.id === params.cursor);
      rows = idx >= 0 ? rows.slice(idx + 1) : rows;
    }

    const hasMore = rows.length > params.limit;
    const page = rows.slice(0, params.limit);

    return {
      hasMore,
      data: page.map((r) => {
        const n = notifications.get(r.notificationId)!;
        const skipReason = r.skipReason ?? null;
        const unavailable = skipReason === "REVOKED";
        return {
          id: r.id,
          type: n.type,
          kind: r.kind,
          scopeType: r.scopeType,
          scopeId: unavailable ? null : r.scopeId,
          workspaceId: r.workspaceId,
          actorId: unavailable ? null : n.actorId,
          refs: unavailable ? null : n.refs,
          createdAt: r.createdAt,
          readAt: r.readAt,
          muted: skipReason === "MUTED",
          unavailable,
        };
      }),
    };
  }

  async markRead(userId: string, recipientId: string): Promise<Date | null> {
    const r = recipients.get(recipientId);
    if (!r || r.recipientId !== userId || r.readAt) return null;
    r.readAt = new Date();
    return r.readAt;
  }

  async markAllRead(userId: string, params: MarkAllReadParams): Promise<number> {
    let count = 0;
    for (const r of recipients.values()) {
      if (r.recipientId !== userId || r.readAt || !r.inInbox) continue;
      if (r.createdAt > params.before) continue;
      if (params.workspaceId && r.workspaceId !== params.workspaceId) continue;
      if (!matchesFilter(r, params.filter)) continue;
      r.readAt = new Date();
      count++;
    }
    return count;
  }

  async unreadCount(userId: string, workspaceId?: string): Promise<UnreadCountResult> {
    const rows = [...recipients.values()].filter(
      (r) => r.recipientId === userId && r.inInbox && !r.readAt && (!workspaceId || r.workspaceId === workspaceId)
    );
    const countFor = (filter: NotificationFilter): number => rows.filter((r) => matchesFilter(r, filter)).length;
    return {
      total: rows.length,
      byFilter: {
        mentions: countFor("mentions"),
        following: countFor("following"),
        calls: countFor("calls"),
        meetings: countFor("meetings"),
      },
    };
  }

  async findRecipientWithNotification(notificationId: string, recipientId: string): Promise<RecipientWithNotification | null> {
    const r = [...recipients.values()].find((row) => row.notificationId === notificationId && row.recipientId === recipientId);
    if (!r) return null;
    const n = notifications.get(r.notificationId);
    if (!n) return null;
    return { recipient: { ...r }, notification: { ...n } };
  }

  async findRecipientsByIds(ids: string[]): Promise<RecipientWithNotification[]> {
    const out: RecipientWithNotification[] = [];
    for (const id of ids) {
      const r = recipients.get(id);
      if (!r) continue;
      const n = notifications.get(r.notificationId);
      if (!n) continue;
      out.push({ recipient: { ...r }, notification: { ...n } });
    }
    return out;
  }

  async updateRecipientDelivery(recipientId: string, input: UpdateRecipientDeliveryInput): Promise<void> {
    const r = recipients.get(recipientId);
    if (!r) return;
    if (input.pushStatus !== undefined) r.pushStatus = input.pushStatus;
    if (input.skipReason !== undefined) r.skipReason = input.skipReason;
    if (input.deliveredPushAt !== undefined) (r as { deliveredPushAt?: Date }).deliveredPushAt = input.deliveredPushAt;
  }

  async cancelPendingByScope(userIds: string[], scopeType: NotificationRow["scopeType"], scopeId: string): Promise<number> {
    let count = 0;
    for (const r of recipients.values()) {
      if (!userIds.includes(r.recipientId) || r.scopeType !== scopeType || r.scopeId !== scopeId) continue;
      if (r.pushStatus !== "PENDING") continue;
      r.pushStatus = "SKIPPED";
      r.skipReason = "REVOKED";
      count++;
    }
    return count;
  }

  async markReadByStream(
    userId: string,
    scopeType: NotificationRow["scopeType"],
    scopeId: string,
    streamKey: string,
    seq: number
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const r of recipients.values()) {
      if (r.recipientId !== userId || !r.inInbox || r.readAt) continue;
      if (r.scopeType !== scopeType || r.scopeId !== scopeId || r.streamKey !== streamKey) continue;
      if (r.streamSeq === null || r.streamSeq === undefined || r.streamSeq > seq) continue;
      r.readAt = new Date();
      ids.push(r.id);
    }
    return ids;
  }

  async cancelUnreadByScope(userIds: string[], scopeType: NotificationRow["scopeType"], scopeId: string, at: Date): Promise<number> {
    let count = 0;
    for (const r of recipients.values()) {
      if (!userIds.includes(r.recipientId) || r.scopeType !== scopeType || r.scopeId !== scopeId) continue;
      if (!r.inInbox || r.readAt) continue;
      r.inInbox = false;
      (r as { cancelledAt?: Date }).cancelledAt = at;
      count++;
    }
    return count;
  }

  async purgeExpired(before: Date): Promise<{ recipients: number; notifications: number }> {
    let removed = 0;
    for (const [id, r] of recipients) {
      const cancelledAt = (r as { cancelledAt?: Date }).cancelledAt;
      if ((r.readAt && r.readAt < before) || (cancelledAt && cancelledAt < before)) {
        recipients.delete(id);
        removed++;
      }
    }
    let orphans = 0;
    const used = new Set([...recipients.values()].map((r) => r.notificationId));
    for (const id of notifications.keys()) {
      if (!used.has(id)) {
        notifications.delete(id);
        orphans++;
      }
    }
    return { recipients: removed, notifications: orphans };
  }

  async getPreference(userId: string, scope: PreferenceScope, scopeKey: string): Promise<NotificationPreferenceEntity | null> {
    return preferences.get(prefKey(userId, scope, scopeKey)) ?? null;
  }

  async listPreferences(userId: string): Promise<NotificationPreferenceEntity[]> {
    return [...preferences.values()].filter((p) => p.userId === userId);
  }

  async upsertPreference(input: UpsertPreferenceInput): Promise<NotificationPreferenceEntity> {
    const key = prefKey(input.userId, input.scope, input.scopeKey);
    const existing = preferences.get(key);
    const entity: NotificationPreferenceEntity = {
      id: existing?.id ?? nextId(),
      userId: input.userId,
      scope: input.scope,
      scopeKey: input.scopeKey,
      mode: input.mode ?? existing?.mode ?? "INHERIT",
      mutedUntil: input.mutedUntil !== undefined ? input.mutedUntil : existing?.mutedUntil ?? null,
      dndUntil: input.dndUntil !== undefined ? input.dndUntil : existing?.dndUntil ?? null,
      quietHours: existing?.quietHours ?? null,
      lockScreenPreview: input.lockScreenPreview ?? existing?.lockScreenPreview ?? false,
      directMode: input.directMode !== undefined ? input.directMode : (existing?.directMode ?? null),
      groupMode: input.groupMode !== undefined ? input.groupMode : (existing?.groupMode ?? null),
      channelMode: input.channelMode !== undefined ? input.channelMode : (existing?.channelMode ?? null),
      lockScreenLevel: input.lockScreenLevel !== undefined ? input.lockScreenLevel : (existing?.lockScreenLevel ?? null),
      sound: input.sound !== undefined ? input.sound : (existing?.sound ?? null),
      updatedAt: new Date(),
    };
    preferences.set(key, entity);
    return entity;
  }
}
