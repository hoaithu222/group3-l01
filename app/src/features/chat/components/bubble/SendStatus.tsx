import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

export type SendStatusValue = 'SENDING' | 'SENT' | 'FAILED';

/**
 * Ba liên kết chữ (Thử lại · Sửa · Xoá bản chờ) cao ~20dp: `hitSlop` dọc 12 mỗi phía = 44dp. Ngang chỉ 6 mỗi phía để hai liên
 * kề nhau (`gap-sm` = 12) KHÔNG chồng vùng chạm lên nhau — bấm "Sửa" mà trúng "Xoá bản chờ" là mất bản nháp.
 */
const LINK_HIT_SLOP = { bottom: 12, left: 6, right: 6, top: 12 } as const;

export interface SendStatusProps {
  status: SendStatusValue;
  failMessage?: string;
  onRetry?: () => void;
  onEdit?: () => void;
  onDiscard?: () => void;
}

/** đồng hồ = SENDING, ✓ = SENT, ⚠ + "Thử lại · Sửa · Xoá bản chờ" = FAILED (app.md §3). Màu không phải tín hiệu duy nhất — FAILED luôn kèm chữ. */
export function SendStatus({ status, failMessage, onRetry, onEdit, onDiscard }: SendStatusProps) {
  if (status === 'SENDING') {
    return (
      // `fg-2` (≥ 3:1) chứ không `fg-3` (2.96:1): đồng hồ/dấu tick 12dp là tín hiệu "đang gửi/đã gửi" — hình phi văn bản vẫn phải thấy được.
      <View accessibilityLabel="Đang gửi" accessible>
        <Icon color="fg-2" name="clock" size={12} />
      </View>
    );
  }
  if (status === 'SENT') {
    return (
      <View accessibilityLabel="Đã gửi" accessible>
        <Icon color="fg-2" name="checkmark-circle" size={12} />
      </View>
    );
  }

  return (
    <View className="items-end gap-3xs">
      {/* `shrink` + `text-right`: `Text` của RN mặc định KHÔNG co — câu lỗi dài ("Bạn đang gửi quá nhanh, thử lại sau …") trong hàng
          `flex-row` đẩy icon ra ngoài mép. `caption-sm` (12) chứ không `label-xs` (10): đây là câu người dùng PHẢI đọc để biết
          tin không đi, mà 10dp trên nền tối đọc mệt (máy bật cỡ chữ lớn thì càng nhỏ). */}
      <View accessibilityLiveRegion="polite" className="flex-row items-center gap-3xs">
        <Icon color="error" name="alert-warning-circle" size={14} />
        <Text className="shrink text-right text-caption-sm text-error">{failMessage ?? 'Gửi thất bại'}</Text>
      </View>
      <View className="flex-row gap-sm">
        {onRetry ? (
          <Pressable accessibilityRole="button" hitSlop={LINK_HIT_SLOP} onPress={onRetry}>
            <Text className="text-link-md text-link">Thử lại</Text>
          </Pressable>
        ) : null}
        {onEdit ? (
          <Pressable accessibilityRole="button" hitSlop={LINK_HIT_SLOP} onPress={onEdit}>
            <Text className="text-link-md text-link">Sửa</Text>
          </Pressable>
        ) : null}
        {onDiscard ? (
          <Pressable accessibilityRole="button" hitSlop={LINK_HIT_SLOP} onPress={onDiscard}>
            <Text className="text-link-md text-link">Xoá bản chờ</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
