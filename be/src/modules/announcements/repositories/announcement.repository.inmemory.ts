import type { OutboxEventInput } from "../../../infrastructure/queue/outbox/outbox.types";
import type { CursorPoint } from "../../../core/utils/search-query";
import type {
  AnnouncementChannel,
  AnnouncementMessage,
  AnnouncementReceipt,
  AnnouncementRequest,
} from "../entities/announcement.interface";
import type {
  AnnouncementUserBrief,
  ConfirmResult,
  CreateRequestInput,
  IAnnouncementLookupRepository,
  IAnnouncementRepository,
} from "./announcement.repository.interface";

let seq = 0;
const nextId = (): string => (++seq).toString(16).padStart(24, "0");

/** Repository in-memory cho unit test `AnnouncementService` — cùng ngữ nghĩa bản Prisma (một yêu cầu/tin, một biên nhận/người). */
export class InMemoryAnnouncementRepository implements IAnnouncementRepository {
  requests: AnnouncementRequest[] = [];
  receipts: AnnouncementReceipt[] = [];
  /** Các sự kiện outbox đã "ghi" (để test assert). */
  events: OutboxEventInput[] = [];

  async findByMessageId(messageId: string): Promise<AnnouncementRequest | null> {
    return this.requests.find((r) => r.messageId === messageId) ?? null;
  }

  async findById(id: string): Promise<AnnouncementRequest | null> {
    return this.requests.find((r) => r.id === id) ?? null;
  }

  async listByChannel(channelId: string, limit: number): Promise<AnnouncementRequest[]> {
    return this.requests
      .filter((r) => r.channelId === channelId && r.cancelledAt === null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
      .slice(0, limit);
  }

  async countActive(channelId: string, now: Date): Promise<number> {
    return this.requests.filter((r) => r.channelId === channelId && r.cancelledAt === null && (r.deadlineAt === null || r.deadlineAt > now)).length;
  }

  async create(input: CreateRequestInput, events: OutboxEventInput[]): Promise<{ request: AnnouncementRequest; created: boolean }> {
    const existing = await this.findByMessageId(input.messageId);
    if (existing) return { request: existing, created: false };
    const request: AnnouncementRequest = {
      id: nextId(),
      ...input,
      confirmedCount: 0,
      cancelledAt: null,
      cancelledBy: null,
      createdAt: new Date(),
    };
    this.requests.push(request);
    this.events.push(...events);
    return { request, created: true };
  }

  async reactivate(id: string, deadlineAt: Date | null, events: OutboxEventInput[]): Promise<AnnouncementRequest> {
    const request = this.requests.find((r) => r.id === id)!;
    request.cancelledAt = null;
    request.cancelledBy = null;
    request.deadlineAt = deadlineAt;
    this.events.push(...events);
    return request;
  }

  async cancel(id: string, cancelledBy: string, at: Date): Promise<AnnouncementRequest | null> {
    const request = this.requests.find((r) => r.id === id);
    if (!request || request.cancelledAt !== null) return null;
    request.cancelledAt = at;
    request.cancelledBy = cancelledBy;
    return request;
  }

  async findReceipt(requestId: string, userId: string): Promise<AnnouncementReceipt | null> {
    return this.receipts.find((r) => r.requestId === requestId && r.userId === userId) ?? null;
  }

  async confirm(requestId: string, userId: string, at: Date): Promise<ConfirmResult> {
    const request = this.requests.find((r) => r.id === requestId)!;
    const existing = await this.findReceipt(requestId, userId);
    if (existing) return { created: false, receipt: existing, confirmedCount: request.confirmedCount };
    const receipt: AnnouncementReceipt = { id: nextId(), requestId, userId, confirmedAt: at };
    this.receipts.push(receipt);
    request.confirmedCount += 1;
    return { created: true, receipt, confirmedCount: request.confirmedCount };
  }

  async confirmedRequestIds(userId: string, requestIds: readonly string[]): Promise<Set<string>> {
    return new Set(this.receipts.filter((r) => r.userId === userId && requestIds.includes(r.requestId)).map((r) => r.requestId));
  }

  async listReceipts(requestId: string, limit: number, before?: CursorPoint): Promise<AnnouncementReceipt[]> {
    return this.receipts
      .filter((r) => r.requestId === requestId)
      .sort((a, b) => b.confirmedAt.getTime() - a.confirmedAt.getTime() || b.id.localeCompare(a.id))
      .filter((r) => !before || r.confirmedAt < before.at || (r.confirmedAt.getTime() === before.at.getTime() && r.id < before.id))
      .slice(0, limit);
  }

  async confirmedUserIds(requestId: string, userIds: readonly string[]): Promise<Set<string>> {
    return new Set(this.receipts.filter((r) => r.requestId === requestId && userIds.includes(r.userId)).map((r) => r.userId));
  }
}

export class InMemoryAnnouncementLookupRepository implements IAnnouncementLookupRepository {
  messages = new Map<string, AnnouncementMessage>();
  channels = new Map<string, AnnouncementChannel>();
  names = new Map<string, string>();
  /** `userId → avatarAssetId` (vắng = chưa đặt ảnh). */
  avatars = new Map<string, string>();
  readers = new Map<string, string[]>();

  async findMessage(messageId: string): Promise<AnnouncementMessage | null> {
    return this.messages.get(messageId) ?? null;
  }
  async findChannel(channelId: string): Promise<AnnouncementChannel | null> {
    return this.channels.get(channelId) ?? null;
  }
  async userBriefs(userIds: readonly string[]): Promise<Map<string, AnnouncementUserBrief>> {
    return new Map(
      userIds.flatMap((id) => {
        const name = this.names.get(id);
        return name === undefined ? [] : [[id, { name, avatarAssetId: this.avatars.get(id) ?? null }] as const];
      })
    );
  }
  async channelReaderIds(channelId: string): Promise<string[]> {
    return this.readers.get(channelId) ?? [];
  }
}
