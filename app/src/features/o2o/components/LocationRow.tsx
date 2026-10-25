import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';

import type { NearLocation } from '../api/o2o.types';
import {
  AMENITY_LABEL,
  LOCATION_TYPE_ICON,
  LOCATION_TYPE_LABEL,
  LOCATION_TYPE_TONE,
} from '../constants/o2o.constants';
import { formatDistance } from '../utils/geo';
import { openStatusText, ratingSummary } from '../utils/o2o-format';

export interface LocationRowProps {
  item: NearLocation;
  selected?: boolean;
  onPress: () => void;
}

const MAX_AMENITIES = 3;

/**
 * Một dòng địa điểm (app.md §3): tên, loại (icon + CHỮ), khoảng cách, sao + độ ồn bằng chữ, đang mở/đóng, tiện ích (icon-less badge chữ) và
 * trạng thái nhận đơn in. Mọi tín hiệu đều có CHỮ — không để màu hay icon làm dấu hiệu duy nhất. Nhãn trợ năng gộp cả dòng thành MỘT câu.
 */
export function LocationRow({ item, selected = false, onPress }: LocationRowProps) {
  const distance = formatDistance(item.distanceM);
  const open = openStatusText(item.openNow);
  const rating = ratingSummary(item);
  const shown = item.amenities.slice(0, MAX_AMENITIES);
  const more = item.amenities.length - shown.length;
  const spoken = [
    item.name,
    LOCATION_TYPE_LABEL[item.type],
    distance ? `cách ${distance}` : '',
    rating,
    open,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityLabel={spoken}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
    >
      {({ pressed }) => (
        <View
          className={
            selected
              ? 'flex-row items-start gap-sm rounded-md border-medium border-border-brand bg-surface-primary p-md'
              : pressed
                ? 'flex-row items-start gap-sm rounded-md border-hairline border-border-1 bg-bg-2 p-md'
                : 'flex-row items-start gap-sm rounded-md border-hairline border-border-1 bg-bg-1 p-md'
          }
        >
          <IconTile name={LOCATION_TYPE_ICON[item.type]} tone={LOCATION_TYPE_TONE[item.type]} />
          <View className="flex-1 gap-2xs">
            <Text className="text-label-lg font-semibold text-fg-1" numberOfLines={2}>
              {item.name}
            </Text>
            <Text className="text-body-md text-fg-2">
              {LOCATION_TYPE_LABEL[item.type]}
              {distance ? ` · ${distance}` : ''}
            </Text>
            <Text className="text-body-md text-fg-2">{rating}</Text>
            <View className="flex-row flex-wrap items-center gap-2xs pt-2xs">
              <Badge
                label={open}
                size="sm"
                variant={item.openNow === true ? 'success' : 'neutral'}
              />
              {item.shop ? (
                <Badge
                  label={item.shop.acceptingOrders ? 'Nhận đơn in' : 'Tạm ngưng nhận đơn'}
                  size="sm"
                  variant={item.shop.acceptingOrders ? 'brand' : 'neutral'}
                />
              ) : null}
              {shown.map((code) => (
                <Badge key={code} label={AMENITY_LABEL[code] ?? code} size="sm" variant="neutral" />
              ))}
              {more > 0 ? <Badge label={`+${more}`} size="sm" variant="neutral" /> : null}
            </View>
          </View>
          <Icon color="fg-2" name="arrow-right-small" size="sm" />
        </View>
      )}
    </Pressable>
  );
}
