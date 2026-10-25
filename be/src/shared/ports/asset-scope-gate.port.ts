/**
 * Cổng "hook theo scope" của `POST /assets` (p3-01 be.md §5.1) — đặt ở `shared/ports/` (giống
 * `ChannelBootstrapPort`/`WorkspaceOverviewContributor`) để `modules/assets` KHÔNG import module nghiệp vụ nào
 * (luật 3 tầng, `.claude/rules/architecture.md`): module sở hữu 1 `AssetScope` (vd `resources` cho `RESOURCE`)
 * đăng ký gate lúc boot; `AssetService.create()` chỉ tra registry theo `dto.scope`.
 *
 * - `beforeCreate` chạy SAU khi MIME/dung lượng hợp lệ và TRƯỚC khi cấp URL upload — ném `AppError` để chặn
 *   (vd `RSC_007` hết hạn mức, `PERM_404`/`PERM_001` không có quyền tải lên).
 * - `afterCreate` chạy khi asset đã tạo xong (giữ chỗ dung lượng); lỗi ở đây KHÔNG được làm hỏng request.
 * - `release` chạy khi asset bị huỷ (`abort`) hoặc bị REJECTED lúc `complete` — trả chỗ đã giữ.
 *
 * Chưa đăng ký gate cho scope → không kiểm gì thêm (hành vi Phase 0 giữ nguyên).
 */
export interface AssetScopeGateCreateInput {
  ownerId: string;
  workspaceId?: string;
  fileName: string;
  mime: string;
  size: number;
}

export interface AssetScopeGate {
  beforeCreate(input: AssetScopeGateCreateInput): Promise<void>;
  afterCreate?(input: { assetId: string; workspaceId?: string; size: number }): Promise<void>;
  release?(input: { assetId: string; workspaceId?: string | null }): Promise<void>;
}

const registry = new Map<string, AssetScopeGate>();

/** Đăng ký lại cùng `scope` sẽ GHI ĐÈ (idempotent khi module được import nhiều lần trong test). */
export function registerAssetScopeGate(scope: string, gate: AssetScopeGate): void {
  registry.set(scope, gate);
}

export function getAssetScopeGate(scope: string): AssetScopeGate | undefined {
  return registry.get(scope);
}

/** Chỉ dùng trong test để cô lập giữa các case. */
export function clearAssetScopeGates(): void {
  registry.clear();
}
