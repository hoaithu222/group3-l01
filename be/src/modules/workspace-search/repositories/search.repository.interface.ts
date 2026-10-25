import type { CursorPoint, MongoFilter } from "../../../core/utils/search-query";
import type { SearchScopeType } from "../entities/search.interface";

export interface SearchMessageRow {
  id: string;
  scopeType: SearchScopeType;
  scopeId: string;
  threadId: string | null;
  seq: number;
  authorId: string | null;
  content: string | null;
  mentions: { type: string; targetId: string | null; label: string | null }[];
  attachments: { assetId: string; kind: string; name: string; mime: string; size: number }[];
  createdAt: Date;
  deletedAt: Date | null;
}

export interface RawMessageSearchResult {
  rows: SearchMessageRow[];
  timedOut: boolean;
}

/** Truy vấn ĐỌC tin nhắn (`findRaw` + `maxTimeMS` — Prisma Client thường không có `maxTimeMS`). */
export interface IMessageSearchRepository {
  /** `filter` dạng Extended JSON; sắp `createdAt desc, _id desc`; hết `maxTimeMs` → `timedOut: true`. */
  search(filter: MongoFilter, limit: number, maxTimeMs: number): Promise<RawMessageSearchResult>;
  /** Trong `messageIds`, tin người dùng đã "xoá phía tôi" (`MessageHide`). */
  findHiddenMessageIds(userId: string, messageIds: string[]): Promise<Set<string>>;
  /** Trong `ids`, tin còn tồn tại (dùng kiểm tin gốc của reply thread). */
  findExistingMessageIds(ids: string[]): Promise<Set<string>>;
}

export interface MemberRow {
  userId: string;
  role: string;
  displayName: string | null;
}

/** Người dùng tối thiểu để hiển thị kết quả: tên + ảnh (asset id thô — searcher đổi thành URL ký sẵn bằng `avatarUrlOf`). */
export interface SearchUserBrief {
  name: string;
  avatarAssetId: string | null;
}

export interface ResourceRow {
  id: string;
  assetId: string;
  name: string;
  mime: string;
  size: number;
  type: string;
  createdAt: Date;
}

export interface MeetingRow {
  id: string;
  code: string;
  title: string;
  startAt: Date;
  endAt: Date;
  status: string;
}

export interface MeetingSearchInput {
  workspaceId: string;
  /** Regex neo đầu từ áp lên `normalizedTitle`. */
  regexes: readonly string[];
  /** Cuộc họp `visibility = WORKSPACE` cũng hiện (thành viên không phải khách). */
  includeWorkspaceVisible: boolean;
  /** Cuộc họp người tìm còn là người tham dự. */
  attendeeMeetingIds: readonly string[];
  /** `startAt` giảm dần — lấy các bản ghi CŨ HƠN cursor `(startAt, id)`. */
  before?: CursorPoint;
  limit: number;
}

export interface ResourceSearchInput {
  workspaceId: string;
  regexes: readonly string[];
  before?: CursorPoint;
  /** Khoảng `createdAt` `[from, to]` (bao gồm hai đầu) và người tải lên. */
  from?: Date;
  to?: Date;
  uploadedBy?: string;
  limit: number;
}

/** Truy vấn ĐỌC danh bạ: người, tài liệu kho, cuộc họp. */
export interface ICatalogSearchRepository {
  userNames(ids: readonly string[]): Promise<Map<string, string>>;
  /** Như `userNames` nhưng kèm ảnh (CÙNG một truy vấn) — tác giả tin, người trong kết quả tìm. */
  userBriefs(ids: readonly string[]): Promise<Map<string, SearchUserBrief>>;
  /** Thành viên ACTIVE (khách hết hạn bị loại), tối đa `limit`. */
  listActiveMembers(workspaceId: string, limit: number): Promise<MemberRow[]>;
  /** Trong `userIds`, user có `normalizedName` khớp mọi regex ⇒ `id → { tên, ảnh }`. */
  matchUsersByName(userIds: readonly string[], regexes: readonly string[]): Promise<Map<string, SearchUserBrief>>;
  searchResources(input: ResourceSearchInput): Promise<ResourceRow[]>;
  searchMeetings(input: MeetingSearchInput): Promise<MeetingRow[]>;
  /** Cuộc họp trong workspace mà người dùng còn là người tham dự. */
  attendeeMeetingIds(workspaceId: string, userId: string): Promise<string[]>;
}
