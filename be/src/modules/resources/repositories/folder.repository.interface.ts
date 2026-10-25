import type { Folder, FolderCreateInput, FolderMoveInput } from "../entities/folder.interface";
import type { TxHandle } from "./tx";

export interface FolderSubtreeChange {
  /** Thư mục bị đổi (gồm chính thư mục gốc của thao tác). */
  folderIds: string[];
}

export interface IFolderRepository {
  findById(id: string, tx?: TxHandle): Promise<Folder | null>;
  /** Thư mục con ACTIVE của `parentKey` (`"root"` hoặc id), sắp `normalizedName` — tối đa `limit`. */
  listChildren(workspaceId: string, parentKey: string, limit: number): Promise<Folder[]>;
  findByIds(ids: string[]): Promise<Folder[]>;
  countActiveChildren(folderId: string, tx?: TxHandle): Promise<number>;
  /** Số thư mục con ở BẤT KỲ trạng thái nào — job purge chỉ xoá cứng thư mục khi = 0. */
  countChildren(folderId: string): Promise<number>;
  /** `depth` lớn nhất trong MỌI hậu duệ (kể cả đã xoá mềm); `0` nếu không có. */
  maxDescendantDepth(workspaceId: string, folderId: string, tx?: TxHandle): Promise<number>;
  /** Ném `RSC_002` khi trùng `(workspaceId, parentKey, nameKey)` — unique index THẬT (không kiểm-rồi-ghi); lỗi thoát khỏi transaction. */
  create(input: FolderCreateInput, tx: TxHandle): Promise<Folder>;
  /** CAS theo `version` + chưa xoá; `null` khi lệch/không còn. Ném `RSC_002` khi trùng tên. */
  updateWithVersion(id: string, expectedVersion: number, patch: FolderMoveInput, tx: TxHandle): Promise<Folder | null>;
  /**
   * Sau khi 1 thư mục đổi cha: thay `oldAncestorsLength` phần tử đầu của `path` mọi hậu duệ bằng `newAncestors` và
   * cộng `depthDelta` vào `depth` (1 lệnh, kể cả hậu duệ đã xoá mềm để khôi phục về sau vẫn đúng vị trí).
   */
  rebaseDescendants(
    tx: TxHandle,
    args: { workspaceId: string; folderId: string; oldAncestorsLength: number; newAncestors: string[]; depthDelta: number }
  ): Promise<void>;
  /**
   * Ghi đè `updatedAt` của thư mục — tạo xung đột ghi (write conflict) giữa 2 transaction cùng di chuyển vào nhau,
   * để transaction thua thử lại và thấy vòng → `RSC_006` (kiểm-rồi-ghi trên 2 tài liệu khác nhau không tự bắt được).
   */
  touch(tx: TxHandle, id: string): Promise<void>;
  /** Xoá mềm thư mục + mọi hậu duệ chưa xoá (cùng `at`); trả id đã xoá (gồm chính nó). */
  softDeleteSubtree(
    tx: TxHandle,
    args: { workspaceId: string; folderId: string; at: Date; by: string }
  ): Promise<FolderSubtreeChange>;
  /** Khôi phục thư mục + hậu duệ xoá CÙNG lô (`deletedAt` bằng nhau). Ném `RSC_002` khi tên thư mục gốc đã bị chiếm. */
  restoreSubtree(
    tx: TxHandle,
    args: { workspaceId: string; folderId: string; deletedAt: Date }
  ): Promise<FolderSubtreeChange>;
  /** Thư mục xoá mềm (gốc của lô xoá, hoặc lẻ) — cho thùng rác. Sắp `deletedAt` giảm dần. */
  listTrash(args: {
    workspaceId: string;
    deletedBy?: string;
    deletedAfter: Date;
    before?: { at: Date; id: string };
    limit: number;
  }): Promise<Folder[]>;
  /** Thư mục đã xoá mềm trước `before` — job purge. */
  findPurgeCandidates(before: Date, limit: number): Promise<Folder[]>;
  /** Xoá cứng theo id (chỉ gọi cho thư mục đã xoá mềm và không còn ai tham chiếu). Trả số dòng đã xoá. */
  hardDelete(ids: string[]): Promise<number>;
  countActive(workspaceId: string): Promise<number>;
}
