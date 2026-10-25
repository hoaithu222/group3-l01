import { memo } from 'react';

import { Callout, FormGrid, NumberField } from '@/shared/ui';

/**
 * Ô nhập TOẠ ĐỘ — chỗ TẠM của `MapPointField` (p0-12, chọn điểm bằng cách kéo pin + tìm địa chỉ Mapbox).
 *
 * TODO(p0-12): thay khối này bằng `<MapPointField name="location" />` khi `mapbox-gl` được duyệt cài (chưa có trong
 * `package.json`) và widget `shared/widgets/map` + `VITE_MAPBOX_TOKEN` sẵn sàng. ĐIỂM NỐI: form chỉ cần hai giá trị số `lat`/`lng`
 * (cùng tên trường trong `location.schema.ts`) và `toLocationBody`/`toUpdateLocationPayload` đã đọc đúng hai trường đó — nên
 * MapPointField chỉ việc ghi `lat`/`lng` vào form, không phải đổi schema, service hay payload.
 */
const CoordinateFields = memo(function CoordinateFields() {
  return (
    <div className="flex flex-col gap-3">
      <Callout
        description="Chưa có bản đồ chọn điểm. Lấy toạ độ từ Google Maps/OpenStreetMap (bấm chuột phải vào vị trí → chép vĩ độ, kinh độ) rồi nhập vào hai ô dưới."
        intent="info"
        variant="ghost"
      />
      <FormGrid cols={2}>
        <NumberField
          description="−90 … 90 (vd 21.0285)"
          label="Vĩ độ"
          name="lat"
          required
          step={0.0001}
        />
        <NumberField
          description="−180 … 180 (vd 105.8542)"
          label="Kinh độ"
          name="lng"
          required
          step={0.0001}
        />
      </FormGrid>
    </div>
  );
});

export default CoordinateFields;
