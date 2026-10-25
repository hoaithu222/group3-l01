/**
 * Scope nghiệp vụ mà App biết dọn cache/route khi bị thu hồi quyền — khớp
 * `ScopeType` phía BE (`be/src/core/permission/scope.types.ts`).
 *
 * ⛔ KHÔNG import `PermissionRevokedPayload` (`core/socket/socket.events.ts`)
 * để tái dùng union đó — cố ý giữ file này KHÔNG phụ thuộc `core/socket`, hai
 * union chỉ cần khớp GIÁ TRỊ, không cần khớp KIỂU. `matchesScope()` bên dưới vì
 * vậy nhận một object cấu trúc (structural), không nhận thẳng payload.
 */
export const SCOPE_TYPES = ['WORKSPACE', 'CHANNEL', 'CONVERSATION', 'MEETING', 'CALL'] as const;

export type ScopeType = (typeof SCOPE_TYPES)[number];

/** Tham chiếu một scope cụ thể, vd `{ type: 'CHANNEL', id: '65f…' }`. */
export interface ScopeRef {
  type: ScopeType;
  id: string;
}

/** Khoá chuỗi ổn định cho 1 scope — dùng làm khoá `Map` (registry nháp, …). */
export function scopeKeyOf(type: ScopeType, id: string): string {
  return `${type}:${id}`;
}

/** Phần payload `matchesScope()` cần — tách riêng để không phụ thuộc `core/socket`. */
export interface RevokedScopeInfo {
  cascade: boolean;
  scopeId: string;
  scopeType: ScopeType;
}

/**
 * Query key có khớp scope vừa bị thu hồi không — theo quy ước
 * (`app/docs/rules/api-patterns.md`, xem thêm `app.md` §4 của p0-02):
 *
 *   · `[domain, scopeType, scopeId, …]` — mọi query theo 1 scope cụ thể.
 *   · `[domain, workspaceId, …]` — danh sách CẤP WORKSPACE (channels,
 *     conversations GROUP, meetings…), chỉ khớp khi scope bị thu hồi CHÍNH LÀ
 *     WORKSPACE và có `cascade: true` (rời/bị đá khỏi workspace kéo theo mất
 *     quyền toàn bộ danh sách con).
 *
 * ⛔ KHÔNG dùng prefix-match có sẵn của `removeQueries({queryKey})` cho việc
 * này: core không biết `domain` (phần tử ĐẦU) của từng feature, nên phải QUÉT
 * bằng `predicate` thay vì khớp đúng 1 tiền tố cố định.
 */
export function matchesScope(queryKey: readonly unknown[], scope: RevokedScopeInfo): boolean {
  const [, second, third] = queryKey;
  if (second === scope.scopeType && third === scope.scopeId) return true;
  if (scope.cascade && scope.scopeType === 'WORKSPACE' && second === scope.scopeId) return true;
  return false;
}
