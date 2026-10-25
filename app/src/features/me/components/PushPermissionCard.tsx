import { Platform, Text, View } from 'react-native';

import type { PushPermissionState } from '@/core/notifications';
import { Alert } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';

import {
  IOS_PUSH_PENDING_NOTICE,
  PERMISSION_APPEARANCE,
  PERMISSION_DESCRIPTION,
  PERMISSION_STATUS_LABEL,
} from '../constants/notification.messages';

export interface PushPermissionCardProps {
  /** `enable()` của `usePushPermission` — hiện hộp thoại quyền của hệ điều hành. */
  onEnable: () => void;
  /** `openSettings()` của `usePushPermission` — mở Cài đặt hệ thống khi quyền đã bị từ chối. */
  onOpenSettings: () => void;
  /** `null` = chưa biết (đang hỏi hệ điều hành) ⇒ khung xương. */
  permission: PushPermissionState | null;
}

/**
 * Thẻ trạng thái quyền thông báo của hệ điều hành — đầu màn Thông báo. Icon lớn + tông màu theo TRẠNG THÁI (bật = xanh lá,
 * bị chặn = đỏ, chưa hỏi = cam), một câu giải thích, và nút hành động chính khi còn việc phải làm.
 *
 * ⛔ PUSH-11: bị tắt thì chỉ nói RÕ ở đây + nút "Mở Cài đặt hệ thống", KHÔNG hộp thoại lặp — hộp thoại của hệ điều hành
 * chỉ hiện khi bấm "Bật thông báo" (`permission === 'undetermined'`).
 *
 * ⚠️ Màu KHÔNG là dấu hiệu duy nhất: icon đổi hình theo trạng thái (chuông thường · chuông chấm · chuông gạch chéo) và
 * `Badge` luôn có chữ ("Đang bật" / "Chưa bật" / "Đang tắt").
 *
 * `flex-1` ở khối chữ: `Text` cạnh ô icon trong `flex-row` không có nó thì mô tả dài đẩy `Badge` ra khỏi mép phải.
 */
export function PushPermissionCard({ onEnable, onOpenSettings, permission }: PushPermissionCardProps) {
  if (permission === null) {
    return (
      <Card>
        <SkeletonParagraphWithIcon />
      </Card>
    );
  }

  const appearance = PERMISSION_APPEARANCE[permission];

  return (
    <Card>
      <View className="flex-row items-start gap-sm">
        <IconTile name={appearance.icon} size="lg" tone={appearance.tone} />
        <View className="flex-1 gap-2xs">
          <View className="flex-row flex-wrap items-center gap-xs">
            <Text className="text-label-lg font-semibold text-fg-1">Thông báo đẩy</Text>
            <Badge label={PERMISSION_STATUS_LABEL[permission]} variant={appearance.badge} />
          </View>
          <Text className="text-body-md text-fg-2">{PERMISSION_DESCRIPTION[permission]}</Text>
        </View>
      </View>

      {permission === 'undetermined' ? (
        <Button fullWidth label="Bật thông báo" onPress={onEnable} />
      ) : null}
      {permission === 'denied' ? (
        <Button
          fullWidth
          label="Mở Cài đặt hệ thống"
          variant="secondary"
          onPress={onOpenSettings}
        />
      ) : null}
      {Platform.OS === 'ios' ? <Alert description={IOS_PUSH_PENDING_NOTICE} /> : null}
    </Card>
  );
}
