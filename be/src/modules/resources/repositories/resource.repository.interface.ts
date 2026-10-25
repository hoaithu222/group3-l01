import type {
  Resource,
  ResourceCreateInput,
  ResourceListParams,
  ResourcePatchInput,
  ResourceTypeUsage,
  TrashListParams,
} from "../entities/resource.interface";
import type { TxHandle } from "./tx";

/** Tệp bị đổi hàng loạt khi xoá/khôi phục cả thư mục — đủ để dựng sự kiện outbox (không đọc lại từng tệp). */
export interface AffectedResource {
  id: string;
  folderId: string | null;
  /** `version` SAU thay đổi. */
  version: number;
}

export interface IResourceRepository {
  findById(id: string, tx?: TxHandle): Promise<Resource | null>;
  findByIds(ids: string[]): Promise<Resource[]>;
  /** Ném `RSC_003` khi `assetId` đã có Resource khác (unique) — 2 yêu cầu đồng thời cùng 1 asset chỉ 1 thắng. */
  create(input: ResourceCreateInput, tx: TxHandle): Promise<Resource>;
  /** Trang tiếp theo (tối đa `params.limit` dòng — service xin `limit + 1` để biết còn nữa không). */
  list(params: ResourceListParams): Promise<Resource[]>;
  /** Tệp ACTIVE trực tiếp trong thư mục. */
  countActiveInFolder(folderId: string, tx?: TxHandle): Promise<number>;
  /** Số tệp ở BẤT KỲ trạng thái nào tham chiếu các thư mục này — job purge chỉ xoá thư mục khi = 0. */
  countInFolders(folderIds: string[]): Promise<number>;
  /** CAS `version` + chưa xoá; `null` khi lệch/không còn. */
  updateWithVersion(id: string, expectedVersion: number, patch: ResourcePatchInput, tx: TxHandle): Promise<Resource | null>;
  /** Chỉ tệp ACTIVE; trả bản sau khi xoá mềm, `null` nếu đã xoá/không tồn tại. */
  softDelete(id: string, at: Date, by: string, tx: TxHandle): Promise<Resource | null>;
  /** Chỉ tệp đã xoá mềm; đặt lại vào `folderId` (`null` = gốc). */
  restore(id: string, folderId: string | null, tx: TxHandle): Promise<Resource | null>;
  softDeleteInFolders(
    tx: TxHandle,
    args: { workspaceId: string; folderIds: string[]; at: Date; by: string }
  ): Promise<AffectedResource[]>;
  /** Khôi phục tệp trong các thư mục này xoá CÙNG lô (`deletedAt` bằng `deletedAt`). */
  restoreInFolders(
    tx: TxHandle,
    args: { workspaceId: string; folderIds: string[]; deletedAt: Date }
  ): Promise<AffectedResource[]>;
  listTrash(params: TrashListParams): Promise<Resource[]>;
  /** Tệp đã xoá mềm trước `before` (job purge), cũ nhất trước. */
  findPurgeCandidates(before: Date, limit: number): Promise<Resource[]>;
  /** Xoá cứng — CHỈ khi vẫn còn `deletedAt` (kiểm lại lúc xoá: tệp vừa được khôi phục thì bỏ qua). */
  deleteById(id: string, tx: TxHandle): Promise<boolean>;
  usageByType(workspaceId: string): Promise<ResourceTypeUsage[]>;
  /** Tổng byte các tệp trong thùng rác (vẫn tính dung lượng). */
  trashBytes(workspaceId: string): Promise<number>;
}
