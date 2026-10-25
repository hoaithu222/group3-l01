import type { AuthUser } from "../../core/types/express";

/**
 * Cổng "quyền đọc theo đối tượng gắn" của `AssetAccessService` (p4-01 be.md §1) — đặt ở `shared/ports/` (giống
 * `asset-scope-gate.port.ts`) để `modules/assets` KHÔNG import module nghiệp vụ nào (luật 3 tầng): module sở hữu 1
 * `AssetLinkTarget` (vd `study` cho `STUDY_ITEM`/`STUDY_SET_COVER`) đăng ký resolver lúc boot; `canRead` chỉ tra registry
 * theo `link.targetType`.
 *
 * Dùng khi quyền đọc KHÔNG quy về được một `ScopeType` cố định (bộ học đổi phạm vi PRIVATE/WORKSPACE/PUBLIC theo thời
 * gian nên không thể chốt `scopeType` của link lúc tạo). Đã có resolver cho `targetType` → CHỈ resolver quyết định link đó.
 * Chưa đăng ký (vd tiến trình worker) → rơi về nhánh mặc định: link `scopeType NONE` chỉ chủ asset đọc được (fail-closed).
 */
export interface AssetTargetLinkRef {
  assetId: string;
  targetType: string;
  targetId: string;
  scopeType: string;
  scopeId: string | null;
}

export interface AssetTargetReadResolver {
  canRead(user: AuthUser, link: AssetTargetLinkRef): Promise<boolean>;
}

const registry = new Map<string, AssetTargetReadResolver>();

/** Đăng ký lại cùng `targetType` sẽ GHI ĐÈ (idempotent khi module được import nhiều lần trong test). */
export function registerAssetTargetReadResolver(targetType: string, resolver: AssetTargetReadResolver): void {
  registry.set(targetType, resolver);
}

export function getAssetTargetReadResolver(targetType: string): AssetTargetReadResolver | undefined {
  return registry.get(targetType);
}

/** Chỉ dùng trong test để cô lập giữa các case. */
export function clearAssetTargetReadResolvers(): void {
  registry.clear();
}
