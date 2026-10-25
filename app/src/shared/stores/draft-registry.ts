import type { ScopeType } from '@/core/permission/scope';

type CleanupFn = () => void;

/**
 * Registry THUẦN (Map, không Zustand — app.md §5 của p0-02) cho nháp đang gõ
 * dở theo scope (vd tin nhắn chưa gửi trong 1 CONVERSATION). Feature chat
 * (Phase 1) đăng ký `registerDraftCleanup()` lúc ô nhập mount, KHÔNG cần biết
 * `permission-revoked.handler.ts` tồn tại — chỉ `clearScope()` được gọi TỪ đó
 * khi quyền scope bị thu hồi.
 *
 * ⚠️ Import `type { ScopeType }` THẲNG từ `core/permission/scope.ts` (không
 * qua barrel `@/core/permission`) — `permission-revoked.handler.ts` (nằm
 * trong barrel đó) lại import `clearScope` từ CHÍNH file này. Import qua
 * barrel sẽ tạo vòng `draft-registry → core/permission (barrel) →
 * permission-revoked.handler → draft-registry`; `import/no-cycle` (ESLint,
 * `maxDepth: Infinity`) sẽ đỏ, và trên RN vòng import hiện ra lúc CHẠY dưới
 * dạng `undefined is not a function` chứ không phải lỗi biên dịch rõ ràng.
 */
const registry = new Map<string, Set<CleanupFn>>();

function keyOf(scopeType: ScopeType, scopeId: string): string {
  return `${scopeType}:${scopeId}`;
}

/** Đăng ký 1 nháp thuộc scope — trả về hàm huỷ đăng ký (gọi lúc ô nhập unmount). */
export function registerDraftCleanup(
  scopeType: ScopeType,
  scopeId: string,
  cleanup: CleanupFn,
): () => void {
  const key = keyOf(scopeType, scopeId);
  let set = registry.get(key);
  if (!set) {
    set = new Set();
    registry.set(key, set);
  }
  set.add(cleanup);

  return () => {
    const current = registry.get(key);
    if (!current) return;
    current.delete(cleanup);
    if (current.size === 0) registry.delete(key);
  };
}

/** Xoá MỌI nháp của 1 scope — gọi từ `permission-revoked.handler.ts`. */
export function clearScope(scopeType: ScopeType, scopeId: string): void {
  const key = keyOf(scopeType, scopeId);
  const set = registry.get(key);
  if (!set) return;
  set.forEach((cleanup) => cleanup());
  registry.delete(key);
}

/** CHỈ dùng trong test: xoá sạch registry giữa các case. */
export function resetDraftRegistry(): void {
  registry.clear();
}
