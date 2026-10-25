import { avatarUrlOf } from "../../../shared/media";
import type { Folder } from "../entities/folder.interface";
import type { PreviewStatusValue, Resource, ResourceTypeValue } from "../entities/resource.interface";
import type { UploaderInfo } from "../repositories/user-directory";

export interface FolderDto {
  id: string;
  workspaceId: string;
  parentId: string | null;
  name: string;
  depth: number;
  version: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  /** Chỉ có trong thùng rác. */
  deletedAt: Date | null;
  /** Server tính: người xem có sửa/xoá/di chuyển được thư mục này không. */
  canModify: boolean;
}

export interface ResourceDto {
  id: string;
  workspaceId: string;
  folderId: string | null;
  name: string;
  extension: string | null;
  type: ResourceTypeValue;
  language: string | null;
  mime: string;
  size: number;
  description: string | null;
  tags: string[];
  previewStatus: PreviewStatusValue;
  /** Ảnh: URL thumbnail ký ≤ 60 s (sinh lúc trả lời, KHÔNG nằm trong cache danh sách). */
  thumbnailUrl: string | null;
  /**
   * `avatarUrl` = URL ảnh ký sẵn bản THUMB (`avatarUrlOf`), `null` khi chưa đặt ảnh / đã ẩn danh hoá / tài khoản không còn. Nằm trong phần
   * CACHE ĐƯỢC của dòng: URL giống nhau với mọi người xem và còn hạn ≥ 1 ô (`displayImageUrlBucketSeconds`), dài hơn hẳn TTL cache danh sách.
   */
  uploadedBy: { id: string; name: string; avatarUrl: string | null };
  createdAt: Date;
  updatedAt: Date;
  version: number;
  deletedAt: Date | null;
  canModify: boolean;
  /**
   * CHỈ có ở kết quả TÌM (`GET /workspaces/:id/resources?q=`, p3-01 app.md §9): tên các thư mục từ gốc tới thư mục chứa tệp, nối bằng ` / `
   * (vd `Học kỳ 1 / Tuần 3`); `""` khi tệp nằm ở gốc kho. Vắng khi liệt kê theo thư mục (đã biết vị trí) — client dùng `folderId` để mở thư mục.
   */
  folderPath?: string;
}

/** Phần dùng chung mọi người xem (cache được) — `thumbnailUrl`/`canModify` gắn lúc trả lời. */
export type ResourceRowDto = Omit<ResourceDto, "thumbnailUrl" | "canModify">;

export const UNKNOWN_UPLOADER_NAME = "Tài khoản đã xoá";

export function toFolderDto(f: Folder, canModify: boolean): FolderDto {
  return {
    id: f.id,
    workspaceId: f.workspaceId,
    parentId: f.parentId,
    name: f.name,
    depth: f.depth,
    version: f.version,
    createdBy: f.createdBy,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    deletedAt: f.deletedAt,
    canModify,
  };
}

export function toResourceRow(r: Resource, uploader: UploaderInfo | undefined): ResourceRowDto {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    folderId: r.folderId,
    name: r.name,
    extension: r.extension,
    type: r.type,
    language: r.language,
    mime: r.mime,
    size: r.size,
    description: r.description,
    tags: r.tags,
    previewStatus: r.previewStatus,
    uploadedBy: { id: r.uploadedBy, name: uploader?.name ?? UNKNOWN_UPLOADER_NAME, avatarUrl: avatarUrlOf(uploader?.avatarAssetId) },
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    version: r.version,
    deletedAt: r.deletedAt,
  };
}

export function toResourceDto(row: ResourceRowDto, extra: { thumbnailUrl: string | null; canModify: boolean }): ResourceDto {
  return { ...row, thumbnailUrl: extra.thumbnailUrl, canModify: extra.canModify };
}
