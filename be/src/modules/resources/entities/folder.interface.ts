/** Khoá thư mục cha của thư mục/tệp ở gốc (Mongo coi `null` là 1 giá trị trong unique index — quy ước 02-conventions §3). */
export const ROOT_KEY = "root";

export interface Folder {
  id: string;
  workspaceId: string;
  parentId: string | null;
  /** `parentId ?? "root"`. */
  parentKey: string;
  /** Tổ tiên từ gốc, KHÔNG gồm chính nó. */
  path: string[];
  /** Gốc = 1. */
  depth: number;
  name: string;
  normalizedName: string;
  /** `normalizedName` khi active; `normalizedName#<id>` khi đã xoá mềm (nhường tên cho thư mục mới). */
  nameKey: string;
  createdBy: string;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FolderCreateInput {
  id: string;
  workspaceId: string;
  parentId: string | null;
  path: string[];
  depth: number;
  name: string;
  normalizedName: string;
  createdBy: string;
}

/** Chỉ các trường đổi được qua `PATCH /folders/:id` (đổi tên và/hoặc di chuyển). */
export interface FolderMoveInput {
  name: string;
  normalizedName: string;
  parentId: string | null;
  path: string[];
  depth: number;
}

/** Tên thư mục (khoá) của thư mục đã xoá mềm. */
export function deletedNameKey(normalizedName: string, id: string): string {
  return `${normalizedName}#${id}`;
}
