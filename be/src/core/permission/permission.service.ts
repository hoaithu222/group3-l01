import type { AuthUser } from "../types/express";
import type { ScopeRef, ScopeType, ResolvedAccess } from "./scope.types";
import { GUEST_HIDDEN_ACTIONS, type Action } from "./actions";
import { ScopeNotFoundError, ScopeForbiddenError } from "../exceptions";
import { ErrorCode, ErrorMessages, type ErrorCodeType } from "../utils/error.codes";
import { resolveWithCache, resolveManyWithCache, bumpVersion } from "./permission.cache";
import { revokeScope, type RevokeInput } from "./revoke-scope";

/** be.md §8 — `assert` chọn mã 403 theo loại scope; còn lại (WORKSPACE, ...) dùng PERM_001. */
const FORBIDDEN_CODE_BY_SCOPE: Partial<Record<ScopeType, ErrorCodeType>> = {
  CHANNEL: ErrorCode.PERM_002,
  CONVERSATION: ErrorCode.PERM_003,
  MEETING: ErrorCode.PERM_004,
  CALL: ErrorCode.PERM_005,
};

function forbiddenErrorFor(scope: ScopeRef): ScopeForbiddenError {
  const code = FORBIDDEN_CODE_BY_SCOPE[scope.type] ?? ErrorCode.PERM_001;
  return new ScopeForbiddenError(ErrorMessages[code], code);
}

export interface PermissionService {
  resolve(user: AuthUser, scope: ScopeRef): Promise<ResolvedAccess>;
  can(user: AuthUser, action: Action, scope: ScopeRef): Promise<boolean>;
  assert(user: AuthUser, action: Action, scope: ScopeRef): Promise<ResolvedAccess>;
  resolveMany(user: AuthUser, type: ScopeType, ids: string[]): Promise<Map<string, ResolvedAccess>>;
  bumpVersion(scope: ScopeRef): Promise<number>;
  revokeScope(input: RevokeInput): Promise<void>;
}

/**
 * Singleton — điểm vào duy nhất module Phase 1+ dùng để kiểm quyền. KHÔNG
 * đọc DB/Redis trực tiếp ở đây — mọi truy cập dữ liệu đi qua
 * `ScopeResolver` (đăng ký bởi module) hoặc `permission.cache.ts`.
 */
export const permissionService: PermissionService = {
  resolve(user, scope) {
    return resolveWithCache(user, scope);
  },

  async can(user, action, scope) {
    const access = await resolveWithCache(user, scope);
    return access.visible && access.actions.has(action);
  },

  /**
   * be.md §5.2 — `!visible` → 404 trung tính (`PERM_404`), thấy nhưng thiếu
   * action → 403 với mã chọn theo loại scope.
   */
  async assert(user, action, scope) {
    const access = await resolveWithCache(user, scope);
    if (!access.visible) throw new ScopeNotFoundError();
    if (!access.actions.has(action)) {
      // Phase 3 (p3-04 README §2/§6): khách (GUEST) không được biết board/tài liệu tồn tại → 404 trung tính, không 403.
      if (access.role === "GUEST" && GUEST_HIDDEN_ACTIONS.has(action)) throw new ScopeNotFoundError();
      throw forbiddenErrorFor(scope);
    }
    return access;
  },

  resolveMany(user, type, ids) {
    return resolveManyWithCache(user, type, ids);
  },

  bumpVersion(scope) {
    return bumpVersion(scope);
  },

  revokeScope(input) {
    return revokeScope(input);
  },
};
