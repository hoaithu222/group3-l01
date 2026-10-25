import { newObjectId } from "../../../core/utils/object-id";
import type { PollCloseReason, PollCreateInput, PollEntity } from "../entities/chat-extensions.types";
import type { IPollRepository, PollCountsPatch } from "./poll.repository.interface";
import type { TxHandle } from "./tx";

const clone = (p: PollEntity): PollEntity => ({ ...p, options: p.options.map((o) => ({ ...o })) });

/** Repository in-memory cho unit test — giữ ngữ nghĩa quan trọng của bản Prisma: `messageId` unique, CAS `version`+`OPEN` ở `updateCounts`, đóng nguyên tử. */
export class InMemoryPollRepository implements IPollRepository {
  private readonly rows = new Map<string, PollEntity>();

  constructor(private readonly clock: () => Date = () => new Date()) {}

  async create(input: PollCreateInput, _tx: TxHandle): Promise<PollEntity> {
    if ([...this.rows.values()].some((p) => p.messageId === input.messageId)) throw new Error(`Poll.messageId trùng: ${input.messageId}`);
    const now = this.clock();
    const poll: PollEntity = {
      id: newObjectId(),
      ...input,
      options: input.options.map((o) => ({ ...o })),
      allowAddOptions: false,
      status: "OPEN",
      closedAt: null,
      closedBy: null,
      closeReason: null,
      voterCount: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(poll.id, poll);
    return clone(poll);
  }

  async findById(id: string, _tx?: TxHandle): Promise<PollEntity | null> {
    const p = this.rows.get(id);
    return p ? clone(p) : null;
  }

  async findByMessageId(messageId: string, _tx?: TxHandle): Promise<PollEntity | null> {
    const p = [...this.rows.values()].find((x) => x.messageId === messageId);
    return p ? clone(p) : null;
  }

  async findByMessageIds(messageIds: string[]): Promise<PollEntity[]> {
    const wanted = new Set(messageIds);
    return [...this.rows.values()].filter((p) => wanted.has(p.messageId)).map(clone);
  }

  async updateCounts(id: string, expectedVersion: number, patch: PollCountsPatch, _tx: TxHandle): Promise<PollEntity | null> {
    const p = this.rows.get(id);
    if (!p || p.version !== expectedVersion || p.status !== "OPEN") return null;
    const next: PollEntity = { ...p, options: patch.options.map((o) => ({ ...o })), voterCount: patch.voterCount, version: p.version + 1, updatedAt: this.clock() };
    this.rows.set(id, next);
    return clone(next);
  }

  async close(id: string, input: { reason: PollCloseReason; closedBy: string | null; at: Date }, _tx?: TxHandle): Promise<PollEntity | null> {
    const p = this.rows.get(id);
    if (!p || p.status !== "OPEN") return null;
    const next: PollEntity = { ...p, status: "CLOSED", closedAt: input.at, closedBy: input.closedBy, closeReason: input.reason, version: p.version + 1, updatedAt: this.clock() };
    this.rows.set(id, next);
    return clone(next);
  }

  async replaceCounts(id: string, patch: PollCountsPatch, _tx?: TxHandle): Promise<PollEntity | null> {
    const p = this.rows.get(id);
    if (!p) return null;
    const next: PollEntity = { ...p, options: patch.options.map((o) => ({ ...o })), voterCount: patch.voterCount, version: p.version + 1, updatedAt: this.clock() };
    this.rows.set(id, next);
    return clone(next);
  }

  async findDueToClose(now: Date, limit: number): Promise<PollEntity[]> {
    return [...this.rows.values()]
      .filter((p) => p.status === "OPEN" && p.closesAt !== null && p.closesAt.getTime() <= now.getTime())
      .sort((a, b) => (a.closesAt as Date).getTime() - (b.closesAt as Date).getTime())
      .slice(0, limit)
      .map(clone);
  }
}
