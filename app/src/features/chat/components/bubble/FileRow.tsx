import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { isErrorHandled, toErrorMessage } from '@/core/api/client.helpers';
import { uploadService } from '@/core/uploads/upload.service';
import { AttachmentProgress } from '@/shared/ui/attachment';
import { Icon, type IconName } from '@/shared/ui/icon';
import { formatFileSize } from '@/shared/utils/format/file-size.utils';
import { showToast } from '@/shared/utils/toast.utils';

import type { MessageAttachment } from '../../api/chat.types';

function iconForMime(mime: string): IconName {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'document-2';
  if (mime === 'application/pdf') return 'document';
  return 'file-2';
}

export interface FileRowProps {
  attachment: MessageAttachment;
}

/** icon theo MIME, tên, dung lượng; bấm → tải (`expo-file-system`) + mở bằng share sheet; tiến độ (app.md §3). */
export function FileRow({ attachment }: FileRowProps) {
  const [progress, setProgress] = useState<number | null>(null);

  const download = async (): Promise<void> => {
    setProgress(0);
    try {
      const { url } = await uploadService.getAssetUrl(attachment.assetId, 'ORIGINAL');
      const dest = `${FileSystem.cacheDirectory}${attachment.assetId}-${attachment.name}`;
      const task = FileSystem.createDownloadResumable(url, dest, {}, (data) => {
        if (data.totalBytesExpectedToWrite > 0) {
          setProgress(Math.round((data.totalBytesWritten / data.totalBytesExpectedToWrite) * 100));
        }
      });
      const result = await task.downloadAsync();
      if (!result) throw new Error('Tải tệp bị huỷ');
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(result.uri, { mimeType: attachment.mime });
    } catch (error) {
      // ⛔ Phải bắt: `void download()` ở `onPress` không ai chờ, nên mất mạng/hết hạn liên kết là Promise reject vô chủ (bản dev hiện
      // thanh LogBox đỏ đè lên thanh tab) và người dùng chỉ thấy vòng tiến độ biến mất mà không biết vì sao.
      if (!isErrorHandled(error)) showToast('error', toErrorMessage(error));
    } finally {
      setProgress(null);
    }
  };

  return (
    <Pressable
      accessibilityLabel={`Tệp ${attachment.name}, ${formatFileSize(attachment.size)}, chạm để tải`}
      accessibilityRole="button"
      className="flex-row items-center gap-xs rounded-xs bg-bg-2 px-xs py-2xs"
      onPress={() => void download()}
    >
      <Icon color="fg-2" name={iconForMime(attachment.mime)} size={28} />
      <View className="flex-1">
        <Text className="text-label-sm text-fg-1" numberOfLines={1}>
          {attachment.name}
        </Text>
        {progress === null ? (
          <Text className="text-label-xs text-fg-2">{formatFileSize(attachment.size)}</Text>
        ) : (
          <AttachmentProgress className="mt-3xs" progress={progress} />
        )}
      </View>
    </Pressable>
  );
}
