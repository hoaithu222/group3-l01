import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { Divider } from '@/shared/ui/divider';
import { type IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { formatNumber } from '@/shared/utils/format/currency.utils';

import type { ListingDetail } from '../api/marketplace.types';
import { CONTENT_TYPE_VISUAL } from '../constants/marketplace.constants';
import {
  CONTENT_TYPE_LABELS,
  LISTING_STATUS_BADGE_VARIANT,
  LISTING_STATUS_LABELS,
  formatCoins,
} from '../utils/listing-format';

/** Ô số liệu nhỏ (giá, lượt mua): ô icon + số lớn + nhãn — MỘT ô trợ năng đọc "Giá: 120 xu". */
function StatTile({
  icon,
  label,
  tone,
  value,
}: {
  icon: IconName;
  label: string;
  tone: IconTileTone;
  value: string;
}) {
  return (
    <View
      accessibilityLabel={`${label}: ${value}`}
      accessible
      className="flex-1 flex-row items-center gap-xs rounded-sm bg-bg-2 p-sm"
    >
      <IconTile name={icon} size="sm" tone={tone} />
      <View className="flex-1">
        <Text className="text-header-sm font-bold text-fg-1" numberOfLines={1}>
          {value}
        </Text>
        <Text className="text-caption-sm text-fg-2">{label}</Text>
      </View>
    </View>
  );
}

export interface ListingHeroProps {
  /** Tin của CHÍNH tôi — hiện thêm huy hiệu trạng thái duyệt (người ngoài chỉ thấy tin đang bán). */
  isMine: boolean;
  listing: ListingDetail;
}

/**
 * Đầu trang chi tiết tin: ô icon theo loại · tiêu đề (mốc `header` — `AppBar` chỉ ghi "Chi tiết tài liệu" nên không đọc lặp) · huy hiệu loại /
 * trạng thái / đã mua · hai ô số liệu (giá, lượt mua) · người bán. Trạng thái là CHỮ trên huy hiệu, màu chỉ bổ trợ.
 * Người bán: BE chỉ trả TÊN (không ảnh) ⇒ `Avatar` dựng chữ viết tắt.
 */
export function ListingHero({ isMine, listing }: ListingHeroProps) {
  const visual = CONTENT_TYPE_VISUAL[listing.contentType];

  return (
    <Card>
      <View className="flex-row items-start gap-sm">
        <IconTile name={visual.icon} size="lg" tone={visual.tone} />
        <View className="flex-1 gap-xs">
          <Text accessibilityRole="header" className="text-header-sm font-semibold text-fg-1">
            {listing.title}
          </Text>
          <View className="flex-row flex-wrap items-center gap-xs">
            <Badge label={CONTENT_TYPE_LABELS[listing.contentType]} size="sm" variant="neutral" />
            {isMine ? (
              <Badge
                label={LISTING_STATUS_LABELS[listing.status]}
                size="sm"
                variant={LISTING_STATUS_BADGE_VARIANT[listing.status]}
              />
            ) : null}
            {listing.purchased ? <Badge label="Đã mua" size="sm" variant="success" /> : null}
          </View>
        </View>
      </View>

      <View className="flex-row gap-sm">
        <StatTile icon="loyalty" label="Giá" tone="accent" value={formatCoins(listing.price)} />
        <StatTile icon="basket-01" label="Lượt mua" tone="info" value={formatNumber(listing.sales)} />
      </View>

      {listing.sellerName ? (
        <>
          <Divider />
          {/* Gộp "Người bán, <tên>" thành MỘT ô trợ năng; avatar nằm trong ô gộp nên không đọc lặp tên. */}
          <View
            accessibilityLabel={`Người bán: ${listing.sellerName}`}
            accessible
            className="flex-row items-center gap-sm"
          >
            <Avatar name={listing.sellerName} size="sm" />
            <View className="flex-1">
              <Text className="text-caption-lg text-fg-2">Người bán</Text>
              <Text className="text-label-md font-semibold text-fg-1" numberOfLines={1}>
                {listing.sellerName}
              </Text>
            </View>
          </View>
        </>
      ) : null}
    </Card>
  );
}
