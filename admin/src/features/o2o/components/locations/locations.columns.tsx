import { Link } from 'react-router-dom';

import { Badge } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { isModifiedClick } from '@/shared/utils/browser/link.utils';

import {
  LOCATION_STATUS_META,
  LOCATION_TYPE_META,
  SHOP_STATUS_META,
} from '../../constants/o2o.constants';
import type { AdminLocation } from '../../types/o2o.types';
import { amenityLabel, formatNoise, formatRating, shopChip } from '../../utils/location.utils';
import StatusBadge from '../shared/StatusBadge';

export interface LocationColumnsOptions {
  /** URL THẬT mở ngăn kéo địa điểm (giữ bộ lọc) — Ctrl+click mở tab mới được. */
  hrefFor: (location: AdminLocation) => string;
  onOpen: (location: AdminLocation) => void;
}

const AMENITIES_SHOWN = 3;

/**
 * Cột bảng "Địa điểm" (admin.md p6-05 §2.1): tên (liên kết mở ngăn kéo) · loại · địa chỉ · tiện ích (≤ 3 chip + "+N") · sao/độ ồn ·
 * tiệm in (có / chờ duyệt / không) · trạng thái. Trạng thái luôn có CHỮ, không chỉ màu.
 */
export function buildLocationColumns({
  hrefFor,
  onOpen,
}: LocationColumnsOptions): TableColumn<AdminLocation>[] {
  return [
    {
      key: 'name',
      header: 'Địa điểm',
      width: 240,
      cell: (l) => (
        <Link
          className="block truncate text-body-14 text-link hover:underline"
          to={hrefFor(l)}
          onClick={(ev) => {
            if (isModifiedClick(ev)) return;
            ev.preventDefault();
            onOpen(l);
          }}
        >
          {l.name}
        </Link>
      ),
    },
    {
      key: 'type',
      header: 'Loại',
      width: 120,
      cell: (l) => <StatusBadge fallback={l.type} meta={LOCATION_TYPE_META[l.type]} />,
    },
    {
      key: 'address',
      header: 'Địa chỉ',
      width: 260,
      cell: (l) => <span className="line-clamp-2">{l.address}</span>,
    },
    {
      key: 'amenities',
      header: 'Tiện ích',
      width: 240,
      cell: (l) =>
        l.amenities.length === 0 ? (
          <span className="text-fg-4">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {l.amenities.slice(0, AMENITIES_SHOWN).map((code) => (
              <Badge key={code} color="neutral" size="sm" variant="outline">
                {amenityLabel(code)}
              </Badge>
            ))}
            {l.amenities.length > AMENITIES_SHOWN ? (
              <span className="text-caption-12 text-fg-3">
                +{l.amenities.length - AMENITIES_SHOWN}
              </span>
            ) : null}
          </div>
        ),
    },
    {
      key: 'rating',
      header: 'Sao · Độ ồn',
      width: 150,
      cell: (l) => (
        <div className="min-w-0 text-caption-12">
          <div className="tabular-nums text-fg-1">{formatRating(l)}</div>
          <div className="tabular-nums text-fg-4">Ồn {formatNoise(l)}</div>
        </div>
      ),
    },
    {
      key: 'shop',
      header: 'Tiệm in',
      width: 120,
      cell: (l) => (
        <Badge color={l.shop ? SHOP_STATUS_META[l.shop.status].color : 'neutral'} variant="tinted">
          {shopChip(l.shop)}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: 130,
      cell: (l) => <StatusBadge fallback={l.status} meta={LOCATION_STATUS_META[l.status]} />,
    },
  ];
}
