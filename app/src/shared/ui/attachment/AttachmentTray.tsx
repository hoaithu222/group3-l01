import { Image } from 'expo-image';
import { cssInterop } from 'nativewind';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { assetErrorMessage } from '@/core/uploads/mime';
import type { UploadItem } from '@/core/uploads/upload.types';
import { Icon, type IconName } from '@/shared/ui/icon';
import { formatFileSize } from '@/shared/utils/format/file-size.utils';
import { cn } from '@/shared/utils/style/cn';

import { AttachmentProgress } from './AttachmentProgress';

/** ⛔ BẮT BUỘC — `Image` của `expo-image` không nằm trong danh sách NativeWind hiểu `className`, xem `Thumbnail.tsx`. */
const AttachmentImage = cssInterop(Image, { className: 'style' });

/** Còn đang xử lý theo nghĩa nào đó — hiện vòng tiến độ / nhãn "Tạm dừng". */
const BUSY_STATUSES = new Set<UploadItem['status']>([
  'queued',
  'creating',
  'uploading',
  'processing',
  'paused',
]);

/** Ảnh/video hiện THUMBNAIL thật (picker đã có sẵn); tệp/voice hiện icon — app.md §3. */
function kindIcon(kind: UploadItem['kind']): IconName {
  if (kind === 'VOICE' || kind === 'AUDIO') return 'mic-01';
  if (kind === 'FILE') return 'document';
  return 'image';
}

export interface AttachmentTrayProps {
  className?: string;
  items: UploadItem[];
  onCancel: (localId: string) => void;
  /** Xoá khi `READY` — tuỳ chọn: chưa phải màn nào cũng cho xoá lại sau khi đã gửi. */
  onRemove?: (localId: string) => void;
  onRetry: (localId: string) => void;
}

/**
 * Số dòng tối đa của câu lỗi. Câu dài nhất (`ASSET_004`, 56 ký tự) ở chữ `text-label-xs` chiếm 2 dòng trong
 * cột `w-40`; dư 1 dòng cho máy bật cỡ chữ lớn — quá nữa thì mới cắt (có dấu "…").
 */
const ERROR_MAX_LINES = 3;

/**
 * Hàng thumbnail đính kèm — mỗi item: thumbnail/icon, tên, dung lượng, vòng
 * tiến độ, nút huỷ/thử lại/xoá theo TRẠNG THÁI hiện tại (app.md §3).
 *
 * ⛔ Ẩn HOÀN TOÀN khi rỗng — không vẽ một khung chờ tệp đầu tiên (app.md §3
 * cột "Rỗng").
 *
 * ⛔ KHÔNG đặt trần chiều cao (`max-h-*`) cho `ScrollView`. Khay ngang cao đúng bằng item cao nhất, và trần
 * nhỏ hơn nội dung thì CẮT NGANG mà không lỗi nào báo: bản cũ `max-h-32` (128dp) thấp hơn item lỗi 2 dòng (148dp)
 * nên dòng lỗi thứ hai biến mất, người dùng chỉ thấy "Bạn không thể" mà không có dấu "…". Chiều cao đã bị giới hạn
 * bởi chính nội dung (`numberOfLines` ở tên và câu lỗi); `grow-0` chặn `ScrollView` (mặc định `flexGrow: 1`) phình
 * ra chiếm chỗ trống của cha.
 *
 * ⚠️ Item LỖI rộng gấp đôi (`w-40` thay vì `w-20`): câu lỗi tiếng Việt dài, ở cột 80dp chỉ vừa ~16 ký tự/dòng
 * (≥ 4 dòng), còn ở 160dp thì gọn 2 dòng — khay không phải cao thêm gần 30dp trên màn chat.
 */
export function AttachmentTray({ className, items, onCancel, onRemove, onRetry }: AttachmentTrayProps) {
  if (items.length === 0) return null;

  return (
    <ScrollView
      className={cn('grow-0', className)}
      contentContainerClassName="flex-row gap-sm px-md py-xs"
      horizontal
      // ⚠️ Khay nằm ngay trên ô nhập nên bàn phím thường đang MỞ khi người dùng chạm "Xoá tệp"/"Huỷ"/"Thử lại". Mặc định (`never`) cú chạm đầu
      // tiên chỉ đóng bàn phím và KHÔNG tới được nút — phải chạm hai lần.
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      {items.map((item) => {
        const busy = BUSY_STATUSES.has(item.status);
        const showThumb = item.kind === 'IMAGE' || item.kind === 'VIDEO';
        const actionLabel =
          item.status === 'failed' ? 'Thử lại' : item.status === 'ready' ? 'Xoá tệp' : 'Huỷ tải lên';
        const actionIcon: IconName =
          item.status === 'failed' ? 'reload' : item.status === 'ready' ? 'delete' : 'cancel';

        return (
          <View key={item.localId} className={item.status === 'failed' ? 'w-40' : 'w-20'}>
            <View className="h-20 w-20 overflow-hidden rounded-xs bg-bg-2">
              {showThumb ? (
                <AttachmentImage
                  className="absolute inset-0"
                  contentFit="cover"
                  source={{ uri: item.uri }}
                />
              ) : (
                <View className="absolute inset-0 items-center justify-center">
                  <Icon color="fg-3" name={kindIcon(item.kind)} size={32} />
                </View>
              )}

              {item.status === 'paused' && (
                <View className="absolute inset-0 items-center justify-center bg-overlay">
                  <Text className="text-label-xs text-fg-inverse" maxFontSizeMultiplier={1.3}>
                    Tạm dừng
                  </Text>
                </View>
              )}

              <Pressable
                accessibilityLabel={actionLabel}
                accessibilityRole="button"
                className="absolute right-1 top-1 h-8 w-8 items-center justify-center rounded-full bg-overlay"
                hitSlop={8}
                onPress={() => {
                  if (item.status === 'failed') onRetry(item.localId);
                  else if (item.status === 'ready') onRemove?.(item.localId);
                  else onCancel(item.localId);
                }}
              >
                <Icon color="fg-inverse" name={actionIcon} size={14} />
              </Pressable>
            </View>

            {busy && item.status !== 'paused' && (
              <AttachmentProgress className="mt-1" progress={item.progress} />
            )}

            <Text className="mt-1 text-label-xs text-fg-2" numberOfLines={1}>
              {item.name}
            </Text>
            {item.status === 'failed' ? (
              <Text className="text-label-xs text-error" numberOfLines={ERROR_MAX_LINES}>
                {assetErrorMessage(item.errorCode)}
              </Text>
            ) : (
              <Text className="text-label-xs text-fg-2" numberOfLines={1}>
                {formatFileSize(item.size)}
              </Text>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}
