import { toErrorMessage } from '@/core/api/client.helpers';
import { showToast } from '@/shared/utils/toast.utils';

import type { ResourceDto } from '../api';
import {
  ensureLocalFile,
  openWithExternalApp,
  saveLocalFile,
  shareLocalFile,
} from './resource-actions';

export type FileAction = 'download' | 'open' | 'share';

type Subject = Pick<ResourceDto, 'id' | 'mime' | 'name' | 'size' | 'type' | 'version'>;

/**
 * Chạy MỘT hành động tệp và báo kết quả bằng toast — không ném lỗi (lỗi thành
 * toast tiếng Việt). Dùng chung cho thanh dưới của Preview lẫn menu "⋯" của
 * FileExplorer để hai nơi không lệch nhau về câu chữ/quyền.
 */
export async function runFileAction(
  resource: Subject,
  action: FileAction,
  onProgress: (ratio: number) => void = () => undefined,
): Promise<void> {
  try {
    if (action === 'open') {
      await openWithExternalApp(resource.id);
      return;
    }
    const uri = await ensureLocalFile(resource, onProgress);
    const outcome =
      action === 'share'
        ? await shareLocalFile(uri, resource, resource.name)
        : await saveLocalFile(uri, resource);
    if (outcome === 'unavailable') showToast('warning', 'Thiết bị không hỗ trợ chia sẻ tệp');
    else if (outcome === 'cancelled') showToast('info', 'Cần cấp quyền để lưu tệp về máy');
    else if (action === 'download') showToast('success', 'Đã lưu tệp');
  } catch (error) {
    showToast('error', toErrorMessage(error));
  }
}
