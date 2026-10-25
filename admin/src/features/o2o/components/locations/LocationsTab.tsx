import { memo, useCallback, useMemo, useState } from 'react';

import { useAuthStore } from '@/app/store';
import { useNavHref } from '@/shared/hooks';
import { Button, Dropdown, Table, Toolbar } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import {
  AMENITY_FILTER_OPTIONS,
  LOCATION_STATUS_FILTER_OPTIONS,
  LOCATION_TYPE_FILTER_OPTIONS,
  O2O_PAGE_SIZE,
} from '../../constants/o2o.constants';
import { useLocationFilters } from '../../hooks/useLocationFilters';
import { useAdminLocations } from '../../service/o2o-locations.queries';
import type { AdminLocation, LocationFormTarget } from '../../types/o2o.types';
import FilterSearchInput from '../shared/FilterSearchInput';
import ListLoadError from '../shared/ListLoadError';
import LocationDrawer from './LocationDrawer';
import LocationFormModal from './LocationFormModal';
import { buildLocationColumns } from './locations.columns';

/**
 * Tab "Địa điểm" (admin.md p6-05 §2.1): bảng phân trang server, tìm `?q=` (IME-safe) + lọc loại · tiện ích · trạng thái — mọi bộ lọc,
 * trang và ngăn kéo (`?locationId=`, deep link `/o2o/locations/:id` chuyển về đây) sống trên URL. Tạo/sửa bằng `LocationFormModal`
 * (toạ độ nhập tay — chưa có bản đồ, xem `CoordinateFields`). Nút Thêm cần `o2o:create`; sửa/ẩn cần `o2o:update` (kiểm ở ngăn kéo).
 */
const LocationsTab = memo(function LocationsTab() {
  const f = useLocationFilters();
  const buildHref = useNavHref();
  const canCreate = useAuthStore((s) => s.hasPermission('o2o', 'create'));
  const { data, error, isLoading, isError, refetch } = useAdminLocations(f.params);
  const [formTarget, setFormTarget] = useState<LocationFormTarget | null>(null);
  const { openLocation } = f;

  const columns = useMemo(
    () =>
      buildLocationColumns({
        hrefFor: (l) => buildHref({ locationId: l.id }),
        onOpen: (l) => openLocation(l.id),
      }),
    [buildHref, openLocation],
  );
  const rowKey = useCallback((l: AdminLocation) => l.id, []);
  const rows = useMemo(() => data?.data ?? [], [data]);

  return (
    <div className="flex flex-col gap-3">
      <Toolbar
        left={
          <>
            <FilterSearchInput
              maxLength={100}
              placeholder="Tìm theo tên địa điểm…"
              value={f.search}
              onChange={f.setSearch}
            />
            <Dropdown
              aria-label="Lọc theo loại"
              className="w-40"
              options={LOCATION_TYPE_FILTER_OPTIONS}
              size="sm"
              value={f.values.type}
              onValueChange={(v) => f.setFilter('type', v)}
            />
            <Dropdown
              aria-label="Lọc theo tiện ích"
              className="w-44"
              options={AMENITY_FILTER_OPTIONS}
              size="sm"
              value={f.values.amenity}
              onValueChange={(v) => f.setFilter('amenity', v)}
            />
            <Dropdown
              aria-label="Lọc theo trạng thái"
              className="w-44"
              options={LOCATION_STATUS_FILTER_OPTIONS}
              size="sm"
              value={f.values.status}
              onValueChange={(v) => f.setFilter('status', v)}
            />
            {f.hasActiveFilter ? (
              <Button size="sm" variant="ghost" onClick={f.clear}>
                Xoá bộ lọc
              </Button>
            ) : null}
          </>
        }
        right={
          canCreate ? (
            <Button
              size="sm"
              startIcon={<SystemIcon name="plus-outline" size={14} />}
              variant="primary"
              onClick={() => setFormTarget({ location: null })}
            >
              Thêm địa điểm
            </Button>
          ) : null
        }
      />
      {isError && !data ? (
        <ListLoadError
          error={error}
          title="Không tải được danh sách địa điểm"
          onRetry={() => void refetch()}
        />
      ) : (
        <Table
          columns={columns}
          currentPage={f.page}
          data={rows}
          emptyMessage={
            f.hasActiveFilter ? 'Không có địa điểm nào khớp bộ lọc' : 'Chưa có địa điểm nào'
          }
          loading={isLoading}
          pageSize={O2O_PAGE_SIZE}
          rowKey={rowKey}
          total={data?.meta?.total ?? 0}
          onPageChange={f.setPage}
        />
      )}
      <LocationDrawer
        locationId={f.locationId}
        onClose={() => openLocation(null)}
        onEdit={(location) => setFormTarget({ location })}
      />
      {formTarget ? (
        <LocationFormModal location={formTarget.location} onClose={() => setFormTarget(null)} />
      ) : null}
    </div>
  );
});

export default LocationsTab;
