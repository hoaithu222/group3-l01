import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { Reveal } from '@/shared/ui/motion';
import { showToast } from '@/shared/utils/toast.utils';

import type { LocationDetail } from '../api/o2o.types';
import {
  AMENITY_LABEL,
  LOCATION_TYPE_ICON,
  LOCATION_TYPE_LABEL,
  LOCATION_TYPE_TONE,
} from '../constants/o2o.constants';
import { directionsUrl } from '../utils/geo';
import { newOrderHref } from '../utils/o2o-routes';
import { openStatusText } from '../utils/o2o-format';
import { OpenHoursCard } from './OpenHoursCard';
import { PhotoCarousel } from './PhotoCarousel';
import { PrintShopCard } from './PrintShopCard';
import { RatingSection } from './RatingSection';
import { ReviewSheet } from './ReviewSheet';
import { ReviewsSheet } from './ReviewsSheet';

/** Mở ứng dụng bản đồ chỉ đường tới địa điểm (app.md §3 "Chỉ đường"). Không có app nào nhận liên kết thì báo, không im lặng. */
function openDirections(detail: LocationDetail) {
  Linking.openURL(directionsUrl({ lat: detail.lat, lng: detail.lng })).catch(() =>
    showToast('error', 'Không mở được ứng dụng bản đồ trên máy này.'),
  );
}

/**
 * Thân chi tiết địa điểm, theo thứ tự ƯU TIÊN từ trên xuống (screen-layout: mức quan trọng giảm dần, khe giữa hai khối 24dp): ảnh → tên/địa chỉ/chỉ
 * đường → giờ mở → tiệm in (nếu có) → đánh giá. Hai tờ (viết đánh giá, tất cả đánh giá) đứng cạnh nhau ở đây vì cùng phụ thuộc `detail`.
 */
export function LocationDetailBody({ detail }: { detail: LocationDetail }) {
  const [writing, setWriting] = useState(false);
  const [listing, setListing] = useState(false);
  const shop = detail.shop;

  return (
    <View className="gap-xl py-xs">
      <PhotoCarousel name={detail.name} photos={detail.photos} />

      {/* `Reveal` cho các khối CỐ ĐỊNH của trang (thông tin → giờ mở → tiệm in → đánh giá), lệch nhịp 50ms — tự tắt khi "Giảm chuyển động".
          ⛔ Không bọc băng ảnh: nó tự trả `null` khi không có ảnh, bọc vào là còn một khối rỗng chiếm thêm một khe 24dp. */}
      <Reveal className="gap-xs">
        <View className="flex-row items-center gap-sm">
          <IconTile
            name={LOCATION_TYPE_ICON[detail.type]}
            size="lg"
            tone={LOCATION_TYPE_TONE[detail.type]}
          />
          <Text className="flex-1 text-header-sm font-semibold text-fg-1">{detail.name}</Text>
        </View>
        <View className="flex-row items-start gap-2xs">
          <Icon color="fg-2" name="location" size="sm" />
          <Text className="flex-1 text-body-md text-fg-2">
            {LOCATION_TYPE_LABEL[detail.type]} · {detail.address}
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-2xs">
          <Badge
            label={openStatusText(detail.openNow)}
            size="sm"
            variant={detail.openNow === true ? 'success' : 'neutral'}
          />
          {detail.amenities.map((code) => (
            <Badge key={code} label={AMENITY_LABEL[code] ?? code} size="sm" variant="neutral" />
          ))}
        </View>
        <View className="flex-row pt-2xs">
          <Button
            iconLeft="navigation-map"
            label="Chỉ đường"
            size="sm"
            variant="secondary"
            onPress={() => openDirections(detail)}
          />
        </View>
      </Reveal>

      <Reveal index={1}>
        <OpenHoursCard openHours={detail.openHours} openNow={detail.openNow} />
      </Reveal>

      {shop ? (
        <Reveal index={2}>
          <PrintShopCard
            shop={shop}
            onOrder={() => router.push(newOrderHref({ shopId: shop.id, locationName: detail.name }))}
          />
        </Reveal>
      ) : null}

      <Reveal index={3}>
        <RatingSection
          detail={detail}
          onSeeAll={() => setListing(true)}
          onWrite={() => setWriting(true)}
        />
      </Reveal>

      <ReviewSheet
        locationId={detail.id}
        mine={detail.myReview}
        visible={writing}
        onClose={() => setWriting(false)}
      />
      <ReviewsSheet locationId={detail.id} visible={listing} onClose={() => setListing(false)} />
    </View>
  );
}
