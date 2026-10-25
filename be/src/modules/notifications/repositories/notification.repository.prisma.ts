import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { decodeCursor } from "../../../core/utils/cursor";
import type {
  INotificationRepository,
  ListInboxParams,
  MarkAllReadParams,
  RecipientWithNotification,
  UnreadCountResult,
  UpdateRecipientDeliveryInput,
} from "./notification.repository.interface";
import type {
  NotificationFilter,
  NotificationInboxItem,
  NotificationPreferenceEntity,
  NotificationPushStatus,
  NotificationScopeType,
  PreferenceScope,
  QuietHours,
  UpsertPreferenceInput,
} from "../entities/notification.interface";

/** `filterBucket` của người nhận (p1-07) — `all` không thêm điều kiện. */
function bucketWhere(filter: NotificationFilter): Prisma.NotificationRecipientWhereInput {
  return filter === "all" ? {} : { filterBucket: filter };
}

function mapPreference(record: {
  id: string;
  userId: string;
  scope: string;
  scopeKey: string;
  mode: string;
  mutedUntil: Date | null;
  dndUntil: Date | null;
  quietHours: unknown;
  lockScreenPreview: boolean;
  directMode: NotificationPreferenceEntity["directMode"];
  groupMode: NotificationPreferenceEntity["groupMode"];
  channelMode: NotificationPreferenceEntity["channelMode"];
  lockScreenLevel: NotificationPreferenceEntity["lockScreenLevel"];
  sound: boolean | null;
  updatedAt: Date;
}): NotificationPreferenceEntity {
  return {
    id: record.id,
    userId: record.userId,
    scope: record.scope as PreferenceScope,
    scopeKey: record.scopeKey,
    mode: record.mode as NotificationPreferenceEntity["mode"],
    mutedUntil: record.mutedUntil,
    dndUntil: record.dndUntil,
    quietHours: (record.quietHours as QuietHours | null) ?? null,
    lockScreenPreview: record.lockScreenPreview,
    directMode: record.directMode,
    groupMode: record.groupMode,
    channelMode: record.channelMode,
    lockScreenLevel: record.lockScreenLevel,
    sound: record.sound,
    updatedAt: record.updatedAt,
  };
}

function refString(refs: Record<string, unknown> | null, key: string): string | null {
  const v = refs?.[key];
  return typeof v === "string" ? v : null;
}

export class PrismaNotificationRepository implements INotificationRepository {
  async listInbox(
    userId: string,
    params: ListInboxParams
  ): Promise<{ data: NotificationInboxItem[]; hasMore: boolean }> {
    const decoded = params.cursor ? decodeCursor(params.cursor) : null;

    const rows = await prisma.notificationRecipient.findMany({
      where: {
        recipientId: userId,
        inInbox: true,
        ...bucketWhere(params.filter),
        ...(params.unreadOnly && { readAt: null }),
        ...(params.workspaceId && { workspaceId: params.workspaceId }),
        ...(decoded && {
          OR: [{ createdAt: { lt: decoded.at } }, { createdAt: decoded.at, id: { lt: decoded.id } }],
        }),
      },
      include: { notification: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: params.limit + 1,
    });

    const hasMore = rows.length > params.limit;
    const page = hasMore ? rows.slice(0, params.limit) : rows;

    return {
      hasMore,
      data: page.map((r) => {
        const unavailable = r.skipReason === "REVOKED";
        const refs = r.notification.refs as Record<string, unknown> | null;
        return {
          id: r.id,
          type: r.notification.type,
          kind: r.kind,
          scopeType: r.scopeType as NotificationScopeType,
          scopeId: unavailable ? null : r.scopeId,
          workspaceId: r.workspaceId,
          actorId: unavailable ? null : r.notification.actorId,
          refs: unavailable ? null : refs,
          threadId: unavailable ? null : refString(refs, "threadId"),
          messageId: unavailable ? null : refString(refs, "messageId"),
          createdAt: r.createdAt,
          readAt: r.readAt,
          muted: r.skipReason === "MUTED",
          unavailable,
        };
      }),
    };
  }

  async markRead(userId: string, recipientId: string): Promise<Date | null> {
    const readAt = new Date();
    const result = await prisma.notificationRecipient.updateMany({
      where: { id: recipientId, recipientId: userId, readAt: null },
      data: { readAt },
    });
    return result.count > 0 ? readAt : null;
  }

  async markAllRead(userId: string, params: MarkAllReadParams): Promise<number> {
    const result = await prisma.notificationRecipient.updateMany({
      where: {
        recipientId: userId,
        inInbox: true,
        readAt: null,
        createdAt: { lte: params.before },
        ...bucketWhere(params.filter),
        ...(params.workspaceId && { workspaceId: params.workspaceId }),
      },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  async unreadCount(userId: string, workspaceId?: string): Promise<UnreadCountResult> {
    // p1-07: đếm theo `readAt` (mục CHƯA ĐỌC) — trước đây dùng `seenAt` vốn không bao giờ được set nên
    // không giảm khi `markRead`. `filterBucket` thay cho tra `notification.type` (mục cùng Notification có thể khác lý do).
    const base: Prisma.NotificationRecipientWhereInput = {
      recipientId: userId,
      inInbox: true,
      readAt: null,
      ...(workspaceId && { workspaceId }),
    };
    const [total, mentions, following, calls, meetings] = await Promise.all([
      prisma.notificationRecipient.count({ where: base }),
      prisma.notificationRecipient.count({ where: { ...base, filterBucket: "mentions" } }),
      prisma.notificationRecipient.count({ where: { ...base, filterBucket: "following" } }),
      prisma.notificationRecipient.count({ where: { ...base, filterBucket: "calls" } }),
      prisma.notificationRecipient.count({ where: { ...base, filterBucket: "meetings" } }),
    ]);
    return { total, byFilter: { mentions, following, calls, meetings } };
  }

  async findRecipientWithNotification(notificationId: string, recipientId: string): Promise<RecipientWithNotification | null> {
    const row = await prisma.notificationRecipient.findFirst({
      where: { notificationId, recipientId },
      include: { notification: true },
    });
    return row ? this.mapRecipientWithNotification(row) : null;
  }

  async findRecipientsByIds(ids: string[]): Promise<RecipientWithNotification[]> {
    if (ids.length === 0) return [];
    const rows = await prisma.notificationRecipient.findMany({
      where: { id: { in: ids } },
      include: { notification: true },
    });
    return rows.map((r) => this.mapRecipientWithNotification(r));
  }

  async updateRecipientDelivery(recipientId: string, input: UpdateRecipientDeliveryInput): Promise<void> {
    await prisma.notificationRecipient.update({
      where: { id: recipientId },
      data: {
        ...(input.pushStatus !== undefined && { pushStatus: input.pushStatus }),
        ...(input.skipReason !== undefined && { skipReason: input.skipReason }),
        ...(input.deliveredPushAt !== undefined && { deliveredPushAt: input.deliveredPushAt }),
      },
    });
  }

  async cancelPendingByScope(userIds: string[], scopeType: NotificationScopeType, scopeId: string): Promise<number> {
    const result = await prisma.notificationRecipient.updateMany({
      where: { recipientId: { in: userIds }, scopeType, scopeId, pushStatus: "PENDING" },
      data: { pushStatus: "SKIPPED", skipReason: "REVOKED" },
    });
    return result.count;
  }

  async markReadByStream(
    userId: string,
    scopeType: NotificationScopeType,
    scopeId: string,
    streamKey: string,
    seq: number
  ): Promise<string[]> {
    const where: Prisma.NotificationRecipientWhereInput = {
      recipientId: userId,
      inInbox: true,
      readAt: null,
      scopeType,
      scopeId,
      streamKey,
      streamSeq: { not: null, lte: seq }, // `not: null`: so sánh thứ tự trên field optional khớp cả null (Prisma+Mongo)
    };
    const rows = await prisma.notificationRecipient.findMany({ where, select: { id: true }, take: 500 });
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    // `readAt: null` lặp lại trong where: hai marker song song không đánh dấu 2 lần.
    await prisma.notificationRecipient.updateMany({ where: { id: { in: ids }, readAt: null }, data: { readAt: new Date() } });
    return ids;
  }

  async cancelUnreadByScope(userIds: string[], scopeType: NotificationScopeType, scopeId: string, at: Date): Promise<number> {
    if (userIds.length === 0) return 0;
    const result = await prisma.notificationRecipient.updateMany({
      where: { recipientId: { in: userIds }, scopeType, scopeId, inInbox: true, readAt: null },
      data: { inInbox: false, cancelledAt: at },
    });
    return result.count;
  }

  async purgeExpired(before: Date): Promise<{ recipients: number; notifications: number }> {
    // ⚠️ Prisma+Mongo: `{ readAt: { lt: X } }` trên field optional KHỚP CẢ giá trị null (kiểm bằng integration test) —
    // nếu bỏ `not: null`, mục CHƯA đọc/CHƯA huỷ bị xoá nhầm. Luôn đi kèm `not: null` với so sánh thứ tự trên field optional.
    const [read, cancelled] = await Promise.all([
      prisma.notificationRecipient.deleteMany({ where: { readAt: { not: null, lt: before } } }),
      prisma.notificationRecipient.deleteMany({ where: { cancelledAt: { not: null, lt: before } } }),
    ]);
    const orphans = await prisma.notification.deleteMany({
      where: { createdAt: { lt: before }, recipients: { none: {} } },
    });
    return { recipients: read.count + cancelled.count, notifications: orphans.count };
  }

  async getPreference(userId: string, scope: PreferenceScope, scopeKey: string): Promise<NotificationPreferenceEntity | null> {
    const record = await prisma.notificationPreference.findUnique({
      where: { userId_scope_scopeKey: { userId, scope, scopeKey } },
    });
    return record ? mapPreference(record) : null;
  }

  async listPreferences(userId: string): Promise<NotificationPreferenceEntity[]> {
    const records = await prisma.notificationPreference.findMany({ where: { userId } });
    return records.map(mapPreference);
  }

  async upsertPreference(input: UpsertPreferenceInput): Promise<NotificationPreferenceEntity> {
    // Trường theo loại (p1-07): ghi null tường minh ở `create` (field "absent" ≠ null trong Prisma+Mongo).
    const typed = {
      ...(input.directMode !== undefined && { directMode: input.directMode }),
      ...(input.groupMode !== undefined && { groupMode: input.groupMode }),
      ...(input.channelMode !== undefined && { channelMode: input.channelMode }),
      ...(input.lockScreenLevel !== undefined && { lockScreenLevel: input.lockScreenLevel }),
      ...(input.sound !== undefined && { sound: input.sound }),
    };
    const record = await prisma.notificationPreference.upsert({
      where: { userId_scope_scopeKey: { userId: input.userId, scope: input.scope, scopeKey: input.scopeKey } },
      create: {
        userId: input.userId,
        scope: input.scope,
        scopeKey: input.scopeKey,
        mode: input.mode ?? "INHERIT",
        mutedUntil: input.mutedUntil,
        dndUntil: input.dndUntil,
        lockScreenPreview: input.lockScreenPreview ?? false,
        directMode: null,
        groupMode: null,
        channelMode: null,
        lockScreenLevel: null,
        sound: null,
        ...typed,
      },
      update: {
        ...(input.mode !== undefined && { mode: input.mode }),
        ...(input.mutedUntil !== undefined && { mutedUntil: input.mutedUntil }),
        ...(input.dndUntil !== undefined && { dndUntil: input.dndUntil }),
        ...(input.lockScreenPreview !== undefined && { lockScreenPreview: input.lockScreenPreview }),
        ...typed,
      },
    });
    return mapPreference(record);
  }

  private mapRecipientWithNotification(row: {
    id: string;
    notificationId: string;
    recipientId: string;
    kind: string;
    inInbox: boolean;
    scopeType: string;
    scopeId: string | null;
    workspaceId: string | null;
    readAt: Date | null;
    pushStatus: string;
    createdAt: Date;
    notification: {
      id: string;
      type: string;
      scopeType: string;
      scopeId: string | null;
      workspaceId: string | null;
      actorId: string | null;
      refs: unknown;
    };
  }): RecipientWithNotification {
    return {
      recipient: {
        id: row.id,
        notificationId: row.notificationId,
        recipientId: row.recipientId,
        kind: row.kind,
        inInbox: row.inInbox,
        scopeType: row.scopeType as NotificationScopeType,
        scopeId: row.scopeId,
        workspaceId: row.workspaceId,
        readAt: row.readAt,
        pushStatus: row.pushStatus as NotificationPushStatus,
        createdAt: row.createdAt,
      },
      notification: {
        id: row.notification.id,
        type: row.notification.type,
        scopeType: row.notification.scopeType as NotificationScopeType,
        scopeId: row.notification.scopeId,
        workspaceId: row.notification.workspaceId,
        actorId: row.notification.actorId,
        refs: (row.notification.refs as Record<string, unknown> | null) ?? null,
      },
    };
  }
}
