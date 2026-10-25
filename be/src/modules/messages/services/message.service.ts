import { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { LIMITS } from "../../../core/constants/limits";
import { graphemeLength, normalizeSearch } from "../../../core/utils/normalize";
import {
  AppError,
  NotFoundError,
  ForbiddenError,
  ValidationError,
  VersionConflictError,
} from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { AuthUser } from "../../../core/types/express";
import { getMentionValidator, getThreadHook } from "../../../core/permission";
import { getMessageScope } from "../scope/message-scope.registry";
import type { MessageScope, MessageScopeViewerContext } from "../scope/message-scope.interface";
import { normalize as normalizeContent, extractLinks } from "./markdown-lite";
import { validateMentionsStructurally } from "./mention-validator";
import { toView, excerptOf, type ProjectionContext } from "./message-projection";
import { loadThreadSummaries } from "./thread-summary.loader";
import { loadSavedFlags } from "./saved-flag.loader";
import { loadPolls } from "./poll-view.loader";
import { emitMessageCreatedNow } from "../events/message-live-emit";
import { POLL_MESSAGE_DELETED_JOB } from "../../../shared/ports/message-poll-reader.port";
import { createAssetLinkService } from "../../assets/public";
import type { AssetLinkService } from "../../assets/public";
import type { IMessageRepository } from "../repositories/message.repository.interface";
import type { IReactionRepository } from "../repositories/reaction.repository.interface";
import type { IMessageHideRepository } from "../repositories/message-hide.repository.interface";
import type { MentionInputDto, SendMessageDto } from "../dtos/send-message.dto";
import type { EditMessageDto } from "../dtos/edit-message.dto";
import type { ListMessagesQueryDto } from "../dtos/list-messages.dto";
import { isUserAuthoredKind } from "../entities/message.interface";
import type {
  DeleteModeValue,
  Message,
  MessageAttachment,
  MessageMention,
  MessageScopeTypeValue,
  MessageView,
} from "../entities/message.interface";

export interface ListResult {
  data: MessageView[];
  cursor: {
    nextBeforeSeq: number | null;
    nextAfterSeq: number | null;
    hasMoreBefore: boolean;
    hasMoreAfter: boolean;
    limit: number;
  };
  anchorMessageId?: string;
}

export interface SendResult {
  view: MessageView;
  replayed: boolean;
}

/** Tuỳ chọn của `send()` cho module khác gửi tin thay người dùng (`IMessageSendPort`, p7-04) — REST thường không dùng. */
export interface SendOptions {
  /** `POLL`: tin khảo sát (`content` = câu hỏi). Mặc định `USER`. */
  kind?: "USER" | "POLL";
  /** Chạy TRONG transaction ghi tin, sau khi `Message` đã tạo và tệp đã gắn; ném lỗi ⇒ rollback cả tin. Không chạy khi replay idempotent. */
  onCreated?: (tx: Prisma.TransactionClient, message: Message) => Promise<void>;
}

/** Phần "thân" của tin đã kiểm/chuẩn hoá (bước 4–7 của `send()`): dùng chung cho gửi thật và `validateDraft` (hẹn giờ) để hai đường luôn cùng luật. */
interface PreparedBody {
  attachments: MessageAttachment[];
  mentions: MessageMention[];
  mentionUserIds: string[];
  mentionAll: boolean;
  textForSearch: string | undefined;
  replyPreview: Message["replyPreview"];
  links: ReturnType<typeof extractLinks>;
}

/** Kết quả bước 2 của `send()`: nội dung đã chuẩn hoá (đã kiểm độ dài/trống/số tệp). */
type NormalizedText = { hasContent: true; text: string } | { hasContent: false; text: string | undefined };

/** Phần bản nháp mà `prepareBody`/`validateDraft` cần (không có `clientMessageId`/thread). */
type DraftDto = Pick<SendMessageDto, "content" | "attachments" | "mentions" | "replyToId">;

function requireScope(scopeType: MessageScopeTypeValue): MessageScope {
  const scope = getMessageScope(scopeType);
  if (!scope) throw new NotFoundError();
  return scope;
}

/**
 * `withTransaction()` (`infrastructure/database/transaction.ts`) đã tự retry
 * P2034 ("write conflict") tối đa 5 lần + backoff nhỏ — ĐỦ cho phần lớn xung
 * đột ghi 1 field (CAS đơn giản) nhưng KHÔNG đủ cho transaction `send()`
 * (chạm CẢ `Counter` + `Message` + `Channel.lastSeq` + `OutboxEvent` trong 1
 * transaction, diện xung đột rộng hơn hẳn) khi nhiều người gửi tin CÙNG lúc
 * vào CÙNG 1 scope — phát hiện qua test MSG-01 (be.md README §8, 10-24
 * request song song vào 1 kênh): vẫn còn request 500 `SYS_500` (P2034
 * KHÔNG được `send()`/`sendForward()` bắt lại, khác `P2002`) dù
 * `withTransaction` đã retry hết 5 lần nội bộ. Bọc thêm 1 lớp retry NGOÀI
 * (bounded, AN TOÀN để lặp lại — cùng `dedupeKey`/tham số, transaction trước
 * đó đã abort sạch hoàn toàn khi P2034) ngay tại đây (module `messages`)
 * thay vì tăng `MAX_RETRIES` dùng chung cho MỌI transaction trong
 * `transaction.ts` (rủi ro tác động rộng hơn phạm vi tác vụ này).
 */
async function withWriteConflictRetry<T>(fn: () => Promise<T>): Promise<T> {
  const EXTRA_ATTEMPTS = 4;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      const isWriteConflict =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
      if (!isWriteConflict || attempt >= EXTRA_ATTEMPTS) throw err;
      await new Promise((resolve) =>
        setTimeout(resolve, 15 * (attempt + 1) + Math.floor(Math.random() * 25))
      );
    }
  }
}

/** be.md §5.1/§5.2/§5.3/§5.4 — engine gửi/đọc/sửa/thu hồi, hoàn toàn không biết CHANNEL/CONVERSATION là gì (chỉ gọi qua `MessageScope`). */
export class MessageService {
  constructor(
    private readonly messageRepo: IMessageRepository,
    private readonly reactionRepo: IReactionRepository,
    private readonly hideRepo: IMessageHideRepository,
    private readonly assetLinkService: AssetLinkService = createAssetLinkService()
  ) {}

  async send(
    user: AuthUser,
    scopeType: MessageScopeTypeValue,
    scopeId: string,
    dto: SendMessageDto,
    opts: SendOptions = {}
  ): Promise<SendResult> {
    const scope = requireScope(scopeType);
    const access = await scope.canWrite(user, scopeId);
    if (!access.visible) throw new NotFoundError();
    if (!access.allowed)
      throw new AppError(ErrorMessages[ErrorCode.MSG_004], 403, ErrorCode.MSG_004);

    // ── 2. Chuẩn hoá nội dung ──────────────────────────────────────────────
    const normalizedDraft = this.normalizeDraftText(dto);
    const { text: normalizedText, hasContent } = normalizedDraft;

    // Ngữ cảnh người xem (quyền/hiddenBeforeSeq) chỉ phụ thuộc scope + user — chạy SONG SONG với các bước dưới thay vì nối đuôi sau transaction (tiết kiệm 1–2 vòng DB trên đường trả lời).
    const viewerCtxPromise = scope.viewerContext(user, scopeId);
    viewerCtxPromise.catch(() => undefined); // send() có thể thoát sớm (replay/lỗi) — tránh unhandled rejection

    // ── 3. Idempotency sớm ─────────────────────────────────────────────────
    // Tra trùng và kiểm thân tin (tệp/mention/trả lời — CHUNG với `validateDraft` (tin hẹn giờ, p7-04) nên hai đường luôn cùng luật) là hai truy vấn ĐỘC LẬP → chạy song song.
    // Replay thắng: kết quả/lỗi của `prepareBody` bị bỏ (đúng như trước — replay không bao giờ chạm bước 4–7).
    const dedupeKey = `u:${user.id}:${dto.clientMessageId}`;
    const [existingRes, preparedRes] = await Promise.allSettled([
      this.messageRepo.findByDedupeKey(dedupeKey),
      this.prepareBody(user, scopeType, scopeId, scope, dto, normalizedDraft),
    ]);
    if (existingRes.status === "rejected") throw existingRes.reason;
    const existing = existingRes.value;
    if (existing) {
      if (existing.scopeType !== scopeType || existing.scopeId !== scopeId) {
        throw new ValidationError("clientMessageId đã dùng cho một cuộc trò chuyện khác");
      }
      return { view: await this.toViewFor(user, existing, scope), replayed: true };
    }
    if (preparedRes.status === "rejected") throw preparedRes.reason;
    const { attachments, mentions, mentionUserIds, mentionAll, textForSearch, replyPreview, links } = preparedRes.value;

    const threadKey = dto.threadRootId ?? "root";

    // ── p1-06 Thread — `IThreadHook.assertThreadable()` TRƯỚC transaction
    // khi đã đăng ký qua `registerThreadHook()` (`modules/threads/index.ts`).
    // CHƯA đăng ký → giữ NGUYÊN hành vi p1-04 cũ: `threadRootId` được chấp
    // nhận + lưu vào `Message.threadId`/`threadKey` KHÔNG kiểm tra gì thêm,
    // không side-effect reply-count (backward-compat cho test cũ — xem
    // docstring `sendMessageSchema.threadRootId`).
    const threadHook = getThreadHook();
    let threadRootForHook: Message | null = null;
    if (dto.threadRootId && threadHook) {
      threadRootForHook = await this.messageRepo.findById(dto.threadRootId);
      await threadHook.assertThreadable({
        root: threadRootForHook
          ? {
              id: threadRootForHook.id,
              scopeType: threadRootForHook.scopeType,
              scopeId: threadRootForHook.scopeId,
              authorId: threadRootForHook.authorId,
              threadId: threadRootForHook.threadId,
              deletedAt: threadRootForHook.deletedAt,
              kind: threadRootForHook.kind,
            }
          : null,
        replyScopeType: scopeType,
        replyScopeId: scopeId,
      });
    }

    // ── 8. Transaction ─────────────────────────────────────────────────────
    let message: Message;
    try {
      message = await withWriteConflictRetry(() =>
        withTransaction(async (tx) => {
          const seq = await this.messageRepo.nextSeq(tx, scopeType, scopeId, threadKey);
          const created = await this.messageRepo.create(tx, {
            scopeType,
            scopeId,
            workspaceId: access.workspaceId,
            threadId: dto.threadRootId ?? null,
            threadKey,
            seq,
            authorId: user.id,
            kind: opts.kind ?? "USER",
            clientMessageId: dto.clientMessageId,
            dedupeKey,
            content: hasContent ? normalizedText : null,
            // `textForSearch` (p1-06 `MentionService.validate()`, marker →
            // `@label`) thay cho content thô khi có — tìm theo tên lúc gửi
            // thay vì marker `@{u:id}`. Không có validator thật đăng ký →
            // `textForSearch` undefined, giữ hành vi cũ (content thô).
            normalizedContent: hasContent ? normalizeSearch(textForSearch ?? normalizedText) : null,
            mentions,
            attachments,
            links,
            replyToId: dto.replyToId ?? null,
            replyPreview,
          });

          if (attachments.length > 0) {
            await this.assetLinkService.attach(tx, {
              assetIds: attachments.map((a) => a.assetId),
              targetType: "MESSAGE",
              targetId: created.id,
              scopeType,
              scopeId,
              actorId: user.id,
              freshTarget: true,
            });
          }

          // p7-04 — bảng phụ của tin (vd `Poll` của tin khảo sát) ghi CÙNG transaction: lỗi ⇒ rollback cả tin.
          if (opts.onCreated) await opts.onCreated(tx, created);

          // ── p1-06 Thread — `IThreadHook.onReplyCreated()` TRONG CÙNG
          // transaction, SAU khi `Message` đã tạo (be.md §5.3 bước 2). Không
          // đăng ký hook / không phải reply → bỏ qua hoàn toàn (hành vi p1-04
          // cũ, backward-compat).
          let threadInfo: { threadId: string; isFirstReply: boolean; parentAuthorId: string | null } | null = null;
          if (dto.threadRootId && threadHook && threadRootForHook) {
            threadInfo = await threadHook.onReplyCreated(
              tx,
              {
                id: created.id,
                seq,
                createdAt: created.createdAt,
                authorId: user.id,
                workspaceId: created.workspaceId,
              },
              {
                id: threadRootForHook.id,
                scopeType: threadRootForHook.scopeType,
                scopeId: threadRootForHook.scopeId,
                authorId: threadRootForHook.authorId,
                threadId: threadRootForHook.threadId,
                deletedAt: threadRootForHook.deletedAt,
                kind: threadRootForHook.kind,
              }
            );
          }

          if (threadKey === "root") {
            await scope.onMessageCommitted(tx, scopeId, {
              messageId: created.id,
              threadKey,
              seq,
              createdAt: created.createdAt,
              // Adapter khỏi đọc lại tin vừa tạo trong transaction (1 vòng DB thừa).
              authorId: created.authorId,
              mentions: created.mentions,
            });
          }

          await outbox.add(tx, {
            type: "message.created",
            aggregateType: "Message",
            aggregateId: created.id,
            queue: "notifications",
            jobName: "message.events",
            dedupeKey: `message.created:message:${created.id}`,
            payload: {
              event: "created",
              messageId: created.id,
              // p1-06 be.md §5.4 — hợp đồng outbox bổ sung cho p1-07 (chưa
              // build, chưa có consumer nào đọc field dưới đây ngoài field
              // `event`/`messageId` cũ mà `message.outbox-handlers.ts` dùng).
              scopeType,
              scopeId,
              threadId: dto.threadRootId ?? null,
              authorId: user.id,
              mentionUserIds,
              mentionAll,
              ...(threadInfo?.isFirstReply && { isFirstReply: true }),
              ...(threadInfo?.parentAuthorId && { parentAuthorId: threadInfo.parentAuthorId }),
              kind: opts.kind ?? "USER",
            },
          });

          // p1-07 be.md §7 — consumer THỨ HAI của `message.created`: `registerJob` chỉ giữ MỘT processor cho mỗi
          // cặp (queue, jobName) nên KHÔNG dùng lại `message.events`; ghi thêm 1 dòng outbox riêng cùng
          // transaction (mẫu `membership-lifecycle.service.ts`) → job `fanout.message` (mục hộp thư + push).
          await outbox.add(tx, {
            type: "message.fanout",
            aggregateType: "Message",
            aggregateId: created.id,
            queue: "notifications",
            jobName: "fanout.message",
            dedupeKey: `fanout.message:message:${created.id}`,
            payload: {
              messageId: created.id,
              mentionUserIds,
              mentionAll,
              ...(threadInfo?.isFirstReply && { isFirstReply: true }),
              ...(threadInfo?.parentAuthorId && { parentAuthorId: threadInfo.parentAuthorId }),
            },
          });

          // p3-04 `@role`: tập người nhận theo VAI TRÒ khác tập `mentionUserIds` (nhận `MENTION_ROLE`, giải ở job riêng
          // `modules/mentions/jobs/role-mention-fanout.job.ts`) → dòng outbox riêng, chỉ khi tin có mention ROLE.
          if (mentions.some((m) => m.type === "ROLE")) {
            await outbox.add(tx, {
              type: "message.fanout-role",
              aggregateType: "Message",
              aggregateId: created.id,
              queue: "notifications",
              jobName: "fanout.message-role",
              dedupeKey: `fanout.message-role:message:${created.id}`,
              payload: { messageId: created.id },
            });
          }

          return created;
        })
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const replay = await this.messageRepo.findByDedupeKey(dedupeKey);
        if (replay) return { view: await this.toViewFor(user, replay, scope), replayed: true };
      }
      throw err;
    }

    // Đẩy realtime ngay (không chờ outbox → worker); phát TRƯỚC khi dựng view trả lời để người khác không phải chờ thêm truy vấn của người gửi.
    emitMessageCreatedNow(message);

    return { view: await this.toViewFor(user, message, scope, false, await viewerCtxPromise), replayed: false };
  }

  /**
   * be.md §5.6 bước 2 — biến thể của `send()` dùng RIÊNG bởi
   * `MessageForwardService`: không kiểm nội dung trống/độ dài lại (nguồn đã
   * qua kiểm khi gửi lần đầu), không copy mentions/replyTo, tệp tái sử dụng
   * NGUYÊN VẸN metadata của nguồn (không dò lại MIME/asset ownership —
   * `assetLinkService.attach(..., allowForeignReadable: true)` tự kiểm
   * người chuyển ĐỌC ĐƯỢC asset qua link của tin nguồn).
   */
  async sendForward(
    user: AuthUser,
    scopeType: MessageScopeTypeValue,
    scopeId: string,
    input: {
      clientMessageId: string;
      content: string | null;
      attachments: MessageAttachment[];
      forwardedFrom: NonNullable<Message["forwardedFrom"]>;
    }
  ): Promise<SendResult> {
    const scope = requireScope(scopeType);
    const access = await scope.canWrite(user, scopeId);
    if (!access.visible) throw new NotFoundError();
    if (!access.allowed)
      throw new AppError(ErrorMessages[ErrorCode.MSG_004], 403, ErrorCode.MSG_004);

    const dedupeKey = `u:${user.id}:${input.clientMessageId}`;
    const existing = await this.messageRepo.findByDedupeKey(dedupeKey);
    if (existing) return { view: await this.toViewFor(user, existing, scope), replayed: true };

    const hasContent = input.content !== null && input.content.length > 0;
    const links = hasContent ? extractLinks(input.content as string) : [];
    const threadKey = "root";

    let message: Message;
    try {
      message = await withWriteConflictRetry(() =>
        withTransaction(async (tx) => {
          const seq = await this.messageRepo.nextSeq(tx, scopeType, scopeId, threadKey);
          const created = await this.messageRepo.create(tx, {
            scopeType,
            scopeId,
            workspaceId: access.workspaceId,
            threadId: null,
            threadKey,
            seq,
            authorId: user.id,
            kind: "USER",
            clientMessageId: input.clientMessageId,
            dedupeKey,
            content: hasContent ? input.content : null,
            normalizedContent: hasContent ? normalizeSearch(input.content as string) : null,
            mentions: [],
            attachments: input.attachments,
            links,
            forwardedFrom: input.forwardedFrom,
          });

          if (input.attachments.length > 0) {
            await this.assetLinkService.attach(tx, {
              assetIds: input.attachments.map((a) => a.assetId),
              targetType: "MESSAGE",
              targetId: created.id,
              scopeType,
              scopeId,
              actorId: user.id,
              allowForeignReadable: true,
            });
          }

          await scope.onMessageCommitted(tx, scopeId, {
            messageId: created.id,
            threadKey,
            seq,
            createdAt: created.createdAt,
          });

          await outbox.add(tx, {
            type: "message.created",
            aggregateType: "Message",
            aggregateId: created.id,
            queue: "notifications",
            jobName: "message.events",
            dedupeKey: `message.created:message:${created.id}`,
            payload: { event: "created", messageId: created.id },
          });

          // p1-07 — tin chuyển tiếp cũng fan-out (không mention/thread): unread + push theo chế độ từng người.
          await outbox.add(tx, {
            type: "message.fanout",
            aggregateType: "Message",
            aggregateId: created.id,
            queue: "notifications",
            jobName: "fanout.message",
            dedupeKey: `fanout.message:message:${created.id}`,
            payload: { messageId: created.id, mentionUserIds: [], mentionAll: false },
          });

          return created;
        })
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const replay = await this.messageRepo.findByDedupeKey(dedupeKey);
        if (replay) return { view: await this.toViewFor(user, replay, scope), replayed: true };
      }
      throw err;
    }

    emitMessageCreatedNow(message);

    return { view: await this.toViewFor(user, message, scope, false), replayed: false };
  }

  /**
   * (p7-04) Kiểm BẢN NHÁP tin — đúng các bước chuẩn hoá nội dung / tệp / mention / tin trả lời của `send()` (chung `normalizeDraftText` + `prepareBody`) nhưng KHÔNG ghi gì và KHÔNG kiểm quyền ghi
   * (người gọi — `ScheduledMessageService` — đã kiểm `canWrite`). Dùng lúc hẹn giờ để lỗi nội dung báo ngay thay vì thất bại âm thầm lúc phát. Trả bản đã chuẩn hoá.
   */
  async validateDraft(
    user: AuthUser,
    scopeType: MessageScopeTypeValue,
    scopeId: string,
    dto: DraftDto
  ): Promise<{ content: string | null; mentions: MentionInputDto[]; attachmentAssetIds: string[]; replyToId: string | null }> {
    const scope = requireScope(scopeType);
    const normalized = this.normalizeDraftText(dto);
    await this.prepareBody(user, scopeType, scopeId, scope, dto, normalized);
    return {
      content: normalized.hasContent ? normalized.text : null,
      mentions: dto.mentions,
      attachmentAssetIds: dto.attachments.map((a) => a.assetId),
      replyToId: dto.replyToId ?? null,
    };
  }

  async get(user: AuthUser, id: string): Promise<MessageView> {
    const message = await this.messageRepo.findById(id);
    if (!message) throw new NotFoundError();
    const scope = requireScope(message.scopeType);
    const access = await scope.canRead(user, message.scopeId);
    if (!access.visible) throw new NotFoundError();
    return this.toViewFor(user, message, scope);
  }

  async list(
    user: AuthUser,
    scopeType: MessageScopeTypeValue,
    scopeId: string,
    query: ListMessagesQueryDto
  ): Promise<ListResult> {
    const scope = requireScope(scopeType);
    const access = await scope.canRead(user, scopeId);
    if (!access.visible) throw new NotFoundError();
    const viewerCtx = await scope.viewerContext(user, scopeId);
    const threadKey = query.threadId ?? "root";
    const floor = viewerCtx.hiddenBeforeSeq;

    let rows: Message[] = [];
    let hasMoreBefore = false;
    let hasMoreAfter = false;
    let anchorMessageId: string | undefined;

    if (query.around) {
      const anchor = await this.messageRepo.findById(query.around);
      if (
        !anchor ||
        anchor.scopeType !== scopeType ||
        anchor.scopeId !== scopeId ||
        anchor.threadKey !== threadKey
      ) {
        throw new AppError(ErrorMessages[ErrorCode.MSG_012], 404, ErrorCode.MSG_012);
      }
      anchorMessageId = anchor.id;
      const olderLimit = Math.ceil(query.limit / 2);
      const newerLimit = query.limit - olderLimit;
      const olderRaw = await this.messageRepo.listBySeq({
        scopeType,
        scopeId,
        threadKey,
        seqAbove: floor,
        seqBelow: anchor.seq + 1,
        limit: olderLimit + 1,
        order: "desc",
      });
      hasMoreBefore = olderRaw.length > olderLimit;
      const older = olderRaw.slice(0, olderLimit).reverse();
      const newerRaw = await this.messageRepo.listBySeq({
        scopeType,
        scopeId,
        threadKey,
        seqAbove: anchor.seq,
        limit: newerLimit + 1,
        order: "asc",
      });
      hasMoreAfter = newerRaw.length > newerLimit;
      const newer = newerRaw.slice(0, newerLimit);
      rows = [...older, ...newer];
    } else if (query.beforeSeq !== undefined) {
      const raw = await this.messageRepo.listBySeq({
        scopeType,
        scopeId,
        threadKey,
        seqAbove: floor,
        seqBelow: query.beforeSeq,
        limit: query.limit + 1,
        order: "desc",
      });
      hasMoreBefore = raw.length > query.limit;
      rows = raw.slice(0, query.limit).reverse();
    } else if (query.afterSeq !== undefined) {
      const raw = await this.messageRepo.listBySeq({
        scopeType,
        scopeId,
        threadKey,
        seqAbove: Math.max(query.afterSeq, floor),
        limit: query.limit + 1,
        order: "asc",
      });
      hasMoreAfter = raw.length > query.limit;
      rows = raw.slice(0, query.limit);
    } else {
      const raw = await this.messageRepo.listBySeq({
        scopeType,
        scopeId,
        threadKey,
        seqAbove: floor,
        limit: query.limit + 1,
        order: "desc",
      });
      hasMoreBefore = raw.length > query.limit;
      rows = raw.slice(0, query.limit).reverse();
    }

    const hiddenSeqs = await this.hideRepo.findHiddenSeqs(
      user.id,
      scopeType,
      scopeId,
      rows.map((r) => r.seq)
    );
    const visible = rows.filter((r) => !hiddenSeqs.has(r.seq));

    const mineSet = await this.reactionRepo.findMineByMessageIds(
      visible.map((m) => m.id),
      user.id
    );
    const ctx: ProjectionContext = {
      viewerId: user.id,
      myReactionKeys: mineSet,
      capabilities: viewerCtx.capabilities,
      // p1-06 — 1 truy vấn batch cho cả trang (không N+1), chỉ tin gốc ở kênh.
      threadSummaries: await loadThreadSummaries(visible),
      // p1-09 — cờ `isSaved` cũng 1 truy vấn batch cho cả trang.
      savedMessageIds: await loadSavedFlags(user.id, visible),
      // p7-04 — khảo sát của các tin `POLL` trong trang: 1 truy vấn batch.
      polls: await loadPolls({ userId: user.id, canModerate: viewerCtx.capabilities.canModerate }, visible),
    };
    const data = visible.map((m) => toView(m, ctx));

    return {
      data,
      cursor: {
        nextBeforeSeq: rows[0]?.seq ?? null,
        nextAfterSeq: rows[rows.length - 1]?.seq ?? null,
        hasMoreBefore,
        hasMoreAfter,
        limit: query.limit,
      },
      ...(anchorMessageId && { anchorMessageId }),
    };
  }

  async edit(user: AuthUser, id: string, dto: EditMessageDto): Promise<MessageView> {
    const message = await this.messageRepo.findById(id);
    if (!message) throw new NotFoundError();
    if (message.kind !== "USER" || message.authorId !== user.id) {
      throw new AppError(ErrorMessages[ErrorCode.MSG_009], 403, ErrorCode.MSG_009);
    }
    if (message.deletedAt)
      throw new AppError(ErrorMessages[ErrorCode.MSG_006], 409, ErrorCode.MSG_006);
    const ageSeconds = (Date.now() - message.createdAt.getTime()) / 1000;
    if (ageSeconds > LIMITS.message.editWindowSeconds) {
      throw new AppError(ErrorMessages[ErrorCode.MSG_003], 409, ErrorCode.MSG_003);
    }

    const scope = requireScope(message.scopeType);
    const access = await scope.canWrite(user, message.scopeId);
    if (!access.visible) throw new NotFoundError();
    if (!access.allowed)
      throw new AppError(ErrorMessages[ErrorCode.MSG_004], 403, ErrorCode.MSG_004);

    const normalized = normalizeContent(dto.content);
    if (graphemeLength(normalized) > LIMITS.message.maxChars) {
      throw new AppError(ErrorMessages[ErrorCode.MSG_001], 400, ErrorCode.MSG_001);
    }

    // ── Mention — cùng nguyên tắc dual-path với `send()` (mục 5 ở trên):
    // dùng `IMentionValidator` thật khi đã đăng ký, fallback cấu trúc-tối-giản
    // khi chưa (backward-compat).
    const mentionValidator = getMentionValidator();
    let newMentions: MessageMention[];
    let normalizedContentText: string;
    if (mentionValidator) {
      const result = await mentionValidator.validate({
        scopeType: message.scopeType,
        scopeId: message.scopeId,
        mentions: dto.mentions,
        content: normalized,
        actorId: user.id,
        messageId: id,
      });
      newMentions = result.mentions;
      normalizedContentText = result.textForSearch;
    } else {
      const mentionOutcome = validateMentionsStructurally(dto.mentions);
      if (!mentionOutcome.valid) {
        throw new AppError(ErrorMessages[ErrorCode.MSG_008], 400, ErrorCode.MSG_008, {
          invalidMentions: mentionOutcome.invalidMentions,
        });
      }
      newMentions = mentionOutcome.mentions;
      normalizedContentText = normalized;
    }
    const links = extractLinks(normalized);

    const oldUserMentionIds = mentionTargetIds(message.mentions);
    const newUserMentionIds = mentionTargetIds(newMentions);
    // be.md §5.2 bước 7 — diff sửa tin coi `ALL` như 1 khoá riêng (không phải USER id).
    const oldHasAll = message.mentions.some((m) => m.type === "ALL");
    const newHasAll = newMentions.some((m) => m.type === "ALL");

    await withTransaction(async (tx) => {
      const result = await this.messageRepo.updateForEdit(tx, id, dto.expectedVersion, {
        content: normalized,
        normalizedContent: normalizeSearch(normalizedContentText),
        mentions: newMentions,
        links,
      });
      if (result.count === 0) {
        const current = await this.messageRepo.findById(id, tx);
        throw new VersionConflictError(current?.version ?? dto.expectedVersion);
      }
      const addedMentionIds = newUserMentionIds.filter((u) => !oldUserMentionIds.includes(u));
      const removedMentionIds = oldUserMentionIds.filter((u) => !newUserMentionIds.includes(u));
      await outbox.add(tx, {
        type: "message.updated",
        aggregateType: "Message",
        aggregateId: id,
        queue: "notifications",
        jobName: "message.events",
        dedupeKey: `message.updated:message:${id}:v${result.version}`,
        payload: {
          event: "updated",
          messageId: id,
          reason: "EDIT",
          addedMentionIds,
          removedMentionIds,
          // p1-06 be.md §5.4 — hợp đồng outbox bổ sung cho p1-07 (MSG-33).
          mentionDiff: {
            addedUserIds: addedMentionIds,
            removedUserIds: removedMentionIds,
            allAdded: !oldHasAll && newHasAll,
            allRemoved: oldHasAll && !newHasAll,
          },
        },
      });

      // p1-07 be.md §7 — `fanout.message-edit` chỉ khi tập nhắc tên đổi (consumer riêng, cùng lý do `fanout.message`).
      const allAdded = !oldHasAll && newHasAll;
      const allRemoved = oldHasAll && !newHasAll;
      if (addedMentionIds.length > 0 || removedMentionIds.length > 0 || allAdded || allRemoved) {
        await outbox.add(tx, {
          type: "message.fanout-edit",
          aggregateType: "Message",
          aggregateId: id,
          queue: "notifications",
          jobName: "fanout.message-edit",
          dedupeKey: `fanout.message-edit:message:${id}:v${result.version}`,
          payload: {
            messageId: id,
            addedUserIds: addedMentionIds,
            removedUserIds: removedMentionIds,
            allAdded,
            allRemoved,
          },
        });
      }

      // p3-04 `@role`: vai trò MỚI được nhắc khi sửa (chưa có trên tin) → fan-out `MENTION_ROLE` (job riêng, idempotent).
      const oldRoleTargets = new Set(message.mentions.filter((m) => m.type === "ROLE").map((m) => m.targetId));
      if (newMentions.some((m) => m.type === "ROLE" && !oldRoleTargets.has(m.targetId))) {
        await outbox.add(tx, {
          type: "message.fanout-role",
          aggregateType: "Message",
          aggregateId: id,
          queue: "notifications",
          jobName: "fanout.message-role",
          dedupeKey: `fanout.message-role:message:${id}:v${result.version}`,
          payload: { messageId: id },
        });
      }
    });

    const updated = await this.messageRepo.findById(id);
    if (!updated) throw new NotFoundError();
    return this.toViewFor(user, updated, scope);
  }

  async recall(
    user: AuthUser,
    id: string,
    reason: string | undefined
  ): Promise<{ id: string; seq: number; deletedAt: Date }> {
    const message = await this.messageRepo.findById(id);
    if (!message) throw new NotFoundError();
    if (message.deletedAt)
      return { id: message.id, seq: message.seq, deletedAt: message.deletedAt };
    // Tin khảo sát (`POLL`, p7-04) là tin của người dùng: tác giả thu hồi được (khảo sát bị đóng `MESSAGE_RECALLED` qua job `poll.message-deleted`); chỉ tin hệ thống là không.
    if (!isUserAuthoredKind(message.kind) || message.authorId !== user.id) throw new ForbiddenError();

    const deletedAt = await this.tombstone(id, user.id, "AUTHOR_RECALL", reason ?? null, true);
    return { id, seq: message.seq, deletedAt };
  }

  /** Dùng chung tác giả thu hồi (`recall`) VÀ p1-08 (moderation, `authorOnly=false`) — be.md §5.4. */
  async tombstone(
    id: string,
    actorId: string,
    mode: DeleteModeValue,
    reason: string | null,
    authorOnly: boolean
  ): Promise<Date> {
    return withTransaction(async (tx) => {
      // p7-04 — cần biết tin có phải khảo sát (`POLL`) để ghi hàng outbox đóng khảo sát; đọc TRƯỚC khi tombstone (sau đó vẫn còn `kind`, nhưng đọc sớm để không phụ thuộc thứ tự).
      const before = await this.messageRepo.findById(id, tx);
      const result = await this.messageRepo.tombstone(tx, id, actorId, mode, reason, authorOnly);
      if (result.count === 0) {
        const current = await this.messageRepo.findById(id, tx);
        if (current?.deletedAt) return current.deletedAt;
        throw new NotFoundError();
      }
      await this.reactionRepo.deleteByMessage(tx, id);
      await this.assetLinkService.detach(tx, { targetType: "MESSAGE", targetId: id });
      await this.messageRepo.markReplyPreviewsDeleted(tx, id);
      if (before?.kind === "POLL") {
        // Consumer RIÊNG (mỗi cặp queue/jobName chỉ một processor): `chat-extensions` đóng khảo sát `MESSAGE_RECALLED`. Tên job là hằng chung ở `shared/ports` — messages không import chat-extensions.
        await outbox.add(tx, {
          type: "poll.message-deleted",
          aggregateType: "Message",
          aggregateId: id,
          queue: POLL_MESSAGE_DELETED_JOB.queue,
          jobName: POLL_MESSAGE_DELETED_JOB.name,
          dedupeKey: `${POLL_MESSAGE_DELETED_JOB.name}:message:${id}`,
          payload: { messageId: id },
        });
      }
      await outbox.add(tx, {
        type: "message.deleted",
        aggregateType: "Message",
        aggregateId: id,
        queue: "notifications",
        jobName: "message.events",
        dedupeKey: `message.deleted:message:${id}`,
        payload: { event: "deleted", messageId: id, mode },
      });
      return result.deletedAt;
    });
  }

  /** Bước 2 của `send()` — chuẩn hoá nội dung, kiểm độ dài (MSG_001), không có gì để gửi (MSG_007), số tệp (MSG_002). */
  private normalizeDraftText(dto: Pick<SendMessageDto, "content" | "attachments">): NormalizedText {
    const text = dto.content !== undefined ? normalizeContent(dto.content) : undefined;
    if (text !== undefined && graphemeLength(text) > LIMITS.message.maxChars) {
      throw new AppError(ErrorMessages[ErrorCode.MSG_001], 400, ErrorCode.MSG_001);
    }
    const hasContent = text !== undefined && text.length > 0;
    const hasAttachments = dto.attachments.length > 0;
    if (!hasContent && !hasAttachments) {
      throw new AppError(ErrorMessages[ErrorCode.MSG_007], 400, ErrorCode.MSG_007);
    }
    if (dto.attachments.length > LIMITS.message.attachmentsMax) {
      throw new AppError(ErrorMessages[ErrorCode.MSG_002], 400, ErrorCode.MSG_002);
    }
    return text !== undefined && text.length > 0 ? { hasContent: true, text } : { hasContent: false, text };
  }

  /**
   * Bước 4–7 của `send()` — tệp đính kèm, mention, trả lời, link (không ghi DB).
   *
   * Mention (bước 5): p1-06 `MentionService` (marker/@all/rate-limit, xem `modules/mentions/mention.service.ts`) khi đã đăng ký qua `registerMentionValidator()` (`modules/mentions/index.ts`, gọi lúc
   * `router.ts` boot); CHƯA đăng ký (vd test cũ không boot đủ `router.ts`) → giữ NGUYÊN hành vi validator cấu trúc-tối-giản trước đây (backward-compat, không phá test hiện có — xem `mention-validator.ts`).
   */
  private async prepareBody(
    user: AuthUser,
    scopeType: MessageScopeTypeValue,
    scopeId: string,
    scope: MessageScope,
    dto: DraftDto,
    normalized: NormalizedText
  ): Promise<PreparedBody> {
    const { text: normalizedText, hasContent } = normalized;

    // ── 4. Tệp đính kèm ────────────────────────────────────────────────────
    const attachments = await this.buildAttachments(user.id, dto.attachments);

    // ── 5. Mention ─────────────────────────────────────────────────────────
    const mentionValidator = getMentionValidator();
    let mentions: MessageMention[];
    let mentionUserIds: string[] = [];
    let mentionAll = false;
    let textForSearch: string | undefined;
    if (mentionValidator) {
      const result = await mentionValidator.validate({
        scopeType,
        scopeId,
        mentions: dto.mentions,
        content: normalizedText ?? "",
        actorId: user.id,
      });
      mentions = result.mentions;
      mentionUserIds = result.mentionUserIds;
      mentionAll = result.mentionAll;
      textForSearch = result.textForSearch;
    } else {
      const mentionOutcome = validateMentionsStructurally(dto.mentions);
      if (!mentionOutcome.valid) {
        throw new AppError(ErrorMessages[ErrorCode.MSG_008], 400, ErrorCode.MSG_008, {
          invalidMentions: mentionOutcome.invalidMentions,
        });
      }
      mentions = mentionOutcome.mentions;
      if (scope.validateMentions && mentions.length > 0) {
        const deep = await scope.validateMentions(
          scopeId,
          mentions.map((m) => ({ type: m.type, targetId: m.targetId ?? undefined }))
        );
        if (!deep.valid) {
          throw new AppError(ErrorMessages[ErrorCode.MSG_008], 400, ErrorCode.MSG_008, {
            invalidMentions: deep.invalidMentions,
          });
        }
      }
      mentionUserIds = mentionTargetIds(mentions);
      mentionAll = mentions.some((m) => m.type === "ALL");
    }

    // ── 6. Trả lời ─────────────────────────────────────────────────────────
    let replyPreview = null as Message["replyPreview"];
    if (dto.replyToId) {
      const replyTo = await this.messageRepo.findById(dto.replyToId);
      if (!replyTo || replyTo.scopeType !== scopeType || replyTo.scopeId !== scopeId) {
        throw new AppError(ErrorMessages[ErrorCode.MSG_006], 409, ErrorCode.MSG_006);
      }
      replyPreview = {
        authorId: replyTo.authorId,
        excerpt: excerptOf(replyTo, 120),
        kind: replyTo.kind === "SYSTEM" ? "SYSTEM" : (replyTo.attachments[0]?.kind ?? "TEXT"),
        deleted: replyTo.deletedAt !== null,
      };
    }

    // ── 7. Link ────────────────────────────────────────────────────────────
    const links = hasContent ? extractLinks(normalizedText) : [];

    return { attachments, mentions, mentionUserIds, mentionAll, textForSearch, replyPreview, links };
  }

  private async buildAttachments(
    userId: string,
    inputs: SendMessageDto["attachments"]
  ): Promise<MessageAttachment[]> {
    if (inputs.length === 0) return [];
    const assetIds = inputs.map((a) => a.assetId);
    const assets = await prisma.asset.findMany({ where: { id: { in: assetIds } } });
    if (assets.length !== assetIds.length) {
      throw new AppError(ErrorMessages[ErrorCode.MSG_005], 400, ErrorCode.MSG_005);
    }
    const byId = new Map(assets.map((a) => [a.id, a]));
    return inputs.map((input) => {
      const asset = byId.get(input.assetId);
      if (!asset || asset.status !== "READY" || asset.ownerId !== userId) {
        throw new AppError(ErrorMessages[ErrorCode.MSG_005], 400, ErrorCode.MSG_005);
      }
      if (
        asset.kind === "VOICE" &&
        (asset.durationMs ?? 0) > LIMITS.message.voiceNoteMaxSeconds * 1000
      ) {
        throw new AppError(ErrorMessages[ErrorCode.MSG_011], 400, ErrorCode.MSG_011);
      }
      return {
        assetId: asset.id,
        kind: asset.kind,
        name: asset.originalName,
        mime: asset.mime,
        size: asset.size ?? asset.declaredSize,
        width: asset.width,
        height: asset.height,
        durationMs: asset.durationMs,
        waveform: input.waveform ?? asset.waveform?.points ?? [],
        thumbnailAssetId: asset.thumbnailAssetId,
      };
    });
  }

  /**
   * `withThreadSummary=false` cho tin VỪA tạo (không thể có reply — bỏ 1 truy
   * vấn thừa trên đường gửi tin); mặc định `true` cho get/edit/replay (tin
   * gốc có thể đã có thread — p1-06 be.md §4).
   */
  private async toViewFor(
    user: AuthUser,
    message: Message,
    scope: MessageScope,
    withThreadSummary = true,
    preloadedViewerCtx?: MessageScopeViewerContext
  ): Promise<MessageView> {
    const viewerCtx = preloadedViewerCtx ?? (await scope.viewerContext(user, message.scopeId));
    // Tin VỪA tạo (`withThreadSummary=false`) chưa thể có cảm xúc nào → bỏ truy vấn.
    const mine = withThreadSummary
      ? await this.reactionRepo.findMineByMessageIds([message.id], user.id)
      : new Set<string>();
    return toView(message, {
      viewerId: user.id,
      myReactionKeys: mine,
      capabilities: viewerCtx.capabilities,
      threadSummaries: withThreadSummary ? await loadThreadSummaries([message]) : undefined,
      // Tin VỪA tạo (`withThreadSummary=false`) không thể đã được lưu → bỏ truy vấn thừa, `isSaved: false` ngay.
      savedMessageIds: withThreadSummary ? await loadSavedFlags(user.id, [message]) : new Set(),
      // p7-04 — tin khảo sát vừa tạo cũng phải mang `poll` (client vẽ thẻ ngay từ phản hồi 201).
      polls: await loadPolls({ userId: user.id, canModerate: viewerCtx.capabilities.canModerate }, [message]),
    });
  }
}

function mentionTargetIds(mentions: MessageMention[]): string[] {
  return mentions.filter((m) => m.type === "USER" && m.targetId).map((m) => m.targetId as string);
}
