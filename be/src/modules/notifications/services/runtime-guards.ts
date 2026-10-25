/**
 * Chốt chặn "worker riêng chưa boot registry" (p1-07 §10). `router.ts` mới là nơi đăng ký `MessageScope` (CHANNEL/CONVERSATION,
 * `registerChannelModule()`/`registerConversationModule()`) và resolver quyền (`registerScopeResolver` lúc import `*.routes.ts`);
 * tiến trình `PROCESS_ROLE=worker` (`dist/worker.js`) KHÔNG import `router.ts` nên hai registry này RỖNG ở đó (đã kiểm bằng
 * `registerAllJobs()` trần: không có scope nào). Nếu để mặc định thì fan-out coi audience = [] (im lặng không thông báo cho ai) và
 * `push.send` coi người nhận "mất quyền" (HUỶ mục hộp thư thật). Nên thiếu registry phải NÉM LỖI: job thất bại/thử lại/hiện ở
 * danh sách job lỗi thay vì lặng lẽ bỏ thông báo hay xoá dữ liệu.
 */

const HINT =
  "tiến trình worker riêng phải boot registry giống router.ts (registerChannelModule/registerConversationModule + resolver quyền) — xem README p1-07 §10";

export function requireRegisteredMessageScope<T>(scope: T | undefined | null, scopeType: string): T {
  if (!scope) throw new Error(`[notifications] MessageScope "${scopeType}" chưa đăng ký ở tiến trình này: ${HINT}`);
  return scope;
}

export function requireRegisteredResolver(resolver: unknown, scopeType: string): void {
  if (!resolver) throw new Error(`[notifications] ScopeResolver "${scopeType}" chưa đăng ký ở tiến trình này: ${HINT}`);
}
