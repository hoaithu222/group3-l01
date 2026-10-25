import type { SavedListParams, SavedMessageCreateInput, SavedMessageRecord } from "../entities/discovery.interface";
import type { ISavedMessageRepository } from "./saved-message.repository.interface";

/** Repository in-memory cho unit test — mô phỏng unique `(userId, messageId)` và thứ tự `createdAt desc, id desc`. */
export class InMemorySavedMessageRepository implements ISavedMessageRepository {
  private readonly rows: SavedMessageRecord[] = [];
  private seqId = 0;
  /** Thời điểm tăng dần mỗi lần tạo để test cursor xác định (không phụ thuộc đồng hồ thật). */
  private clock = Date.UTC(2026, 0, 1);

  async findByUserAndMessage(userId: string, messageId: string): Promise<SavedMessageRecord | null> {
    return this.rows.find((r) => r.userId === userId && r.messageId === messageId) ?? null;
  }

  async create(input: SavedMessageCreateInput): Promise<{ record: SavedMessageRecord; created: boolean }> {
    const existing = await this.findByUserAndMessage(input.userId, input.messageId);
    if (existing) return { record: existing, created: false };
    this.seqId += 1;
    this.clock += 1000;
    const record: SavedMessageRecord = {
      id: this.seqId.toString(16).padStart(24, "0"),
      ...input,
      createdAt: new Date(this.clock),
    };
    this.rows.push(record);
    return { record, created: true };
  }

  async delete(userId: string, messageId: string): Promise<boolean> {
    const idx = this.rows.findIndex((r) => r.userId === userId && r.messageId === messageId);
    if (idx < 0) return false;
    this.rows.splice(idx, 1);
    return true;
  }

  async countByUser(userId: string): Promise<number> {
    return this.rows.filter((r) => r.userId === userId).length;
  }

  async list(params: SavedListParams): Promise<SavedMessageRecord[]> {
    const { at, id } = params.before ?? {};
    return this.rows
      .filter((r) => r.userId === params.userId)
      .filter((r) => !params.scopeType || r.scopeType === params.scopeType)
      .filter((r) => !params.workspaceId || r.workspaceId === params.workspaceId)
      .filter((r) => !at || r.createdAt < at || (r.createdAt.getTime() === at.getTime() && r.id < (id as string)))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
      .slice(0, params.limit);
  }

  async findSavedIds(userId: string, messageIds: readonly string[]): Promise<Set<string>> {
    const wanted = new Set(messageIds);
    return new Set(this.rows.filter((r) => r.userId === userId && wanted.has(r.messageId)).map((r) => r.messageId));
  }

  async deleteAllByUser(userId: string): Promise<number> {
    const before = this.rows.length;
    for (let i = this.rows.length - 1; i >= 0; i -= 1) if (this.rows[i].userId === userId) this.rows.splice(i, 1);
    return before - this.rows.length;
  }

  /** Seed thẳng bản ghi (bỏ qua giới hạn) — dùng test giới hạn `LIMITS.saved.max`. */
  seed(record: SavedMessageRecord): void {
    this.rows.push(record);
  }
}
