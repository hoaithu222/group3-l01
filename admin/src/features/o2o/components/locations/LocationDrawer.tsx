import { memo } from 'react';

import { Drawer, EmptyState, Skeleton } from '@/shared/ui';

import { useAdminLocation } from '../../service/o2o-locations.queries';
import type { AdminLocationDetail } from '../../types/o2o.types';
import LocationDetail from './LocationDetail';

export interface LocationDrawerProps {
  /** `null` = đóng (đồng bộ `?locationId=`). */
  locationId: string | null;
  onClose: () => void;
  onEdit: (location: AdminLocationDetail) => void;
}

/**
 * Ngăn kéo chi tiết địa điểm (`?locationId=`, deep link `/o2o/locations/:id`). Chỉ tải khi mở; 404 (id sai / đã xoá) hiện
 * "Không tìm thấy" thay vì toast. Nội dung ở `LocationDetail`.
 */
const LocationDrawer = memo(function LocationDrawer({
  locationId,
  onClose,
  onEdit,
}: LocationDrawerProps) {
  const { data: location, isPending, isError } = useAdminLocation(locationId ?? undefined);

  return (
    <Drawer
      open={locationId !== null}
      side="right"
      size="lg"
      title="Địa điểm"
      onOpenChange={(next) => !next && onClose()}
    >
      {isPending && locationId !== null ? (
        <Skeleton className="h-40 w-full" />
      ) : isError || !location ? (
        <EmptyState
          description="Địa điểm không tồn tại hoặc bạn không còn quyền xem."
          title="Không tìm thấy địa điểm"
        />
      ) : (
        <LocationDetail key={location.id} location={location} onEdit={onEdit} />
      )}
    </Drawer>
  );
});

export default LocationDrawer;
