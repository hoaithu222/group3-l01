import type { Prisma } from "@prisma/client";
import { withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { NotFoundError } from "../../../core/exceptions";
import { announceSystemMessageNow } from "../events/message-live-emit";
import { getMessageScope } from "../scope/message-scope.registry";
import { parseSystemPayload, type SystemMessageTypeWithPayload } from "../dtos/system-payload.schemas";
import type { IMessageRepository } from "../repositories/message.repository.interface";
import type { Message, MessageScopeTypeValue } from "../entities/message.interface";

export interface SystemMessagePostInput {
  scopeType: MessageScopeTypeValue;
  scopeId: string;
  workspaceId?: string | null;
  systemType: SystemMessageTypeWithPayload;
  payload: unknown;
  /** Định danh nghiệp vụ của người gọi (KHÔNG có tiền tố `s:`) — service tự thêm (be.md §5.7: `dedupeKey="s:"+dedupeKey`). */
  dedupeKey: string;
  actorId?: string;
}

/** (p2-06) Cập nhật TẠI CHỖ tin hệ thống đã đăng — cùng `dedupeKey` (không tiền tố `s:`) đã dùng khi `post()`. */
export interface SystemMessageUpdateInput {
  dedupeKey: string;
  systemType: SystemMessageTypeWithPayload;
  payload: unknown;
}

/**
 * Cổng để module khác (calls p2-01, meetings p2-04, conversations p1-05,
 * integrations p5-03) đăng tin hệ thống mà KHÔNG import `modules/messages`
 * trực tiếp — dùng qua `@modules/messages/public` (`createSystemMessageService()`),
 * đúng pattern "shared module service" đã có với `@modules/assets/public`
 * (`.claude/rules/architecture.md`) thay vì một registry get/set kiểu
 * `core/permission/ports.ts` — be.md §5.7 gọi đây "core interface
 * ISystemMessagePort" nhưng codebase này chưa có tiền lệ port-registry cho
 * SERVICE nghiệp vụ (khác hạ tầng socket/queue của `core/permission`), factory
 * qua `public.ts` đơn giản hơn và nhất quán với 3 ví dụ đã dùng
 * (assets/devices/notifications) — xem báo cáo cuối tác vụ.
 */
export interface ISystemMessagePort {
  post(input: SystemMessagePostInput, tx?: Prisma.TransactionClient): Promise<Message>;
}

/** be.md §5.7 — `SystemMessageService.post()`. `authorId=null`, `kind=SYSTEM`, không rate limit/mention/push (trừ notify() gọi riêng bởi module khác theo bảng be.md, không phải ở đây). */
export class SystemMessageService implements ISystemMessagePort {
  constructor(private readonly messageRepo: IMessageRepository) {}

  async post(input: SystemMessagePostInput, tx?: Prisma.TransactionClient): Promise<Message> {
    const validatedPayload = parseSystemPayload(input.systemType, input.payload);
    const scope = getMessageScope(input.scopeType);
    if (!scope) throw new NotFoundError();

    let createdNow = false;
    const run = async (t: Prisma.TransactionClient): Promise<Message> => {
      createdNow = false; // `withTransaction` có thể chạy lại closure khi WriteConflict
      const dedupeKey = `s:${input.dedupeKey}`;
      const existing = await this.messageRepo.findByDedupeKey(dedupeKey, t);
      if (existing) return existing;
      createdNow = true;

      const threadKey = "root";
      const seq = await this.messageRepo.nextSeq(t, input.scopeType, input.scopeId, threadKey);
      const created = await this.messageRepo.create(t, {
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        workspaceId: input.workspaceId ?? null,
        threadId: null,
        threadKey,
        seq,
        authorId: null,
        kind: "SYSTEM",
        systemType: input.systemType,
        systemPayload: validatedPayload as Record<string, unknown>,
        clientMessageId: null,
        dedupeKey,
        content: null,
        normalizedContent: null,
        mentions: [],
        attachments: [],
        links: [],
      });

      await scope.onMessageCommitted(t, input.scopeId, {
        messageId: created.id,
        threadKey,
        seq,
        createdAt: created.createdAt,
      });

      await outbox.add(t, {
        type: "message.created",
        aggregateType: "Message",
        aggregateId: created.id,
        queue: "notifications",
        jobName: "message.events",
        dedupeKey: `message.created:message:${created.id}`,
        payload: { event: "created", messageId: created.id },
      });

      return created;
    };

    if (tx) return run(tx);
    const message = await withTransaction(run);
    // Transaction do mình mở đã commit ⇒ phát realtime ngay (không đợi outbox → worker); `tx` của caller chưa commit nên để đường bền lo.
    if (createdNow) await announceSystemMessageNow(message);
    return message;
  }

  /**
   * (p2-06) Sửa `systemPayload` của tin hệ thống ĐÃ đăng tại chỗ — thẻ biên bản họp công bố lại, thẻ "cuộc họp đã bắt đầu" → "đã kết thúc" (không đăng tin
   * mới để chat không bị spam). `version + 1` và phát `message:updated` (kèm `systemType/systemPayload`) qua outbox `message.events`. Trả `null` khi tin
   * chưa có/đã bị gỡ — caller tự quyết định có `post()` hay không. KHÔNG nằm trong `ISystemMessagePort` (fake của module khác không phải cài thêm).
   */
  async updatePayload(input: SystemMessageUpdateInput, tx?: Prisma.TransactionClient): Promise<Message | null> {
    const validatedPayload = parseSystemPayload(input.systemType, input.payload) as Record<string, unknown>;
    const run = async (t: Prisma.TransactionClient): Promise<Message | null> => {
      const existing = await this.messageRepo.findByDedupeKey(`s:${input.dedupeKey}`, t);
      if (!existing || existing.kind !== "SYSTEM" || existing.systemType !== input.systemType || existing.deletedAt) return null;
      const updated = await this.messageRepo.updateSystemPayload(t, existing.id, validatedPayload);
      if (!updated) return null;
      await outbox.add(t, {
        type: "message.updated",
        aggregateType: "Message",
        aggregateId: existing.id,
        queue: "notifications",
        jobName: "message.events",
        dedupeKey: `message.updated:message:${existing.id}:v${updated.version}`,
        payload: { event: "updated", messageId: existing.id, reason: "SYSTEM_PAYLOAD" },
      });
      return { ...existing, systemPayload: validatedPayload, version: updated.version };
    };
    return tx ? run(tx) : withTransaction(run);
  }
}
