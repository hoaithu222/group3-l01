import { memo } from 'react';
import { Link } from 'react-router-dom';

import { Badge, ImagePreview, Text } from '@/shared/ui';
import { NEW_TAB_LINK_PROPS } from '@/shared/utils/browser/link.utils';
import { formatNumber } from '@/shared/utils/format';

import {
  LOCATION_STATUS_META,
  LOCATION_TYPE_META,
  SHOP_STATUS_META,
} from '../../constants/o2o.constants';
import type { AdminLocationDetail } from '../../types/o2o.types';
import {
  amenityLabel,
  formatNoise,
  formatOpenHours,
  formatRating,
  mapLinkOf,
} from '../../utils/location.utils';
import Fact from '../shared/Fact';
import StatusBadge from '../shared/StatusBadge';

export interface LocationInfoPanelProps {
  location: AdminLocationDetail;
}

/**
 * Tab "Thông tin" của ngăn kéo địa điểm: loại · trạng thái (kèm lý do ẩn) · địa chỉ · toạ độ (+ liên kết OpenStreetMap thay
 * cho bản đồ nhúng) · điểm đánh giá · tiện ích · giờ mở cửa · tiệm in gắn với địa điểm · ảnh (URL ký, mở lightbox).
 */
const LocationInfoPanel = memo(function LocationInfoPanel({ location: l }: LocationInfoPanelProps) {
  const hours = formatOpenHours(l.openHours);
  const photos = l.photos.filter((p) => p.url ?? p.thumbUrl);
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3">
        <Fact label="Loại">
          <StatusBadge fallback={l.type} meta={LOCATION_TYPE_META[l.type]} />
        </Fact>
        <Fact label="Trạng thái">
          <StatusBadge fallback={l.status} meta={LOCATION_STATUS_META[l.status]} />
        </Fact>
        {l.status === 'HIDDEN' && l.hiddenReason ? (
          <Fact label="Lý do ẩn" wide>
            {l.hiddenReason}
          </Fact>
        ) : null}
        <Fact label="Địa chỉ" wide>
          {l.address}
        </Fact>
        <Fact label="Toạ độ" wide>
          <span className="tabular-nums">
            {l.lat}, {l.lng}
          </span>{' '}
          <a
            className="text-link hover:underline"
            href={mapLinkOf(l.lat, l.lng)}
            {...NEW_TAB_LINK_PROPS}
          >
            Xem trên bản đồ
          </a>
        </Fact>
        <Fact label="Đánh giá">
          <span className="tabular-nums">{formatRating(l)}</span>
        </Fact>
        <Fact label="Độ ồn trung bình">
          <span className="tabular-nums">{formatNoise(l)}</span>
        </Fact>
        <Fact label="Tiệm in" wide>
          {l.shop ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <Link
                className="text-link hover:underline"
                to={{ search: `?tab=shops&shopId=${l.shop.id}` }}
              >
                {l.shop.displayName}
              </Link>
              <StatusBadge fallback={l.shop.status} meta={SHOP_STATUS_META[l.shop.status]} />
            </span>
          ) : (
            <span className="text-fg-4">Chưa có tiệm in</span>
          )}
        </Fact>
        <Fact label="Tiện ích" wide>
          {l.amenities.length === 0 ? (
            <span className="text-fg-4">—</span>
          ) : (
            <span className="flex flex-wrap gap-1">
              {l.amenities.map((code) => (
                <Badge key={code} color="neutral" size="sm" variant="outline">
                  {amenityLabel(code)}
                </Badge>
              ))}
            </span>
          )}
        </Fact>
        <Fact label="Giờ mở cửa" wide>
          {hours.length === 0 ? (
            <span className="text-fg-4">Chưa khai giờ mở cửa</span>
          ) : (
            hours.map((line) => <div key={line}>{line}</div>)
          )}
        </Fact>
      </dl>
      <div className="flex flex-col gap-2">
        <Text size="small" weight="medium">
          Ảnh ({formatNumber(l.photoAssetIds.length)})
        </Text>
        {photos.length === 0 ? (
          <Text size="small" skin="muted">
            {l.photoAssetIds.length === 0 ? 'Chưa có ảnh.' : 'Không tạo được liên kết xem ảnh.'}
          </Text>
        ) : (
          <div className="flex flex-wrap gap-2">
            {photos.map((p) => (
              <ImagePreview
                key={p.assetId}
                alt="Ảnh địa điểm"
                preview
                rounded="md"
                size="xl"
                src={p.url ?? p.thumbUrl ?? undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export default LocationInfoPanel;
