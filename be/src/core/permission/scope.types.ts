import type { AuthUser } from "../types/express";
import type { Action } from "./actions";

/**
 * Loại scope nghiệp vụ mà `PermissionService` biết cách kiểm quyền. Module
 * Phase 1+ đăng ký `ScopeResolver` cho từng loại — `core/permission` KHÔNG
 * biết gì về dữ liệu thật (`WorkspaceMembership`, `ChannelGrant`, ...).
 *
 * `BOARD` (Phase 3, p3-02): scope của một bảng công việc — chỉ để `requireScope`/guard room `board:{id}`/
 * `revokeScope` (cascade từ WORKSPACE) có đích. Resolver `BOARD` (đăng ký bởi `modules/projects`) uỷ quyền cho
 * `WORKSPACE` cha (`ctx.resolve(parent)`) và trả lại `role` của cha (để `GUEST_HIDDEN_ACTIONS` → 404 hoạt động).
 * Thẻ/nhãn/bình luận KHÔNG có scope riêng — luôn kiểm qua board → workspace.
 */
export type ScopeType = "WORKSPACE" | "CHANNEL" | "CONVERSATION" | "MEETING" | "CALL" | "BOARD" | "DOCUMENT" | "WHITEBOARD" | "COMPANY";

/** Tham chiếu tới 1 scope cụ thể — vd `{ type: "CHANNEL", id: "65f..." }`. */
export interface ScopeRef {
  type: ScopeType;
  id: string;
}

/**
 * Kết quả kiểm quyền của 1 user với 1 scope — nguồn sự thật duy nhất cho
 * `can()`/`assert()` và cho `buildMyPermissions()`.
 */
export interface ResolvedAccess {
  /** `false` → scope không tồn tại HOẶC user không được thấy (map ra 404 trung tính). */
  visible: boolean;
  /** Vai trò của user trong scope (OWNER | MANAGER | HOST | ...) — chỉ để hiển thị/debug, KHÔNG dùng để so quyền trực tiếp ngoài `require*Role`. */
  role: string | null;
  /** Tập hành động user được làm trong scope này. */
  actions: ReadonlySet<Action>;
  /** Scope cha (vd WORKSPACE cho CHANNEL/CONVERSATION(GROUP)/MEETING) — dùng khi resolver con cần `ctx.resolve(parent)`. */
  parent?: ScopeRef;
  /**
   * p3-04 — quyền TỰ HẾT HIỆU LỰC lúc này (khách hết hạn): cache quyền (`permission.cache.ts`) coi mục cache quá hạn này
   * là "không thấy" ngay cả khi TTL cache chưa hết và job hết hạn chưa chạy. Resolver con (CHANNEL…) sao chép từ WORKSPACE cha.
   */
  expiresAt?: Date;
  /** Scope cha có version ảnh hưởng tới cache của scope này (be.md §5.1 bước 2) — vd bump WORKSPACE làm cache mọi CHANNEL con tự vô hiệu mà không cần INCR từng cái. */
  versionDeps?: ScopeRef[];
}

/**
 * Ngữ cảnh truyền cho `ScopeResolver.resolve()` — cho phép resolver gọi đệ
 * quy sang scope khác (vd CHANNEL resolver gọi `ctx.resolve(user, parentWs)`)
 * mà VẪN đi qua cache/dedupe của `PermissionService`, không tự query lại.
 */
export interface ResolveContext {
  resolve(user: AuthUser, scope: ScopeRef): Promise<ResolvedAccess>;
  now: Date;
}

/**
 * Hợp đồng module Phase 1+ phải cài đặt và đăng ký (`registerScopeResolver`)
 * lúc import routes của module đó — `core/permission` chỉ giữ registry, không
 * bao giờ tự import module để tự đăng ký (giữ luật 3 tầng).
 */
export interface ScopeResolver {
  type: ScopeType;
  /** Kiểm quyền 1 scope. Ném lỗi (DB down, timeout) → `PermissionService` bọc thành 503 fail-closed. */
  resolve(user: AuthUser, scopeId: string, ctx: ResolveContext): Promise<ResolvedAccess>;
  /** Batch — tối ưu N+1 khi cần liệt kê nhiều scope cùng lúc (vd danh sách kênh). Không bắt buộc. */
  resolveMany?(user: AuthUser, scopeIds: string[], ctx: ResolveContext): Promise<Map<string, ResolvedAccess>>;
  /** Scope con cần bump version/leave room theo khi scope này bị thu hồi (vd rời WORKSPACE → mọi CONVERSATION GROUP). */
  children?(scopeId: string): Promise<ScopeRef[]>;
  /** Tên room Socket.IO gắn với scope này (vd `ch:{id}`) — dùng khi `revokeScope` cần đá user khỏi room. */
  roomsFor?(scopeId: string): string[];
}
