import type { MessageScopeTypeValue } from "../entities/message.interface";
import type { MessageScope } from "./message-scope.interface";

const registry = new Map<MessageScopeTypeValue, MessageScope>();

/**
 * Module cung cấp scope (CHANNEL — p1-03, CONVERSATION — p1-05) gọi hàm này
 * lúc import routes/bootstrap của MODULE ĐÓ (side-effect, giống
 * `registerScopeResolver` của `core/permission`) — KHÔNG import
 * `modules/messages` nội bộ (`services/`, `repositories/`), chỉ qua
 * `@modules/messages/public` (`.claude/rules/reuse-first.md`).
 *
 * Gọi lại với cùng `scopeType` sẽ GHI ĐÈ — hữu ích cho test dùng fake adapter.
 */
export function registerMessageScope(scopeType: MessageScopeTypeValue, impl: MessageScope): void {
  registry.set(scopeType, impl);
}

/**
 * `undefined` khi chưa có module nào đăng ký scope này — CHỦ Ý, không throw.
 * CONVERSATION chưa có adapter cho tới khi p1-05 build xong; mọi nơi gọi
 * `registry.get()` PHẢI coi `undefined` như "không tìm thấy" (404), không
 * phải lỗi lập trình (mục 3 báo cáo).
 */
export function getMessageScope(scopeType: MessageScopeTypeValue): MessageScope | undefined {
  return registry.get(scopeType);
}

/** Chỉ dùng trong test để cô lập giữa các case. */
export function clearMessageScopeRegistry(): void {
  registry.clear();
}
