import { NotFoundError, ScopeForbiddenError, ScopeNotFoundError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { IntegrationEntity } from "../entities/integration.interface";
import { intErrors } from "../integrations.errors";
import { ProviderAuthError, ProviderUnavailableError } from "../providers/provider.interface";
import { ProviderRejectedError } from "../providers/provider-http";
import type { IntegrationDeps } from "./integration.deps";

export function isWorkspaceAdminRole(role: string | null): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/**
 * Điều kiện vào mọi thao tác quản lý kết nối (`/integrations/:id/*`): kết nối tồn tại, người dùng THẤY workspace chủ sở hữu và có vai OWNER/ADMIN.
 * Không thấy workspace → 404 trung tính (không lộ kết nối tồn tại); thấy nhưng thiếu bậc → 403 `PERM_001` (khách → 404).
 */
export class IntegrationGuard {
  constructor(private readonly d: Pick<IntegrationDeps, "integrations" | "access">) {}

  async requireAdmin(actor: AuthUser, id: string): Promise<IntegrationEntity> {
    const entity = await this.d.integrations.findById(id);
    if (!entity) throw new NotFoundError();
    const access = await this.d.access.workspaceAccess(actor.id, entity.workspaceId);
    if (!access.visible) throw new ScopeNotFoundError();
    if (!isWorkspaceAdminRole(access.role)) {
      if (access.role === "GUEST") throw new ScopeNotFoundError();
      throw new ScopeForbiddenError(ErrorMessages[ErrorCode.PERM_001], ErrorCode.PERM_001);
    }
    return entity;
  }
}

/**
 * Gọi nhà cung cấp trong một request: lỗi xác thực vĩnh viễn (token bị thu hồi / cài đặt đã gỡ) → kết nối `REVOKED` + thông báo, trả `INT_010`;
 * lỗi mạng/5xx/từ chối yêu cầu → `INT_004` (502). Lỗi khác (đã là `AppError`, lỗi lập trình) đi qua nguyên vẹn.
 */
export async function callProvider<T>(d: Pick<IntegrationDeps, "status">, entity: IntegrationEntity, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof ProviderAuthError) {
      await d.status.markRevoked(entity, err.code === "not_found" ? "PROVIDER_REVOKED" : "TOKEN_INVALID");
      throw intErrors.revoked();
    }
    if (err instanceof ProviderUnavailableError || err instanceof ProviderRejectedError) throw intErrors.providerFailed();
    throw err;
  }
}
