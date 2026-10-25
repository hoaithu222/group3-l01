/**
 * Barrel CÔNG KHAI của module `assets` — NGOẠI LỆ CÓ CHỦ ĐÍCH của luật
 * "modules KHÔNG import chéo module" (`.claude/rules/architecture.md` mục
 * "Shared module services"). `AssetLinkService`/`AssetAccessService` là dịch
 * vụ dùng chung: module khác (users, auth, và sau này messages/tasks/...)
 * PHẢI import TỪ ĐÂY (`@modules/assets/public`), KHÔNG import trực tiếp file
 * trong `services/`/`repositories/` — cùng cơ chế `AuditService` (module
 * `audit-log`) mà `users`/`admin-jobs` đang import trực tiếp (be.md §1).
 *
 * DI: dùng `createAssetAccessService()`/`createAssetLinkService()` để tự nối
 * dây (giống `new AuditService()` ở nơi khác) trong `{module}.routes.ts` của
 * module gọi — KHÔNG có DI container trong codebase này.
 */
import { AssetAccessService } from "./services/asset-access.service";
import { AssetLinkService } from "./services/asset-link.service";
import { AssetLifecycleService } from "./services/asset-lifecycle.service";
import { AssetService } from "./services/asset.service";
import { AssetProcessor } from "./services/asset-processor";
import { PrismaAssetLinkRepository } from "./repositories/asset-link.repository.prisma";
import { PrismaAssetRepository } from "./repositories/asset.repository.prisma";

export { AssetLinkService } from "./services/asset-link.service";
export { AssetLifecycleService } from "./services/asset-lifecycle.service";
export type { RegisterStoredObjectInput } from "./services/asset-lifecycle.service";
export type { AssetUrlQuery } from "./dtos/asset-url.dto";
export type { AttachInput, DetachInput, ReplaceInput } from "./services/asset-link.service";
export { AssetAccessService } from "./services/asset-access.service";
export type { AssetAccessSubject } from "./services/asset-access.service";
export type { IAssetLinkRepository } from "./repositories/asset-link.repository.interface";
export { PrismaAssetLinkRepository } from "./repositories/asset-link.repository.prisma";
export type {
  Asset,
  AssetLink,
  AssetLinkTargetType,
  AssetLinkScopeType,
  AssetKind,
  AssetScope,
  AssetStatusValue,
} from "./entities/asset.interface";

/** Factory tiện dụng — module gọi tự `new` nếu cần inject `IAssetLinkRepository` khác (test). */
export function createAssetAccessService(): AssetAccessService {
  return new AssetAccessService(new PrismaAssetLinkRepository());
}

/** Factory tiện dụng — wiring mặc định (Prisma) cho module khác dùng ngay trong `{module}.routes.ts`. */
export function createAssetLinkService(): AssetLinkService {
  return new AssetLinkService(createAssetAccessService());
}

/** (p3-01) Cổng vòng đời asset — kiểm asset trước khi gắn vào kho tài liệu, dọn object khi purge thùng rác. */
export function createAssetLifecycleService(): AssetLifecycleService {
  return new AssetLifecycleService(new PrismaAssetRepository(), new PrismaAssetLinkRepository());
}

/**
 * (p3-01) Phần `AssetService` module khác được phép dùng: `getUrl` (URL ký ≤ 60 s, TỰ kiểm quyền đọc theo
 * `AssetLink` lần nữa) và `signThumbnails` (batch thumbnail, caller đã kiểm quyền).
 */
export type AssetUrlPort = Pick<AssetService, "getUrl" | "signThumbnails">;

function buildAssetService(): AssetService {
  const repo = new PrismaAssetRepository();
  const linkRepo = new PrismaAssetLinkRepository();
  return new AssetService(repo, linkRepo, new AssetAccessService(linkRepo), new AssetProcessor(repo));
}

export function createAssetUrlService(): AssetUrlPort {
  return buildAssetService();
}

/**
 * (p4-06, đồng bộ chéo #3) Cổng tạo asset từ nội dung do SERVER sinh (scope `REPORT`): `createFromBuffer` ghi storage + tạo `Asset READY`,
 * caller gắn `AssetLink` ngay sau đó. Client KHÔNG tạo được scope này qua `POST /assets`.
 */
export type AssetServerFilePort = Pick<AssetService, "createFromBuffer">;

export function createAssetServerFileService(): AssetServerFilePort {
  return buildAssetService();
}
export type { CreateFromBufferInput } from "./services/asset.service";
export type { ServerAssetScope } from "./entities/asset.interface";
