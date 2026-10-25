import { useCallback, useState } from 'react';

import { pickDocuments, pickImages, pickVideo, takePhoto } from '@/core/media/pick-media';
import type { PickedFile } from '@/core/uploads/upload.types';
import { showToast } from '@/shared/utils/toast.utils';

import { ROOT_FOLDER, type FolderRef } from '../api';
import type { AddMenuKey } from '../components/AddMenuSheet';
import { useCreateFolder } from '../queries/folder.queries';
import { resourceErrorMessage } from '../utils/error-messages';
import { useUploadToFolder } from './useUploadToFolder';

/**
 * Nút "+" của FileExplorer: chọn tệp (tài liệu/ảnh/video/camera) → xếp hàng tải
 * lên; hoặc mở tấm tạo thư mục (app.md p3-01 §3). Tệp bị `planUploads` loại
 * (rỗng/làm tràn hạn mức) gộp thành MỘT toast liệt kê, không rải nhiều toast.
 *
 * `remainingBytes` chỉ có với OWNER/ADMIN (biết dung lượng) — chặn sớm để khỏi
 * tốn lượt `POST /assets`; BE vẫn kiểm `413 RSC_007`.
 */
export function useExplorerAdd(input: {
  folderId: FolderRef;
  remainingBytes?: number;
  wsId: string;
}) {
  const { folderId, remainingBytes, wsId } = input;
  const { enqueue } = useUploadToFolder(wsId, folderId === ROOT_FOLDER ? null : folderId);
  const createFolder = useCreateFolder(wsId);
  const [folderSheetOpen, setFolderSheetOpen] = useState(false);
  const [folderError, setFolderError] = useState<string | undefined>();

  const queue = useCallback(
    (files: readonly PickedFile[]) => {
      if (files.length === 0) return;
      const { rejected } = enqueue(files, remainingBytes);
      if (rejected.length > 0) {
        const names = rejected.map((file) => file.name).join(', ');
        showToast('warning', `Bỏ qua ${rejected.length} tệp (${rejected[0]?.reason}): ${names}`);
      }
    },
    [enqueue, remainingBytes],
  );

  const pick = useCallback(
    async (key: AddMenuKey) => {
      if (key === 'folder') {
        setFolderError(undefined);
        setFolderSheetOpen(true);
        return;
      }
      // Trình chọn có thể ném (không có camera, bị từ chối quyền giữa chừng, hệ điều hành đóng picker…). Chỗ gọi là
      // `void add.pick(key)` nên phải tự bắt — nếu không thành Promise reject vô chủ (bản dev hiện LogBox ở đáy màn).
      try {
        if (key === 'documents') queue(await pickDocuments());
        else if (key === 'images') queue(await pickImages());
        else if (key === 'video') queue(await pickVideo().then((file) => (file ? [file] : [])));
        else queue(await takePhoto().then((file) => (file ? [file] : [])));
      } catch {
        showToast('error', 'Không mở được trình chọn tệp. Hãy thử lại.');
      }
    },
    [queue],
  );

  const submitFolder = useCallback(
    async (name: string) => {
      try {
        await createFolder.mutateAsync({
          name,
          ...(folderId === ROOT_FOLDER ? {} : { parentId: folderId }),
        });
        setFolderSheetOpen(false);
      } catch (error) {
        setFolderError(resourceErrorMessage(error));
      }
    },
    [createFolder, folderId],
  );

  return {
    closeFolderSheet: () => setFolderSheetOpen(false),
    folderError,
    folderPending: createFolder.isPending,
    folderSheetOpen,
    pick,
    submitFolder,
  };
}
