import * as Sharing from 'expo-sharing';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SPACING } from '@/shared/theme';
import { Icon } from '@/shared/ui/icon';
import { showToast } from '@/shared/utils/toast.utils';

import type { MessageAttachment } from '../../api/chat.types';
import { saveAssetToLibrary } from './save-to-library';

export interface MediaViewerToolbarProps {
  attachment: MessageAttachment;
  assetUrl: string | undefined;
  onClose: () => void;
}

/**
 * Đóng + "Lưu về máy" + "Chia sẻ" cho trang đang xem (app.md §3).
 *
 * ⛔ Icon `white-10` (trắng CỐ ĐỊNH) chứ không `fg-inverse`: nền trình xem là `ink-10` gần đen ở CẢ HAI chế độ, còn `fg-inverse` ở chế độ
 * tối lại là màu mực (#08120F) — ba nút biến mất hoàn toàn trên nền đen.
 */
export function MediaViewerToolbar({ attachment, assetUrl, onClose }: MediaViewerToolbarProps) {
  const insets = useSafeAreaInsets();

  const handleSave = async (): Promise<void> => {
    if (!assetUrl) return;
    const outcome = await saveAssetToLibrary(assetUrl, attachment.name);
    if (outcome === 'saved') showToast('success', 'Đã lưu về máy');
    else if (outcome === 'denied') showToast('error', 'Chưa cấp quyền lưu ảnh/video');
    else showToast('error', 'Không lưu được');
  };

  const handleShare = async (): Promise<void> => {
    if (!assetUrl) return;
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(assetUrl, { mimeType: attachment.mime });
  };

  return (
    // ⛔ Vùng an toàn đủ BỐN chiều: thanh trải hết bề ngang và toàn nút bấm, nên xoay ngang mà tai thỏ ăn vào mép thì nút "Đóng"
    // nằm dưới tai thỏ và không chạm được. Lề cộng với inset (không để `px-xs` của class — style nội tuyến ĐÈ class).
    <View
      className="absolute left-0 right-0 top-0 flex-row items-center justify-between"
      style={{
        paddingLeft: insets.left + SPACING.xs,
        paddingRight: insets.right + SPACING.xs,
        paddingTop: insets.top + SPACING['2xs'],
      }}
    >
      <Pressable accessibilityLabel="Đóng" accessibilityRole="button" className="h-11 w-11 items-center justify-center active:opacity-70" onPress={onClose}>
        <Icon color="white-10" name="cancel" size={24} />
      </Pressable>
      <View className="flex-row">
        <Pressable accessibilityLabel="Lưu về máy" accessibilityRole="button" className="h-11 w-11 items-center justify-center active:opacity-70" onPress={() => void handleSave()}>
          <Icon color="white-10" name="save-image" size={22} />
        </Pressable>
        <Pressable accessibilityLabel="Chia sẻ" accessibilityRole="button" className="h-11 w-11 items-center justify-center active:opacity-70" onPress={() => void handleShare()}>
          <Icon color="white-10" name="share" size={22} />
        </Pressable>
      </View>
    </View>
  );
}
