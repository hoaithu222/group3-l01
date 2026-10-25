import { ROOT_FOLDER, type FolderDto, type FolderListing, type FolderRef } from '../api';

export interface BreadcrumbSegment {
  /** `'root'` cho gốc "Tài liệu". */
  id: FolderRef;
  label: string;
}

export const ROOT_LABEL = 'Tài liệu';

/**
 * Chuỗi breadcrumb từ gốc tới thư mục hiện tại. `be.md` chưa nói `breadcrumb[]`
 * có gồm CHÍNH thư mục hiện tại không, nên gộp `breadcrumb` + `folder` và bỏ
 * trùng theo `id` — đúng ở cả hai cách BE có thể chọn, và không vẽ hai lần.
 */
export function buildBreadcrumb(listing: FolderListing | undefined): BreadcrumbSegment[] {
  const chain: FolderDto[] = [...(listing?.breadcrumb ?? [])];
  if (listing?.folder && !chain.some((folder) => folder.id === listing.folder?.id)) {
    chain.push(listing.folder);
  }
  return [
    { id: ROOT_FOLDER, label: ROOT_LABEL },
    ...chain.map((folder) => ({ id: folder.id, label: folder.name })),
  ];
}
