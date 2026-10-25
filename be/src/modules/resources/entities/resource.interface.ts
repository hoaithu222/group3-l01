export const RESOURCE_TYPES = ["PDF", "IMAGE", "VIDEO", "AUDIO", "CODE", "DOC", "SHEET", "SLIDE", "TEXT", "OTHER"] as const;
export type ResourceTypeValue = (typeof RESOURCE_TYPES)[number];

export const PREVIEW_STATUSES = ["NONE", "NATIVE", "PENDING", "READY", "FAILED", "UNSUPPORTED"] as const;
export type PreviewStatusValue = (typeof PREVIEW_STATUSES)[number];

export interface Resource {
  id: string;
  workspaceId: string;
  folderId: string | null;
  /** `folderId ?? "root"`. */
  folderKey: string;
  assetId: string;
  name: string;
  normalizedName: string;
  extension: string | null;
  type: ResourceTypeValue;
  /** CODE: ngôn ngữ tô màu (`typescript`, `python`, ...). */
  language: string | null;
  mime: string;
  size: number;
  description: string | null;
  tags: string[];
  previewAssetId: string | null;
  previewStatus: PreviewStatusValue;
  uploadedBy: string;
  version: number;
  deletedAt: Date | null;
  deletedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResourceCreateInput {
  id: string;
  workspaceId: string;
  folderId: string | null;
  assetId: string;
  name: string;
  normalizedName: string;
  extension: string | null;
  type: ResourceTypeValue;
  language: string | null;
  mime: string;
  size: number;
  description: string | null;
  tags: string[];
  previewStatus: PreviewStatusValue;
  uploadedBy: string;
}

/** Trường đổi được qua `PATCH /resources/:id` — chỉ trường có mặt mới ghi. */
export interface ResourcePatchInput {
  name?: string;
  normalizedName?: string;
  extension?: string | null;
  type?: ResourceTypeValue;
  language?: string | null;
  description?: string | null;
  tags?: string[];
  /** `null` = về gốc. */
  folderId?: string | null;
}

export type ResourceSortField = "createdAt" | "name" | "size";

export interface ResourceListParams {
  workspaceId: string;
  /** `undefined` khi tìm toàn workspace (`q`). */
  folderKey?: string;
  /** Từ đã chuẩn hoá — AND, mỗi từ phải là chuỗi con của `normalizedName`. */
  terms?: string[];
  type?: ResourceTypeValue;
  sort: ResourceSortField;
  order: "asc" | "desc";
  /** Vị trí sau cursor: giá trị của trường sắp + id. */
  after?: { value: string | number | Date; id: string };
  limit: number;
}

export interface ResourceTypeUsage {
  type: ResourceTypeValue;
  count: number;
  bytes: number;
}

export interface TrashListParams {
  workspaceId: string;
  /** Chỉ mục do người này xoá (MEMBER); bỏ trống = tất cả (OWNER/ADMIN). */
  deletedBy?: string;
  /** Chỉ mục xoá SAU mốc này (còn trong thời hạn giữ thùng rác). */
  deletedAfter: Date;
  /** Trả các mục xoá TRƯỚC cursor `(deletedAt, id)`. */
  before?: { at: Date; id: string };
  limit: number;
}
