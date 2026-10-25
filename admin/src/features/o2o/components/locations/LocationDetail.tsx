import { memo, useState } from 'react';

import { useAuthStore } from '@/app/store';
import { Button, ConfirmWithReasonModal, Tabs } from '@/shared/ui';
import { AuditTrailPanel } from '@/shared/widgets/audit-trail';
import { useDisclosure } from '@/shared/hooks';

import { LOCATION_STATUS_META } from '../../constants/o2o.constants';
import { useSetLocationHidden } from '../../service/o2o-locations.queries';
import type { AdminLocationDetail } from '../../types/o2o.types';
import StatusBadge from '../shared/StatusBadge';
import LocationInfoPanel from './LocationInfoPanel';
import LocationReviewsPanel from './LocationReviewsPanel';

type DetailTab = 'info' | 'reviews' | 'audit';

const TABS = [
  { key: 'info', label: 'Thông tin' },
  { key: 'reviews', label: 'Đánh giá' },
  { key: 'audit', label: 'Nhật ký' },
];

export interface LocationDetailProps {
  location: AdminLocationDetail;
  onEdit: (location: AdminLocationDetail) => void;
}

/**
 * Nội dung ngăn kéo địa điểm: tên + trạng thái, nút Sửa / Ẩn-Hiện (cần `o2o:update`), ba tab Thông tin · Đánh giá · Nhật ký
 * (audit target `Location`). Ẩn/Hiện đều qua `ConfirmWithReasonModal` (lý do → nhật ký `o2o.location-hide|unhide`).
 * Nơi gọi đặt `key={location.id}` để đổi địa điểm là về tab Thông tin.
 */
const LocationDetail = memo(function LocationDetail({ location, onEdit }: LocationDetailProps) {
  const canUpdate = useAuthStore((s) => s.hasPermission('o2o', 'update'));
  const [tab, setTab] = useState<DetailTab>('info');
  const toggle = useDisclosure();
  const setHidden = useSetLocationHidden();
  const hidden = location.status === 'HIDDEN';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-body-16-semibold text-fg-1">{location.name}</div>
          <StatusBadge fallback={location.status} meta={LOCATION_STATUS_META[location.status]} />
        </div>
        {canUpdate ? (
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="stroke" onClick={() => onEdit(location)}>
              Sửa
            </Button>
            <Button size="sm" variant={hidden ? 'primary' : 'stroke'} onClick={toggle.open}>
              {hidden ? 'Hiện lại' : 'Ẩn địa điểm'}
            </Button>
          </div>
        ) : null}
      </div>
      <Tabs
        aria-label="Chi tiết địa điểm"
        options={TABS}
        size="sm"
        value={tab}
        onValueChange={(v) => setTab(v as DetailTab)}
      />
      {tab === 'info' ? <LocationInfoPanel location={location} /> : null}
      {tab === 'reviews' ? (
        <LocationReviewsPanel canUpdate={canUpdate} locationId={location.id} />
      ) : null}
      {tab === 'audit' ? <AuditTrailPanel targetId={location.id} targetType="Location" /> : null}
      <ConfirmWithReasonModal
        confirmTone={hidden ? 'primary' : 'danger'}
        impact={
          hidden
            ? 'Địa điểm hiện lại trên bản đồ và tìm kiếm của người dùng.'
            : 'Người dùng không còn thấy địa điểm này (bản đồ, tìm kiếm, chi tiết). Đơn in đang xử lý không bị ảnh hưởng.'
        }
        open={toggle.isOpen}
        title={hidden ? 'Hiện lại địa điểm' : 'Ẩn địa điểm'}
        onConfirm={async (reason) => {
          await setHidden.mutateAsync({ id: location.id, reason, hidden: !hidden });
          toggle.close();
        }}
        onOpenChange={(open) => !open && toggle.close()}
      />
    </div>
  );
});

export default LocationDetail;
