import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';

import type { ChannelHit } from '../api';
import { CHANNEL_TYPE_LABEL, channelTypeArt } from '../utils/result-format';

export interface ChannelResultItemProps {
  hit: ChannelHit;
  /** Đang gửi yêu cầu tham gia kênh này. */
  joining: boolean;
  onJoin: (hit: ChannelHit) => void;
  onOpen: (hit: ChannelHit) => void;
}

/**
 * Một kết quả KÊNH: tên (khoá nếu riêng tư) · loại · số thành viên (khách không thấy) · trạng thái. Kênh đã vào → mở phòng
 * chat; kênh công khai CHƯA vào → nút "Tham gia" ngay trên hàng (không bắt người dùng đi lòng vòng qua danh sách kênh).
 */
export const ChannelResultItem = memo(function ChannelResultItem({
  hit,
  joining,
  onJoin,
  onOpen,
}: ChannelResultItemProps) {
  const isPrivate = hit.visibility === 'PRIVATE';
  const archived = hit.status === 'ARCHIVED';
  const art = channelTypeArt(hit.type);
  const meta = [
    CHANNEL_TYPE_LABEL[hit.type] ?? 'Kênh',
    hit.memberCount === undefined ? null : `${hit.memberCount} thành viên`,
  ]
    .filter(Boolean)
    .join(' · ');
  const canJoin = !hit.joined && !archived && !isPrivate;

  const spoken = [
    `Kênh ${hit.name}`,
    isPrivate ? 'riêng tư' : null,
    meta,
    hit.joined ? null : 'chưa tham gia',
    archived ? 'đã lưu trữ' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View className="flex-row items-center gap-sm px-md py-sm">
      <Pressable
        accessibilityHint={hit.joined ? 'Mở kênh' : 'Xem danh sách kênh của nhóm'}
        accessibilityLabel={spoken}
        accessibilityRole="button"
        className="flex-1 flex-row items-center gap-sm active:opacity-70"
        onPress={() => onOpen(hit)}
      >
        {/* Ô icon theo LOẠI kênh (cùng bảng với danh sách kênh); đã lưu trữ về `neutral`. Riêng tư là ổ khoá cạnh tên. */}
        <IconTile name={art.icon} tone={archived ? 'neutral' : art.tone} />

        <View className="flex-1 gap-3xs">
          <View className="flex-row items-center gap-2xs">
            <Text className="shrink text-label-md font-semibold text-fg-1" numberOfLines={1}>
              {`#${hit.name}`}
            </Text>
            {isPrivate ? <Icon color="fg-2" name="lock" size={14} /> : null}
            {archived ? <Badge label="Đã lưu trữ" size="sm" variant="warning" /> : null}
            {hit.joined ? null : <Badge label="Chưa tham gia" size="sm" />}
          </View>
          <Text className="text-caption-sm text-fg-2" numberOfLines={1}>
            {meta}
          </Text>
        </View>
      </Pressable>

      {canJoin ? (
        <Button
          label="Tham gia"
          loading={joining}
          size="sm"
          variant="secondary"
          onPress={() => onJoin(hit)}
        />
      ) : null}
    </View>
  );
});
