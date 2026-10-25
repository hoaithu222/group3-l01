import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { uploadService } from '@/core/uploads/upload.service';
import type { UploadItem } from '@/core/uploads/upload.types';
import { AttachmentTray } from '@/shared/ui/attachment';
import { Button } from '@/shared/ui/button';
import { iconForMime } from '@/shared/ui/file-tile';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { Section } from '@/shared/ui/section';
import { formatFileSize } from '@/shared/utils/format/file-size.utils';
import { showToast } from '@/shared/utils/toast.utils';

import type { RecapAttachment } from '../../api/meeting-recap.types';
import { recapErrorMessage } from '../../utils/recap-errors';

export interface RecapAttachmentsProps {
  attachments: RecapAttachment[];
  /** Còn thêm được tệp (chưa chạm trần, đang online) — vắng `onAdd` thì không có nút thêm (màn xem). */
  canAdd?: boolean;
  /** Lỗi của khu tệp (vd `MEET_022` — đã đủ số tệp) hiện ngay dưới danh sách. */
  error?: string | null;
  onAdd?: () => void;
  onRemove?: (assetId: string) => void;
  /** Tệp đang được gỡ (nút tương ứng hiện vòng quay). */
  removingId?: string | null;
  uploads?: { items: UploadItem[]; onCancel: (id: string) => void; onRemove: (id: string) => void; onRetry: (id: string) => void };
}

/**
 * Tệp đính kèm biên bản (app.md §3 `RecapAttachments`): tên + dung lượng, chạm để mở qua URL KÝ ngắn hạn (quyền đọc tệp = quyền xem biên
 * bản — BE kiểm qua `AssetLink MEETING_RECAP`, người ngoài cuộc họp nhận 404). Màn soạn thêm: nút "Đính kèm tệp", hàng đợi tải (tiến độ
 * từng tệp, thử lại/huỷ) và "Gỡ" từng tệp.
 */
export function RecapAttachments({ attachments, canAdd = false, error, onAdd, onRemove, removingId, uploads }: RecapAttachmentsProps) {
  const [openingId, setOpeningId] = useState<string | null>(null);

  const open = async (file: RecapAttachment) => {
    setOpeningId(file.assetId);
    try {
      const { url } = await uploadService.getAssetUrl(file.assetId, 'ORIGINAL');
      await WebBrowser.openBrowserAsync(url);
    } catch (err) {
      showToast('error', recapErrorMessage(err));
    } finally {
      setOpeningId(null);
    }
  };

  if (attachments.length === 0 && !onAdd) return null;

  return (
    <Section icon="file-2" title={`Tệp đính kèm (${String(attachments.length)})`}>
      <View className="gap-xs">
        {attachments.map((file) => (
          <ListItem
            key={file.assetId}
            description={formatFileSize(file.size, { fallback: file.mime })}
            disabled={openingId === file.assetId}
            emphasis="title"
            label={file.name}
            // Ô icon theo LOẠI tệp (`iconForMime`: ảnh · video · âm thanh · tài liệu) thay cho một icon tài liệu chung cho mọi tệp.
            leading={<IconTile name={iconForMime(file.mime)} size="sm" tone="info" />}
            trailing={
              onRemove ? (
                <Button
                  accessibilityLabel={`Gỡ tệp ${file.name}`}
                  iconLeft="delete"
                  iconOnly
                  loading={removingId === file.assetId}
                  size="sm"
                  variant="neutral-tertiary"
                  onPress={() => onRemove(file.assetId)}
                />
              ) : undefined
            }
            onPress={() => void open(file)}
          />
        ))}
        {uploads && uploads.items.length > 0 ? (
          <AttachmentTray items={uploads.items} onCancel={uploads.onCancel} onRemove={uploads.onRemove} onRetry={uploads.onRetry} />
        ) : null}
        {error ? <Text className="text-caption-lg text-error">{error}</Text> : null}
        {onAdd ? <Button disabled={!canAdd} iconLeft="add" label="Đính kèm tệp" variant="secondary" onPress={onAdd} /> : null}
      </View>
    </Section>
  );
}
