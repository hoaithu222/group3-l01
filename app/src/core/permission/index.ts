/**
 * Kiểm soát truy cập theo scope, phía App (p0-02) — BE tương ứng ở
 * `be/src/core/permission/`.
 *
 *   scope.ts                       ScopeType, ScopeRef, scopeKeyOf, matchesScope
 *   scope-registry.ts              registerScopeCleanup() — feature Phase 1+ đăng ký
 *   permission-revoked.handler.ts  xử lý socket `permission:revoked` (ACL-10)
 *   use-permission.ts              usePermission()/useCan() đọc `myPermissions`
 */
export { matchesScope, SCOPE_TYPES, scopeKeyOf } from './scope';
export type { RevokedScopeInfo, ScopeRef, ScopeType } from './scope';

export { getScopeCleanups, registerScopeCleanup, resetScopeRegistry } from './scope-registry';
export type { CurrentRoute, ScopeCleanupOptions } from './scope-registry';

export { handlePermissionRevoked, usePermissionRevokedHandler } from './permission-revoked.handler';

export { useCan, usePermission } from './use-permission';
