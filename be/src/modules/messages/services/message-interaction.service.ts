import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { LIMITS } from "../../../core/constants/limits";
import { AppError, ForbiddenError, NotFoundError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { AuthUser } from "../../../core/types/express";
import { getMessageScope } from "../scope/message-scope.registry";
import type { MessageScope } from "../scope/message-scope.interface";
import type { IMessageRepository } from "../repositories/message.repository.interface";
import type { IReactionRepository } from "../repositories/reaction.repository.interface";
import type { IMessageHideRepository } from "../repositories/message-hide.repository.interface";
import type { SystemMessageService } from "./system-message.service";
import { toView } from "./message-projection";
import { loadThreadSummaries } from "./thread-summary.loader";
import { loadSavedFlags } from "./saved-flag.loader";
import { loadPolls } from "./poll-view.loader";
import type { MessageReactorEntry, MessageScopeTypeValue, MessageView } from "../entities/message.interface";

// eslint-disable-next-line no-misleading-character-class -- ZWJ/biến thể/khung màu da/keycap CỐ Ý gộp 1 class để kiểm emoji hợp lệ (be.md §5.5).
const EMOJI_MODIFIER_RE = /[‍︎️\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}⃣]/u;

/** be.md §5.5 — regex `\p{Extended_Pictographic}` + ZWJ/biến thể/khung màu da/keycap, đúng 1 grapheme hiển thị. */
export function isValidEmoji(input: string): boolean {
  if (input.length === 0 || input.length > 32) return false;
  const seg = new Intl.Segmenter("en", { granularity: "grapheme" });
  const graphemes = Array.from(seg.segment(input));
  if (graphemes.length !== 1) return false;
  const codePoints = Array.from(input);
  const hasPictographic = codePoints.some((c) => /\p{Extended_Pictographic}/u.test(c));
  // Cờ quốc gia (2 code point Regional_Indicator) và keycap (`0-9#*` + VS16 +
  // U+20E3) là 1 grapheme hợp lệ nhưng KHÔNG code point nào mang thuộc tính
  // Extended_Pictographic — phát hiện qua unit test viết cho tác vụ này:
  // `EMOJI_MODIFIER_RE` đã có sẵn dải Regional_Indicator/keycap (dùng ở bước
  // "every" bên dưới) nhưng cổng `hasPictographic` vẫn chặn nhầm 2 loại này,
  // dù be.md §5.5 tự liệt "keycap" là loại phải hỗ trợ.
  const isFlagPair = codePoints.length === 2 && codePoints.every((c) => /\p{Regional_Indicator}/u.test(c));
  const isKeycap = codePoints.includes("⃣");
  if (!hasPictographic && !isFlagPair && !isKeycap) return false;
  return codePoints.every((c) => /\p{Extended_Pictographic}/u.test(c) || EMOJI_MODIFIER_RE.test(c) || /[0-9#*]/.test(c));
}

function requireScope(scopeType: "CHANNEL" | "CONVERSATION"): MessageScope {
  const scope = getMessageScope(scopeType);
  if (!scope) throw new NotFoundError();
  return scope;
}

export interface ReactionResult {
  messageId: string;
  emoji: string;
  count: number;
  me: boolean;
}

export interface PinResult {
  messageId: string;
  pinned: boolean;
  pinnedAt?: Date | null;
  pinnedBy?: string | null;
}

/** be.md §5.5 — hide/unhide, react/unreact, pin/unpin + danh sách người react/tin ghim. */
export class MessageInteractionService {
  constructor(
    private readonly messageRepo: IMessageRepository,
    private readonly reactionRepo: IReactionRepository,
    private readonly hideRepo: IMessageHideRepository,
    private readonly systemMessageService: SystemMessageService
  ) {}

  async hide(user: AuthUser, messageId: string): Promise<{ messageId: string; hidden: boolean }> {
    const message = await this.messageRepo.findById(messageId);
    if (!message) throw new NotFoundError();
    const scope = requireScope(message.scopeType);
    const access = await scope.canRead(user, message.scopeId);
    if (!access.visible) throw new NotFoundError();

    await this.hideRepo.hide({ userId: user.id, messageId, scopeType: message.scopeType, scopeId: message.scopeId, seq: message.seq });
    emitToUsers([user.id], SocketEvent.MESSAGE_HIDDEN, {
      messageId,
      scopeType: message.scopeType,
      scopeId: message.scopeId,
      hidden: true,
    });
    return { messageId, hidden: true };
  }

  async unhide(user: AuthUser, messageId: string): Promise<{ messageId: string; hidden: boolean }> {
    const message = await this.messageRepo.findById(messageId);
    if (!message) throw new NotFoundError();
    const scope = requireScope(message.scopeType);
    const access = await scope.canRead(user, message.scopeId);
    if (!access.visible) throw new NotFoundError();

    await this.hideRepo.unhide(user.id, messageId);
    emitToUsers([user.id], SocketEvent.MESSAGE_HIDDEN, {
      messageId,
      scopeType: message.scopeType,
      scopeId: message.scopeId,
      hidden: false,
    });
    return { messageId, hidden: false };
  }

  async react(user: AuthUser, messageId: string, emoji: string): Promise<ReactionResult> {
    if (!isValidEmoji(emoji)) throw new AppError(ErrorMessages[ErrorCode.MSG_013], 400, ErrorCode.MSG_013);
    const message = await this.messageRepo.findById(messageId);
    if (!message) throw new NotFoundError();
    if (message.deletedAt) throw new AppError(ErrorMessages[ErrorCode.MSG_006], 409, ErrorCode.MSG_006);

    const scope = requireScope(message.scopeType);
    const access = await scope.canRead(user, message.scopeId);
    if (!access.visible) throw new NotFoundError();
    const viewerCtx = await scope.viewerContext(user, message.scopeId);
    if (!viewerCtx.capabilities.canReact) throw new ForbiddenError();

    const alreadyHasEmoji = message.reactionsSummary.some((r) => r.emoji === emoji);
    if (!alreadyHasEmoji && message.reactionsSummary.length >= LIMITS.message.reactionsDistinctMax) {
      throw new AppError(ErrorMessages[ErrorCode.MSG_014], 409, ErrorCode.MSG_014);
    }

    let count = message.reactionsSummary.find((r) => r.emoji === emoji)?.count ?? 0;
    try {
      await withTransaction(async (tx) => {
        await this.reactionRepo.add(tx, {
          messageId,
          scopeType: message.scopeType,
          scopeId: message.scopeId,
          userId: user.id,
          emoji,
        });

        const fresh = await this.messageRepo.findById(messageId, tx);
        const summary = fresh?.reactionsSummary ?? [];
        const idx = summary.findIndex((r) => r.emoji === emoji);
        const nextSummary =
          idx >= 0 ? summary.map((r, i) => (i === idx ? { ...r, count: r.count + 1 } : r)) : [...summary, { emoji, count: 1 }];
        await this.messageRepo.updateReactionsSummary(tx, messageId, nextSummary);
        count = nextSummary.find((r) => r.emoji === emoji)?.count ?? 1;

        await outbox.add(tx, {
          type: "reaction.updated",
          aggregateType: "Message",
          aggregateId: messageId,
          queue: "notifications",
          jobName: "message.events",
          dedupeKey: `reaction.updated:message:${messageId}:${randomUUID()}`,
          payload: { event: "reaction-updated", messageId, scopeType: message.scopeType, scopeId: message.scopeId, emoji, userId: user.id, action: "ADD", count },
        });
      });
    } catch (err) {
      // Idempotent — `(messageId,userId,emoji)` đã tồn tại (race 2 request
      // cùng lúc, MSG-06). `P2002` PHẢI được bắt NGOÀI `withTransaction` (xem
      // docstring `reaction.repository.prisma.ts#add`) — transaction Mongo
      // không cho bắt-rồi-tiếp-tục bên trong cùng session.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const fresh = await this.messageRepo.findById(messageId);
        count = fresh?.reactionsSummary.find((r) => r.emoji === emoji)?.count ?? count;
      } else {
        throw err;
      }
    }

    return { messageId, emoji, count, me: true };
  }

  async unreact(user: AuthUser, messageId: string, emoji: string): Promise<ReactionResult> {
    const message = await this.messageRepo.findById(messageId);
    if (!message) throw new NotFoundError();
    const scope = requireScope(message.scopeType);
    const access = await scope.canRead(user, message.scopeId);
    if (!access.visible) throw new NotFoundError();

    let count = message.reactionsSummary.find((r) => r.emoji === emoji)?.count ?? 0;
    await withTransaction(async (tx) => {
      const removed = await this.reactionRepo.remove(tx, messageId, user.id, emoji);
      if (!removed.removed) return; // idempotent (chưa từng react)

      const fresh = await this.messageRepo.findById(messageId, tx);
      const summary = fresh?.reactionsSummary ?? [];
      const idx = summary.findIndex((r) => r.emoji === emoji);
      let nextSummary = summary;
      let nextCount = 0;
      if (idx >= 0) {
        nextCount = Math.max(summary[idx].count - 1, 0);
        nextSummary = nextCount > 0 ? summary.map((r, i) => (i === idx ? { ...r, count: nextCount } : r)) : summary.filter((_, i) => i !== idx);
      }
      await this.messageRepo.updateReactionsSummary(tx, messageId, nextSummary);
      count = nextCount;

      await outbox.add(tx, {
        type: "reaction.updated",
        aggregateType: "Message",
        aggregateId: messageId,
        queue: "notifications",
        jobName: "message.events",
        dedupeKey: `reaction.updated:message:${messageId}:${randomUUID()}`,
        payload: { event: "reaction-updated", messageId, scopeType: message.scopeType, scopeId: message.scopeId, emoji, userId: user.id, action: "REMOVE", count },
      });
    });

    return { messageId, emoji, count, me: false };
  }

  async listReactors(
    user: AuthUser,
    messageId: string,
    params: { emoji?: string; cursor?: Date; limit: number }
  ): Promise<MessageReactorEntry[]> {
    const message = await this.messageRepo.findById(messageId);
    if (!message) throw new NotFoundError();
    const scope = requireScope(message.scopeType);
    const access = await scope.canRead(user, message.scopeId);
    if (!access.visible) throw new NotFoundError();

    return this.reactionRepo.listReactors(messageId, {
      emoji: params.emoji,
      cursor: params.cursor,
      limit: params.limit,
    });
  }

  /** be.md §4 `GET /scopes/:scopeType/:scopeId/pins` — `MessageView[]` (pinnedAt desc). */
  async listPinned(user: AuthUser, scopeType: MessageScopeTypeValue, scopeId: string): Promise<MessageView[]> {
    const scope = requireScope(scopeType);
    const access = await scope.canRead(user, scopeId);
    if (!access.visible) throw new NotFoundError();
    const viewerCtx = await scope.viewerContext(user, scopeId);

    const pinned = await this.messageRepo.listPinned(scopeType, scopeId);
    const mine = await this.reactionRepo.findMineByMessageIds(pinned.map((m) => m.id), user.id);
    // p1-06 — tin gốc được ghim vẫn hiện tóm tắt thread (1 truy vấn batch).
    const threadSummaries = await loadThreadSummaries(pinned);
    // p1-09 — cờ `isSaved` (1 truy vấn batch cho cả danh sách ghim).
    const savedMessageIds = await loadSavedFlags(user.id, pinned);
    // p7-04 — khảo sát được ghim vẫn hiện thẻ khảo sát (1 truy vấn batch).
    const polls = await loadPolls({ userId: user.id, canModerate: viewerCtx.capabilities.canModerate }, pinned);
    return pinned.map((m) =>
      toView(m, { viewerId: user.id, myReactionKeys: mine, capabilities: viewerCtx.capabilities, threadSummaries, savedMessageIds, polls })
    );
  }

  async pin(user: AuthUser, messageId: string): Promise<PinResult> {
    const message = await this.messageRepo.findById(messageId);
    if (!message) throw new NotFoundError();
    if (message.deletedAt) throw new AppError(ErrorMessages[ErrorCode.MSG_006], 409, ErrorCode.MSG_006);

    const scope = requireScope(message.scopeType);
    const access = await scope.canRead(user, message.scopeId);
    if (!access.visible) throw new NotFoundError();
    const viewerCtx = await scope.viewerContext(user, message.scopeId);
    if (!viewerCtx.capabilities.canPin) throw new ForbiddenError();

    if (message.pinnedAt) return { messageId, pinned: true, pinnedAt: message.pinnedAt, pinnedBy: message.pinnedBy };

    const pinMax = await scope.pinMax(message.scopeId);
    let pinnedAt: Date = new Date();
    await withTransaction(async (tx) => {
      const current = await this.messageRepo.countPinned(message.scopeType, message.scopeId, tx);
      if (current >= pinMax) throw new AppError(ErrorMessages[ErrorCode.MSG_010], 409, ErrorCode.MSG_010);

      const result = await this.messageRepo.setPin(tx, messageId, user.id);
      if (result.count === 0) {
        const now = await this.messageRepo.findById(messageId, tx);
        pinnedAt = now?.pinnedAt ?? pinnedAt;
        return;
      }
      pinnedAt = result.pinnedAt;

      // be.md §5.5 — chỉ CONVERSATION đăng tin hệ thống MESSAGE_PINNED (chưa
      // đăng ký scope này trong phiên p1-04 — nhánh này sẵn sàng cho p1-05).
      if (message.scopeType === "CONVERSATION") {
        await this.systemMessageService.post(
          {
            scopeType: "CONVERSATION",
            scopeId: message.scopeId,
            systemType: "MESSAGE_PINNED",
            payload: { actorId: user.id, messageId },
            dedupeKey: `pin:${messageId}`,
            actorId: user.id,
          },
          tx
        );
      }

      await outbox.add(tx, {
        type: "pin.updated",
        aggregateType: "Message",
        aggregateId: messageId,
        queue: "notifications",
        jobName: "message.events",
        dedupeKey: `pin.updated:message:${messageId}:${randomUUID()}`,
        payload: {
          event: "pin-updated",
          messageId,
          scopeType: message.scopeType,
          scopeId: message.scopeId,
          pinned: true,
          pinnedAt,
          pinnedBy: user.id,
        },
      });
    });

    return { messageId, pinned: true, pinnedAt, pinnedBy: user.id };
  }

  async unpin(user: AuthUser, messageId: string): Promise<PinResult> {
    const message = await this.messageRepo.findById(messageId);
    if (!message) throw new NotFoundError();
    const scope = requireScope(message.scopeType);
    const access = await scope.canRead(user, message.scopeId);
    if (!access.visible) throw new NotFoundError();
    const viewerCtx = await scope.viewerContext(user, message.scopeId);
    if (!viewerCtx.capabilities.canPin) throw new ForbiddenError();

    if (!message.pinnedAt) return { messageId, pinned: false };

    await withTransaction(async (tx) => {
      const result = await this.messageRepo.clearPin(tx, messageId);
      if (result.count === 0) return;
      await outbox.add(tx, {
        type: "pin.updated",
        aggregateType: "Message",
        aggregateId: messageId,
        queue: "notifications",
        jobName: "message.events",
        dedupeKey: `pin.updated:message:${messageId}:${randomUUID()}`,
        payload: { event: "pin-updated", messageId, scopeType: message.scopeType, scopeId: message.scopeId, pinned: false },
      });
    });

    return { messageId, pinned: false };
  }
}
