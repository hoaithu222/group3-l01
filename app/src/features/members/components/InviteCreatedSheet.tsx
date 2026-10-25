import * as Clipboard from 'expo-clipboard';
import { Share, Text, View } from 'react-native';

import { BottomSheet, SheetActions } from '@/shared/ui/bottom-sheet';
import { Icon } from '@/shared/ui/icon';
import { formatDateTime } from '@/shared/utils/format/date.utils';
import { hapticTap } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import type { CreateInviteResult } from '../api';
import { InviteQrCode } from './InviteQrCode';

export interface InviteCreatedSheetProps {
  onClose: () => void;
  result: CreateInviteResult | null;
}

async function copyInviteLink(url: string): Promise<void> {
  await Clipboard.setStringAsync(url);
  hapticTap(); // xác nhận tức thì "đã chép" — toast có thể bị bàn tay che
  showToast('success', 'Đã sao chép link mời.');
}

/**
 * Hiện URL link mời MỘT LẦN duy nhất (`url` chỉ trả ở response tạo — be.md
 * §5.1), Sao chép/Chia sẻ, và ghi chú không xem lại được (app.md §3).
 *
 * Kèm mã QR của chính URL đó: máy ảo/máy không bấm được link thì người kia quét mã ở "Tham gia nhóm"
 * (`ScanInviteScreen`). ⚠️ `scrollable`: QR + URL dài + hai nút có thể cao hơn màn nhỏ — không cuộn được thì
 * hai nút Sao chép/Chia sẻ (nằm ở `footer`, luôn hiện) đẩy phần QR/URL ra khỏi tầm nhìn.
 *
 * ✅ Hai nút đáy qua `SheetActions` (Sao chép trái · Chia sẻ phải, chia đôi đúng cách) — bản cũ đặt hai `Button fullWidth` trần trong
 * `flex-row`: hai khối `width: 100%` không co, nút "Chia sẻ" bị đẩy ra ngoài mép tấm.
 */
export function InviteCreatedSheet({ onClose, result }: InviteCreatedSheetProps) {
  return (
    <BottomSheet
      description="Link chỉ hiện một lần ở đây — sao chép hoặc chia sẻ ngay, quay lại danh sách sẽ không thấy link nữa."
      footer={
        result ? (
          <SheetActions
            primary={{
              iconLeft: 'share',
              label: 'Chia sẻ',
              onPress: () => void Share.share({ message: result.url }),
            }}
            secondary={{
              iconLeft: 'copy',
              label: 'Sao chép',
              onPress: () => void copyInviteLink(result.url),
            }}
          />
        ) : undefined
      }
      scrollable
      title="Đã tạo link mời"
      visible={result !== null}
      onClose={onClose}
    >
      {result ? (
        <View className="gap-md">
          <InviteQrCode value={result.url} />
          <Text className="text-center text-caption-lg text-fg-2">
            Người khác quét mã này trong mục Tham gia nhóm.
          </Text>
          {/* URL trong khung nền nhạt (kiểu ô "mã mời" của Discord/Teams): tách khỏi chữ hướng dẫn, nhấn giữ để chọn từng phần. */}
          <View className="gap-2xs rounded-xs bg-bg-2 p-sm">
            <Text className="text-body-md text-fg-1" selectable>
              {result.url}
            </Text>
            <View className="flex-row items-center gap-2xs">
              <Icon color="fg-2" name="clock" size="xs" />
              <Text className="flex-1 text-caption-lg text-fg-2">
                Hết hạn {formatDateTime(result.expiresAt)} · tối đa {result.maxUses} lượt
              </Text>
            </View>
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}
