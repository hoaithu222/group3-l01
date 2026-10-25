import { Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { IconTile } from '@/shared/ui/icon-tile';

import type { ChannelDetail } from '../api';
import {
  CHANNEL_TYPE_ICON,
  CHANNEL_TYPE_LABEL,
  CHANNEL_TYPE_TONE,
} from '../utils/channel-type-art';

export interface ChannelInfoHeroProps {
  channel: Pick<
    ChannelDetail,
    'description' | 'isDefault' | 'memberCount' | 'name' | 'status' | 'type' | 'visibility'
  >;
}

/**
 * Đầu trang "Thông tin kênh": ô icon lớn theo LOẠI kênh (cùng icon + tông với dòng ở danh sách kênh), tên, dải huy hiệu (loại ·
 * công khai/riêng tư · mặc định · lưu trữ), số thành viên, rồi mô tả. Thay cho thẻ "Thông tin" bốn hàng nhãn–giá trị trước đây
 * (tên · mô tả · loại · hiển thị) — cùng dữ liệu, thêm `memberCount` BE vốn đã trả mà màn chưa hiện.
 *
 * Trạng thái là huy hiệu CÓ CHỮ (màu chỉ phụ). ⚠️ Không có hàng "ngày tạo": be.md §4 khai `ChannelDetail` KHÔNG có `createdAt`.
 */
export function ChannelInfoHero({ channel }: ChannelInfoHeroProps) {
  const archived = channel.status === 'ARCHIVED';
  const isPrivate = channel.visibility === 'PRIVATE';

  return (
    <View className="items-center gap-sm py-sm">
      <IconTile
        name={CHANNEL_TYPE_ICON[channel.type]}
        size="xl"
        tone={archived ? 'neutral' : CHANNEL_TYPE_TONE[channel.type]}
      />
      <Text accessibilityRole="header" className="text-center text-header-sm font-bold text-fg-1">
        {channel.name}
      </Text>
      <View className="flex-row flex-wrap items-center justify-center gap-xs">
        <Badge label={CHANNEL_TYPE_LABEL[channel.type]} size="sm" variant="neutral" />
        <Badge
          label={isPrivate ? 'Riêng tư' : 'Công khai'}
          size="sm"
          variant={isPrivate ? 'warning' : 'info'}
        />
        {channel.isDefault ? <Badge label="Kênh mặc định" size="sm" variant="brand" /> : null}
        {archived ? <Badge label="Đã lưu trữ" size="sm" variant="neutral" /> : null}
      </View>
      <Text className="text-caption-sm text-fg-2">{channel.memberCount} thành viên</Text>
      <Text className="text-center text-body-md text-fg-2">
        {channel.description ?? 'Chưa có mô tả'}
      </Text>
    </View>
  );
}
