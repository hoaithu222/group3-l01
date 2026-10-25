import { newObjectId } from "../../../core/utils/object-id";
import type { DecodedCursor, MessageReminderEntity, MessageReminderStatus, ReminderCreateInput } from "../entities/chat-extensions.types";
import type { IMessageReminderRepository } from "./message-reminder.repository.interface";
import type { TxHandle } from "./tx";

/** In-memory cho unit test — giữ ngữ nghĩa CAS `PENDING → FIRED/CANCELLED` của bản Prisma. */
export class InMemoryMessageReminderRepository implements IMessageReminderRepository {
  private readonly rows = new Map<string, MessageReminderEntity>();

  constructor(private readonly clock: () => Date = () => new Date()) {}

  private save(r: MessageReminderEntity): MessageReminderEntity {
    this.rows.set(r.id, { ...r, updatedAt: this.clock() });
    return { ...(this.rows.get(r.id) as MessageReminderEntity) };
  }

  async create(input: ReminderCreateInput, _tx: TxHandle): Promise<MessageReminderEntity> {
    const now = this.clock();
    const created: MessageReminderEntity = {
      id: newObjectId(),
      ...input,
      status: "PENDING",
      firedAt: null,
      unavailable: false,
      notificationId: null,
      cancelledAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(created.id, created);
    return { ...created };
  }

  async findById(id: string, _tx?: TxHandle): Promise<MessageReminderEntity | null> {
    const r = this.rows.get(id);
    return r ? { ...r } : null;
  }

  async countPending(userId: string, _tx?: TxHandle): Promise<number> {
    return [...this.rows.values()].filter((r) => r.userId === userId && r.status === "PENDING").length;
  }

  async cancel(id: string, userId: string, at: Date, _tx?: TxHandle): Promise<MessageReminderEntity | null> {
    const r = this.rows.get(id);
    if (!r || r.userId !== userId || r.status !== "PENDING") return null;
    return this.save({ ...r, status: "CANCELLED", cancelledAt: at });
  }

  async claimFire(id: string, input: { at: Date; unavailable: boolean }, _tx: TxHandle): Promise<MessageReminderEntity | null> {
    const r = this.rows.get(id);
    if (!r || r.status !== "PENDING") return null;
    return this.save({ ...r, status: "FIRED", firedAt: input.at, unavailable: input.unavailable });
  }

  async listMine(userId: string, status: Exclude<MessageReminderStatus, "CANCELLED">, cursor: DecodedCursor | null, limit: number): Promise<MessageReminderEntity[]> {
    const asc = status === "PENDING";
    return [...this.rows.values()]
      .filter((r) => r.userId === userId && r.status === status)
      .sort((a, b) => (asc ? 1 : -1) * (a.remindAt.getTime() - b.remindAt.getTime() || (a.id < b.id ? -1 : 1)))
      .filter((r) => {
        if (!cursor) return true;
        const cmp = r.remindAt.getTime() - cursor.at.getTime() || (r.id < cursor.id ? -1 : r.id > cursor.id ? 1 : 0);
        return asc ? cmp > 0 : cmp < 0;
      })
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }

  async findMissed(missedBefore: Date, limit: number): Promise<MessageReminderEntity[]> {
    return [...this.rows.values()]
      .filter((r) => r.status === "PENDING" && r.remindAt.getTime() < missedBefore.getTime())
      .sort((a, b) => a.remindAt.getTime() - b.remindAt.getTime())
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }

  async cancelPendingOfUser(userId: string, at: Date): Promise<number> {
    let n = 0;
    for (const r of [...this.rows.values()]) {
      if (r.userId === userId && r.status === "PENDING") {
        this.save({ ...r, status: "CANCELLED", cancelledAt: at });
        n += 1;
      }
    }
    return n;
  }
}
