import type { OutboxEventInput } from "../../../infrastructure/queue/outbox/outbox.types";
import type { CursorPoint } from "../../../core/utils/search-query";
import type {
  AnnouncementChannel,
  AnnouncementMessage,
  AnnouncementReceipt,
  AnnouncementRequest,
} from "../entities/announcement.interface";

export interface CreateRequestInput {
  messageId: string;
  channelId: string;
  workspaceId: string;
  requestedBy: string;
  deadlineAt: Date | null;
}

export interface ConfirmResult {
  /** `false` khi người này đã xác nhận từ trước (idempotent) — không cộng thêm. */
  created: boolean;
  receipt: AnnouncementReceipt;
  confirmedCount: number;
}

/** Yêu cầu + biên nhận xác nhận. Ghi kèm outbox TRONG cùng transaction (fan-out thông báo, nhắc hạn). */
export interface IAnnouncementRepository {
  findByMessageId(messageId: string): Promise<AnnouncementRequest | null>;
  findById(id: string): Promise<AnnouncementRequest | null>;
  /** Yêu cầu CHƯA huỷ của kênh, mới nhất trước (kể cả đã hết hạn) — app dựng huy hiệu "Cần xác nhận". */
  listByChannel(channelId: string, limit: number): Promise<AnnouncementRequest[]>;
  /** Số yêu cầu còn hiệu lực: chưa huỷ VÀ (không hạn hoặc hạn còn ở tương lai). */
  countActive(channelId: string, now: Date): Promise<number>;

  /** Tạo yêu cầu MỚI + ghi `events` cùng transaction. Trùng `messageId` (yêu cầu song song) → `{ created: false }` bản đã có. */
  create(input: CreateRequestInput, events: OutboxEventInput[]): Promise<{ request: AnnouncementRequest; created: boolean }>;
  /** Kích hoạt lại yêu cầu đã huỷ/hết hạn với hạn mới (+ `events`); giữ nguyên biên nhận đã có. */
  reactivate(id: string, deadlineAt: Date | null, events: OutboxEventInput[]): Promise<AnnouncementRequest>;
  /** Huỷ nếu chưa huỷ (so-và-đổi); đã huỷ → `null` (idempotent ở service). */
  cancel(id: string, cancelledBy: string, at: Date): Promise<AnnouncementRequest | null>;

  findReceipt(requestId: string, userId: string): Promise<AnnouncementReceipt | null>;
  /** Tạo biên nhận + `$inc confirmedCount` cùng transaction; đã có → trả bản cũ, không cộng (RC-01). */
  confirm(requestId: string, userId: string, at: Date): Promise<ConfirmResult>;
  /** Trong `requestIds`, yêu cầu mà `userId` đã xác nhận. */
  confirmedRequestIds(userId: string, requestIds: readonly string[]): Promise<Set<string>>;
  /** Biên nhận mới → cũ (`confirmedAt desc, id desc`), lấy các bản CŨ HƠN `before`. */
  listReceipts(requestId: string, limit: number, before?: CursorPoint): Promise<AnnouncementReceipt[]>;
  /** Trong `userIds`, ai đã xác nhận `requestId`. */
  confirmedUserIds(requestId: string, userIds: readonly string[]): Promise<Set<string>>;
}

/** Người trong danh sách xác nhận: tên + ảnh (asset id thô — service đổi thành URL ký sẵn bằng `avatarUrlOf`). */
export interface AnnouncementUserBrief {
  name: string;
  avatarAssetId: string | null;
}

/** Đọc tin + kênh + tên/ảnh người (module `messages`/`channels`/`users` — chỉ đọc). */
export interface IAnnouncementLookupRepository {
  findMessage(messageId: string): Promise<AnnouncementMessage | null>;
  findChannel(channelId: string): Promise<AnnouncementChannel | null>;
  /** `id → { tên, ảnh }` trong MỘT truy vấn; id không tồn tại bị bỏ khỏi map. */
  userBriefs(userIds: readonly string[]): Promise<Map<string, AnnouncementUserBrief>>;
  /**
   * Người ĐỌC ĐƯỢC kênh lúc này (audience của yêu cầu xác nhận): kênh công khai = thành viên ACTIVE không phải khách + khách được chỉ
   * định còn hạn; kênh riêng tư = grant DIRECT ∪ người được phủ bởi grant theo vai trò, đều phải còn là thành viên ACTIVE. Tính độc lập
   * với registry `MessageScope` để job chạy được cả ở tiến trình worker riêng (không import `router.ts`).
   */
  channelReaderIds(channelId: string): Promise<string[]>;
}
