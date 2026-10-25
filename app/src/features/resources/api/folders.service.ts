import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { folderPath, folderRestorePath, workspaceFoldersPath } from './resources.api';
import type {
  CreateFolderPayload,
  FolderDto,
  FolderListing,
  UpdateFolderPayload,
} from './resources.types';

/**
 * Thư mục (be.md p3-01 §4). `skipErrorToast` ở tạo/đổi tên/di chuyển: lỗi
 * `RSC_002/001/006` thuộc về FORM trong sheet (giữ nội dung người dùng đã gõ),
 * không phải toast tự tắt sau 5 giây.
 */
export const foldersService = {
  /**
   * `parentId` bỏ trống = thư mục gốc (khi đó KHÔNG có `folder`). `breadcrumb` chỉ gồm
   * tổ tiên; `children` ≤ 500, đã sắp tên.
   */
  async list(workspaceId: string, parentId?: string): Promise<FolderListing> {
    const response = await apiClient.get<FolderListing>(workspaceFoldersPath(workspaceId), {
      params: parentId ? { parentId } : undefined,
    });
    return unwrapData<FolderListing>(response);
  },

  async create(workspaceId: string, payload: CreateFolderPayload): Promise<FolderDto> {
    const response = await apiClient.post<FolderDto>(workspaceFoldersPath(workspaceId), payload, {
      skipErrorToast: true,
    });
    return unwrapData<FolderDto>(response);
  },

  async update(folderId: string, payload: UpdateFolderPayload): Promise<FolderDto> {
    const response = await apiClient.patch<FolderDto>(folderPath(folderId), payload, {
      skipErrorToast: true,
    });
    return unwrapData<FolderDto>(response);
  },

  /**
   * `recursive` là CHUỖI `"true"|"false"` (BE `z.enum(["true","false"])` — KHÔNG
   * `z.coerce.boolean()`, nếu không `"false"` sẽ ép thành `true`). Gửi chuỗi tường
   * minh thay vì phụ thuộc cách axios serialize boolean.
   */
  async remove(folderId: string, recursive: boolean): Promise<void> {
    await apiClient.delete(folderPath(folderId), {
      params: { recursive: recursive ? 'true' : 'false' },
    });
  },

  async restore(folderId: string): Promise<FolderDto> {
    const response = await apiClient.post<FolderDto>(folderRestorePath(folderId), undefined, {
      skipErrorToast: true,
    });
    return unwrapData<FolderDto>(response);
  },
};
