import type { AuthUser } from "../../../core/types/express";
import type { NotifyInput } from "../../notifications/public";
import type { ILocationRepository, ILocationReviewRepository } from "../repositories/location.repository.interface";
import type { IPrintShopRepository } from "../repositories/print-shop.repository.interface";
import type { IPrintOrderRepository } from "../repositories/print-order.repository.interface";
import type { IO2oDirectory } from "../repositories/o2o-directory";
import type { IOutboxPort, ITxRunner, TxHandle } from "../repositories/tx";

/** Thông tin asset tối thiểu cho đơn in / ảnh địa điểm (đọc qua `@modules/assets/public`). */
export interface O2oAssetInfo {
  id: string;
  ownerId: string;
  status: string;
  scope: string;
  kind: string;
  mime: string;
  size: number | null;
  storageKey: string;
  originalName: string;
}

export interface SignedUrl {
  url: string;
  expiresAt: string;
}

/** Cổng asset (p0-05) — bản thật bọc `createAssetLifecycleService/createAssetLinkService/createAssetUrlService` + `storage`. */
export interface IO2oAssetPort {
  get(assetId: string): Promise<O2oAssetInfo | null>;
  /** Toàn bộ nội dung tệp (đếm trang) — caller đã kiểm dung lượng. */
  read(asset: O2oAssetInfo): Promise<Buffer>;
  attach(
    tx: TxHandle,
    input: { assetIds: string[]; targetType: "PRINT_ORDER" | "LOCATION_PHOTO"; targetId: string; scopeType: "NONE" | "USER"; actorId: string; foreign?: boolean }
  ): Promise<void>;
  detach(tx: TxHandle, input: { targetType: "PRINT_ORDER" | "LOCATION_PHOTO"; targetId: string; assetIds?: string[] }): Promise<void>;
  /** URL ký đọc tệp — TỰ kiểm quyền đọc theo `AssetLink` (resolver `PRINT_ORDER`). */
  signedUrl(assetId: string, user: AuthUser, disposition: "inline" | "attachment"): Promise<SignedUrl>;
  /** Ảnh + thumbnail cho danh sách asset (caller đã kiểm quyền xem đối tượng). */
  signPhotos(assetIds: string[], user: AuthUser): Promise<Array<{ assetId: string; url: string | null; thumbUrl: string | null; expiresAt: string | null }>>;
}

/** Kiểm quyền đọc tài liệu Resource Hub (`permissionService`, `workspace.resource.read`) — tách cổng để unit test không cần resolver. */
export interface IO2oAccess {
  canReadResource(user: AuthUser, workspaceId: string): Promise<boolean>;
}

/** Khoá chống dò PIN (Redis `o2o:pin:*`) — `check` ném `O2O_008` khi đang khoá. */
export interface IPinLockout {
  check(orderId: string): Promise<void>;
  /** Ghi một lần sai — trả số lần còn lại; tới ngưỡng thì khoá (`locked: true`). */
  fail(orderId: string): Promise<{ attemptsLeft: number; locked: boolean; retryAfterSeconds: number }>;
  reset(orderId: string): Promise<void>;
}

export interface IO2oNotifier {
  notify(tx: TxHandle, input: NotifyInput): Promise<void>;
}

/** `AuditService.record` (structural typing — reuse-first.md). */
export interface AuditRecorder {
  record(input: {
    actorId: string;
    actorRole?: string;
    action: string;
    targetType: string;
    targetId: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

/** Xoá cache quyền theo dữ liệu (`partner:*`) sau khi duyệt/tạm ngưng tiệm. */
export interface IDataPermissionCache {
  invalidate(userId: string): Promise<void>;
}

export interface O2oDeps {
  locations: ILocationRepository;
  reviews: ILocationReviewRepository;
  shops: IPrintShopRepository;
  orders: IPrintOrderRepository;
  directory: IO2oDirectory;
  access: IO2oAccess;
  assets: IO2oAssetPort;
  pinLockout: IPinLockout;
  notifier: IO2oNotifier;
  audit: AuditRecorder;
  dataPermissions: IDataPermissionCache;
  tx: ITxRunner;
  outbox: IOutboxPort;
  now: () => Date;
}
