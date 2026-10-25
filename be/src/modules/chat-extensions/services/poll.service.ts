import { randomBytes } from "crypto";
import { ForbiddenError, ValidationError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import { graphemeLength, normalizeSearch } from "../../../core/utils/normalize";
import type { IMessageSendPort, PortMessageView } from "../../../shared/ports/message-send.port";
import type { MessagePollView } from "../../../shared/ports/message-poll-reader.port";
import { chatErrors } from "../chat-extensions.errors";
import type { CursorPage, PollEntity, PollOptionEntity, VoterView } from "../entities/chat-extensions.types";
import type { CreatePollDto, VotersQueryDto } from "../dtos";
import type { IChatDirectory } from "../repositories/chat-directory.interface";
import type { IPollVoteRepository } from "../repositories/poll-vote.repository.interface";
import type { IPollRepository } from "../repositories/poll.repository.interface";
import type { IOutboxPort, ITxRunner } from "../repositories/tx";
import { getChatExtLimits, type ChatExtLimits } from "./chat-extensions-limits";
import { writePollClose } from "./chat-extensions-events";
import { isUniqueViolation, isWithinWindow, sameIdSet } from "./chat-extensions-util";
import type { IChatPermissionGate } from "./chat-extensions-ports";
import { toPollView } from "./poll-projection";
import type { PollPublisher } from "./poll-publisher";

/**
 * Số lần thử khi đua ghi đếm phiếu (CAS `version` lệch hoặc trùng khoá lần bầu đầu tiên) trước khi báo bận (503 `SYS_503` retryable). Mỗi vòng đua CHỈ MỘT bên thắng nên nhóm đông
 * bầu dồn cần nhiều lượt hơn bản nháp (3) — kèm trễ ngẫu nhiên tăng dần để các bên tranh nhau không cùng nhịp (tránh "đàn kéo").
 */
const VOTE_ATTEMPTS = 6;
const RETRY_JITTER_MS = 15;
const DELETED_USER_NAME = "Tài khoản đã xoá";

export interface PollServiceDeps {
  polls: IPollRepository;
  votes: IPollVoteRepository;
  directory: IChatDirectory;
  sender: IMessageSendPort;
  gate: IChatPermissionGate;
  publisher: PollPublisher;
  tx: ITxRunner;
  outbox: IOutboxPort;
  limits?: () => Promise<ChatExtLimits>;
  now?: () => Date;
  randomId?: () => string;
  /** Trễ giữa các lần thử (test truyền bản không chờ). */
  sleep?: (ms: number) => Promise<void>;
}

export interface CreatePollResult {
  /** Tin khảo sát (đối tượng `MessageView` của engine — đã kèm `poll` khi cổng đọc khảo sát được đăng ký ở tiến trình này). */
  message: PortMessageView;
  poll: MessagePollView;
  replayed: boolean;
}

/** Id lựa chọn: 8 ký tự hex ngẫu nhiên (đủ chống trùng trong ≤ 10 lựa chọn; khoá ổn định trong `PollVote.optionIds`). */
const defaultRandomId = (): string => randomBytes(4).toString("hex");

/**
 * Khảo sát trong kênh/hội thoại (p7-04 be.md §5.2). Tin `kind=POLL` được tạo qua cổng `IMessageSendPort` (engine tin nhắn lo quyền ghi, idempotency, seq, realtime `message:created`),
 * `Poll` ghi CÙNG transaction qua `onCreated`. Đếm phiếu phi chuẩn hoá trên `Poll` (CAS `version`) + một `PollVote`/người (`@@unique`): hai request cùng người chỉ ra MỘT phiếu, đếm đúng (POLL-02).
 * Quyền đọc kiểm LẠI ở mọi thao tác (`getReadable`): mất quyền kênh → 404 `POLL_005` (POLL-05).
 */
export class PollService {
  constructor(private readonly d: PollServiceDeps) {}

  private now(): Date {
    return this.d.now?.() ?? new Date();
  }

  private limits(): Promise<ChatExtLimits> {
    return (this.d.limits ?? getChatExtLimits)();
  }

  async create(user: AuthUser, scopeType: "CHANNEL" | "CONVERSATION", scopeId: string, dto: CreatePollDto): Promise<CreatePollResult> {
    const limits = await this.limits();
    const now = this.now();
    if (dto.threadId && scopeType !== "CHANNEL") throw new ValidationError("Chỉ kênh mới có thread", { field: "threadId" });

    const access = await this.d.sender.canWrite(user.id, scopeType, scopeId);
    if (!access.readable) throw chatErrors.notFound();
    if (!access.allowed) throw chatErrors.cannotWrite();

    const question = dto.question.trim();
    if (question.length === 0 || graphemeLength(question) > limits.poll.questionMax) throw chatErrors.pollOptionsInvalid();
    const options = this.buildOptions(dto.options, limits);
    if (dto.closesAt && !isWithinWindow(dto.closesAt, now, limits.poll.closeMinLeadSeconds, limits.poll.closesInMaxDays)) throw chatErrors.pollClosesAtInvalid();

    await this.d.gate.assert(user, "POLL_CREATE", { scopeType, scopeId, workspaceId: access.workspaceId });

    let created: PollEntity | null = null;
    const sent = await this.d.sender.send({
      authorId: user.id,
      scopeType,
      scopeId,
      ...(dto.threadId ? { threadId: dto.threadId } : {}),
      clientMessageId: dto.clientMessageId,
      kind: "POLL",
      // `content` = câu hỏi: tìm kiếm (p1-09) và xem trước "[Khảo sát] <câu hỏi>" hoạt động như tin thường.
      content: question,
      onCreated: async (tx, message) => {
        created = await this.d.polls.create(
          {
            messageId: message.id,
            scopeType,
            scopeId,
            threadId: message.threadId,
            workspaceId: message.workspaceId,
            createdBy: user.id,
            question,
            normalizedQuestion: normalizeSearch(question),
            options,
            multi: dto.multi,
            anonymous: dto.anonymous,
            closesAt: dto.closesAt ?? null,
          },
          tx
        );
        await writePollClose(this.d.outbox, tx, created);
      },
    });

    // Replay cùng `clientMessageId`: engine trả tin cũ, `onCreated` KHÔNG chạy — khảo sát đã có từ lần đầu (unique `messageId`).
    const poll = created ?? (await this.d.polls.findByMessageId(sent.view.id));
    if (!poll) throw chatErrors.pollNotFound();
    return { message: sent.view, poll: toPollView(poll, { viewerId: user.id, myOptionIds: [], canModerate: false, now }), replayed: sent.replayed };
  }

  async get(user: AuthUser, pollId: string): Promise<MessagePollView> {
    const { poll, canModerate } = await this.requireReadable(user, pollId);
    const mine = await this.d.votes.findMine([poll.id], user.id);
    return toPollView(poll, { viewerId: user.id, myOptionIds: mine.get(poll.id) ?? [], canModerate, now: this.now() });
  }

  /** Bầu/đổi phiếu: `PUT` THAY TOÀN BỘ lựa chọn của mình. Bầu lại đúng lựa chọn cũ = không đổi gì (không tăng `version`, không phát sự kiện). */
  async vote(user: AuthUser, pollId: string, optionIds: string[]): Promise<MessagePollView> {
    return this.applyVote(user, pollId, [...new Set(optionIds)]);
  }

  /** Bỏ phiếu: xoá `PollVote`, `voterCount − 1`. Chưa bầu = không đổi gì. */
  async unvote(user: AuthUser, pollId: string): Promise<MessagePollView> {
    return this.applyVote(user, pollId, []);
  }

  /** Đóng sớm: người tạo hoặc moderator phạm vi; khảo sát đã đóng → trả nguyên trạng (idempotent). Đóng NGUYÊN TỬ — hai bên đóng cùng lúc chỉ một thắng. */
  async close(user: AuthUser, pollId: string): Promise<MessagePollView> {
    const { poll, canModerate } = await this.requireReadable(user, pollId);
    const mine = await this.d.votes.findMine([poll.id], user.id);
    const view = (p: PollEntity): MessagePollView => toPollView(p, { viewerId: user.id, myOptionIds: mine.get(p.id) ?? [], canModerate, now: this.now() });
    if (poll.status === "CLOSED") return view(poll);

    const byCreator = poll.createdBy === user.id;
    if (!byCreator && !canModerate) throw new ForbiddenError();

    const closed = await this.d.polls.close(poll.id, { reason: byCreator ? "BY_CREATOR" : "BY_MODERATOR", closedBy: user.id, at: this.now() });
    if (closed) await this.d.publisher.changed(closed, { immediate: true });
    return view(closed ?? (await this.d.polls.findById(poll.id)) ?? poll);
  }

  /** Người bầu một lựa chọn (khảo sát KHÔNG ẩn danh). Ẩn danh → 403 `POLL_006` cho MỌI người, kể cả người tạo (POLL-03). Tài khoản đã ẩn danh hoá hiện "Tài khoản đã xoá". */
  async voters(user: AuthUser, pollId: string, query: VotersQueryDto): Promise<CursorPage<VoterView>> {
    const { poll } = await this.requireReadable(user, pollId);
    if (poll.anonymous) throw chatErrors.pollAnonymous();
    if (!poll.options.some((o) => o.id === query.optionId)) throw chatErrors.pollNotFound();

    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (query.cursor && !cursor) throw new ValidationError("Cursor không hợp lệ");
    const rows = await this.d.votes.listVoters(poll.id, query.optionId, cursor, query.limit + 1);
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const people = await this.d.directory.users(page.map((r) => r.userId));
    const last = page[page.length - 1];
    return {
      data: page.map((r) => {
        const person = people.get(r.userId);
        const gone = !person || person.status === "ANONYMIZED";
        return { id: r.userId, name: gone ? DELETED_USER_NAME : person.name, avatar: gone ? null : person.avatar, votedAt: r.votedAt };
      }),
      nextCursor: hasMore && last ? encodeCursor(last.votedAt, last.voteId) : null,
      hasMore,
      limit: query.limit,
    };
  }

  // ── Job / hệ thống ─────────────────────────────────────────────────────────────

  /** Job `poll.close`: đóng khi đến `closesAt` (CAS `OPEN`, kiểm `closesAt ≤ now + 1 s` — hàng cũ của khảo sát đã đóng sớm/đổi hạn là no-op). */
  async closeExpired(pollId: string): Promise<"CLOSED" | "SKIPPED"> {
    const poll = await this.d.polls.findById(pollId);
    if (!poll || poll.status !== "OPEN" || !poll.closesAt) return "SKIPPED";
    if (poll.closesAt.getTime() > this.now().getTime() + 1000) return "SKIPPED";
    const closed = await this.d.polls.close(pollId, { reason: "EXPIRED", closedBy: null, at: this.now() });
    if (!closed) return "SKIPPED";
    await this.d.publisher.changed(closed, { immediate: true });
    return "CLOSED";
  }

  /** Job `poll.message-deleted` (tin khảo sát bị thu hồi/gỡ): đóng `MESSAGE_RECALLED` để không ai bầu vào khảo sát đã biến mất. Idempotent. */
  async closeForRecalledMessage(messageId: string): Promise<"CLOSED" | "SKIPPED"> {
    const poll = await this.d.polls.findByMessageId(messageId);
    if (!poll) return "SKIPPED";
    const closed = await this.d.polls.close(poll.id, { reason: "MESSAGE_RECALLED", closedBy: null, at: this.now() });
    if (!closed) return "SKIPPED";
    await this.d.publisher.changed(closed, { immediate: true });
    return "CLOSED";
  }

  /** Cron quét bù: đóng các khảo sát quá hạn mà job hẹn giờ bị lỡ. Trả số khảo sát đã đóng. */
  async sweepExpired(limit = 200): Promise<number> {
    const due = await this.d.polls.findDueToClose(new Date(this.now().getTime() - 60_000), limit);
    let closed = 0;
    for (const poll of due) if ((await this.closeExpired(poll.id)) === "CLOSED") closed += 1;
    return closed;
  }

  // ── Nội bộ ─────────────────────────────────────────────────────────────────────

  /**
   * Ghi phiếu (`optionIds` rỗng = bỏ phiếu). Thử tối đa `VOTE_ATTEMPTS` lần khi CAS `version` lệch hoặc trùng khoá lần bầu đầu (đua): mỗi lần đọc LẠI khảo sát + phiếu cũ nên đếm luôn đúng.
   * CAS đếm ghi TRƯỚC, phiếu ghi SAU trong cùng transaction — lỗi ở phiếu làm rollback cả đếm (Mongo) và bản in-memory chưa ghi gì khi CAS thua.
   */
  private async applyVote(user: AuthUser, pollId: string, optionIds: string[]): Promise<MessagePollView> {
    const sleep = this.d.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    for (let attempt = 0; attempt < VOTE_ATTEMPTS; attempt += 1) {
      if (attempt > 0) await sleep(Math.floor(Math.random() * RETRY_JITTER_MS * attempt));
      const { poll, canModerate } = await this.requireReadable(user, pollId);
      const now = this.now();
      if (poll.status === "CLOSED" || (poll.closesAt && poll.closesAt.getTime() <= now.getTime())) throw chatErrors.pollClosed();
      if (optionIds.length > 0) this.assertChoice(poll, optionIds);

      const old = await this.d.votes.find(poll.id, user.id);
      const oldIds = old?.optionIds ?? [];
      const view = (p: PollEntity, mine: string[]): MessagePollView => toPollView(p, { viewerId: user.id, myOptionIds: mine, canModerate, now });
      if (sameIdSet(oldIds, optionIds)) return view(poll, oldIds);

      const options = poll.options.map((o) => ({ ...o, voteCount: o.voteCount - (oldIds.includes(o.id) ? 1 : 0) + (optionIds.includes(o.id) ? 1 : 0) }));
      // Số NGƯỜI đã bầu: bầu lần đầu +1; đổi lựa chọn 0; bỏ phiếu −1 (bỏ phiếu khi chưa bầu đã trả ở `sameIdSet` phía trên).
      const delta = optionIds.length === 0 ? -1 : old ? 0 : 1;

      try {
        const updated = await this.d.tx.run(async (tx) => {
          const next = await this.d.polls.updateCounts(poll.id, poll.version, { options, voterCount: poll.voterCount + delta }, tx);
          if (!next) return null;
          if (optionIds.length === 0) await this.d.votes.delete(poll.id, user.id, tx);
          else await this.d.votes.upsert(poll.id, user.id, optionIds, tx);
          return next;
        });
        if (updated) {
          await this.d.publisher.changed(updated);
          return view(updated, optionIds);
        }
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    throw chatErrors.busy();
  }

  private assertChoice(poll: PollEntity, optionIds: string[]): void {
    const known = new Set(poll.options.map((o) => o.id));
    if (optionIds.some((id) => !known.has(id))) throw chatErrors.pollNotFound();
    if (!poll.multi && optionIds.length > 1) throw chatErrors.pollSingleChoiceOnly();
  }

  /** Khảo sát + quyền ĐỌC tin chứa nó (người dùng còn thấy phạm vi, tin chưa thu hồi). Không thoả → 404 `POLL_005` (trung tính). */
  private async requireReadable(user: AuthUser, pollId: string): Promise<{ poll: PollEntity; canModerate: boolean }> {
    const poll = await this.d.polls.findById(pollId);
    if (!poll) throw chatErrors.pollNotFound();
    const readable = await this.d.sender.getReadable(user.id, poll.messageId);
    if (!readable || readable.deletedAt !== null) throw chatErrors.pollNotFound();
    return { poll, canModerate: readable.myPermissions.canModerate };
  }

  /** Chuẩn hoá lựa chọn: cắt khoảng trắng, độ dài theo grapheme, trùng (sau `normalizeSearch`) hoặc ngoài `[optionsMin, optionsMax]` → `POLL_001`. */
  private buildOptions(raw: string[], limits: ChatExtLimits): PollOptionEntity[] {
    const texts = raw.map((t) => t.trim());
    if (texts.length < limits.poll.optionsMin || texts.length > limits.poll.optionsMax) throw chatErrors.pollOptionsInvalid();
    if (texts.some((t) => t.length === 0 || graphemeLength(t) > limits.poll.optionMax)) throw chatErrors.pollOptionsInvalid();
    if (new Set(texts.map((t) => normalizeSearch(t))).size !== texts.length) throw chatErrors.pollOptionsInvalid();
    const makeId = this.d.randomId ?? defaultRandomId;
    const used = new Set<string>();
    return texts.map((text) => {
      let id = makeId();
      while (used.has(id)) id = makeId();
      used.add(id);
      return { id, text, voteCount: 0, addedBy: null };
    });
  }
}
