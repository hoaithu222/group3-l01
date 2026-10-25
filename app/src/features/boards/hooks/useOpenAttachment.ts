import { useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { toErrorMessage } from '@/core/api/client.helpers';
import { uploadService } from '@/core/uploads/upload.service';
import { showToast } from '@/shared/utils/toast.utils';

import type { AttachmentDto } from '../api/task-detail.types';

/**
 * Tên tệp an toàn cho đường dẫn cache: bỏ ký tự phân cách/đặc biệt mà tên tệp người dùng có thể chứa
 * (`../`, `:`…). Cố ý KHÔNG dùng `\p{L}` — Hermes chưa chắc hỗ trợ thuộc tính Unicode trong regex.
 */
function safeName(name: string): string {
  return name.replace(/[/\\:*?"<>|]+/g, '_').slice(0, 80) || 'tep';
}

/**
 * Mở tệp đính kèm: xin URL ký ngắn hạn (`GET /assets/:id/url`, TTL ≤ 60 s) → tải về cache → mở bằng
 * bảng chia sẻ của hệ điều hành (cùng cách `FileRow` của chat — media viewer là màn RIÊNG của tin nhắn).
 * `busyAssetId` để dòng đang tải hiện trạng thái bận và khoá bấm lần hai.
 */
export function useOpenAttachment() {
  const [busyAssetId, setBusyAssetId] = useState<string | null>(null);

  const open = async (attachment: Pick<AttachmentDto, 'assetId' | 'mime' | 'originalName'>) => {
    if (busyAssetId) return;
    setBusyAssetId(attachment.assetId);
    try {
      const { url } = await uploadService.getAssetUrl(attachment.assetId, 'ORIGINAL');
      const destination = `${FileSystem.cacheDirectory}${attachment.assetId}-${safeName(attachment.originalName)}`;
      const result = await FileSystem.createDownloadResumable(url, destination).downloadAsync();
      if (!result) throw new Error('Tải tệp bị huỷ');
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, { mimeType: attachment.mime });
      } else {
        showToast('info', 'Thiết bị không hỗ trợ mở tệp này');
      }
    } catch (error) {
      showToast('error', toErrorMessage(error));
    } finally {
      setBusyAssetId(null);
    }
  };

  return { busyAssetId, open };
}
