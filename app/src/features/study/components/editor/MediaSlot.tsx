import { Pressable, Text, View } from 'react-native';

import { AttachmentTray } from '@/shared/ui/attachment';
import { Button } from '@/shared/ui/button';
import type { MediaCardAspect } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';
import { formatFileSize } from '@/shared/utils/format/file-size.utils';
import { cn } from '@/shared/utils/style/cn';

import { STUDY_MEDIA_LIMITS } from '../../constants/study.constants';
import type { MediaSlotController } from '../../hooks/useMediaSlot';
import { StudyAssetImage } from '../StudyAssetImage';
import { StudyAudioButton } from '../StudyAudioButton';

export interface MediaSlotProps {
  /** Tỉ lệ khung ảnh xem trước (mặc định `banner-slim`; ảnh bìa dùng `banner` cho khung cao hơn). */
  aspect?: MediaCardAspect;
  /** Asset ĐÃ gắn (đã lưu, hoặc vừa READY và đã ghi vào nháp). */
  assetId: string | null | undefined;
  /** Ô nhỏ trong hàng lựa chọn: không tiêu đề/ghi chú, ảnh xem trước thu nhỏ. */
  compact?: boolean;
  /** Ô LỚN cho ảnh bìa: ô trống cao và canh giữa, KHÔNG in lại tiêu đề (tiêu đề nhóm ở form đã là "Ảnh bìa"). Ô của mục là một hàng gọn để ba ô ảnh/âm thanh không chiếm cả form. */
  hero?: boolean;
  /** Tên ô — "Ảnh mặt trước", "Âm thanh"… Vừa là tiêu đề vừa là phần phân biệt nhãn trợ năng giữa nhiều ô cùng loại. */
  label: string;
  onClear: () => void;
  slot: MediaSlotController;
}

/**
 * Một ô ảnh/âm thanh của trình soạn (app.md p4-01 §2 `RichMediaUploader`): trống → ô nét đứt to "Thêm ảnh" (cả ô là vùng chạm, kèm
 * ghi chú nén/định dạng); đang tải → khay tiến độ của bộ chung (`AttachmentTray`: hủy, thử lại, câu lỗi tiếng Việt theo mã
 * `ASSET_00x`); đã có → xem trước + "Đổi"/"Xoá".
 *
 * Component THUẦN vẽ: chọn/tải/xử lý nằm ở `useMediaSlot` (truyền qua `slot`) để `SetForm` (ảnh bìa) tự giữ được `readyAssetId`.
 * ⛔ "Xoá" chỉ gỡ khỏi mục/bộ trong NHÁP — asset mồ côi do job dọn của BE thu hồi; người dùng chưa Lưu thì chưa mất gì.
 */
export function MediaSlot({
  aspect,
  assetId,
  compact = false,
  hero = false,
  label,
  onClear,
  slot,
}: MediaSlotProps) {
  const image = slot.kind === 'image';
  const limit = STUDY_MEDIA_LIMITS[image ? 'IMAGE' : 'AUDIO'];
  const add = image ? 'Thêm ảnh' : 'Thêm âm thanh';
  const change = image ? 'Đổi ảnh' : 'Đổi âm thanh';
  const remove = image ? 'Xoá ảnh' : 'Xoá âm thanh';
  const { upload } = slot;
  const note = image
    ? 'Ảnh được tự nén trước khi tải lên.'
    : `${limit.label}, tối đa ${formatFileSize(limit.maxBytes)}.`;

  return (
    <View className="gap-xs">
      {compact || hero ? null : (
        <Text className="text-label-md font-semibold text-fg-1">{label}</Text>
      )}

      {upload ? (
        <View className="gap-xs">
          <AttachmentTray items={[upload]} onCancel={() => slot.dismiss()} onRetry={slot.retry} />
          {upload.status === 'failed' ? (
            <View className="flex-row">
              <Button
                accessibilityLabel={`Bỏ tệp tải lỗi: ${label}`}
                label="Bỏ tệp này"
                size="sm"
                variant="tertiary"
                onPress={() => slot.dismiss()}
              />
            </View>
          ) : null}
        </View>
      ) : assetId ? (
        <View className="gap-xs">
          {image ? (
            <View className={compact ? 'w-32' : undefined}>
              <StudyAssetImage
                alt={label}
                aspect={aspect ?? 'banner-slim'}
                assetId={assetId}
                reloadable
              />
            </View>
          ) : (
            <View className="flex-row">
              <StudyAudioButton assetId={assetId} label={label} />
            </View>
          )}
          <View className="flex-row gap-xs">
            <Button
              accessibilityLabel={`${change}: ${label}`}
              label={change}
              size="sm"
              variant="secondary"
              onPress={() => void slot.pick()}
            />
            <Button
              accessibilityLabel={`${remove}: ${label}`}
              label={remove}
              size="sm"
              variant="danger-secondary"
              onPress={onClear}
            />
          </View>
        </View>
      ) : compact ? (
        <View className="items-start">
          <Button
            accessibilityLabel={`${add}: ${label}`}
            iconLeft={image ? 'add-image' : 'audio'}
            label={add}
            size="sm"
            variant="secondary"
            onPress={() => void slot.pick()}
          />
        </View>
      ) : (
        <Pressable
          accessibilityLabel={`${add}: ${label}`}
          accessibilityRole="button"
          onPress={() => void slot.pick()}
        >
          {({ pressed }) => (
            <View
              className={cn(
                'rounded-md border-medium border-dashed border-border-2 bg-bg-1 p-sm',
                hero
                  ? 'min-h-32 items-center justify-center gap-xs'
                  : 'min-h-16 flex-row items-center gap-sm',
                pressed && 'opacity-70',
              )}
            >
              <IconTile
                name={image ? 'add-image' : 'audio'}
                size={hero ? 'lg' : 'md'}
                tone="neutral"
              />
              <View className={hero ? 'items-center gap-3xs' : 'flex-1 gap-3xs'}>
                <Text className="text-label-md font-semibold text-fg-1">{add}</Text>
                <Text className={cn('text-caption-sm text-fg-2', hero && 'text-center')}>
                  {note}
                </Text>
              </View>
            </View>
          )}
        </Pressable>
      )}
    </View>
  );
}
