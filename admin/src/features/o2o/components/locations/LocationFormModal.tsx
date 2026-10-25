import type { AxiosError } from 'axios';
import { memo, useState } from 'react';

import { extractErrorCode } from '@/core/api/error.handler';
import {
  Button,
  Callout,
  FileField,
  FormGrid,
  FormModal,
  MultiSelectField,
  SelectField,
  TextField,
  useZodForm,
} from '@/shared/ui';

import {
  AMENITY_OPTIONS,
  LOCATION_PHOTO_ACCEPT,
  LOCATION_TYPE_OPTIONS,
  O2O_LIMITS,
} from '../../constants/o2o.constants';
import { useLocationPhotoUpload } from '../../hooks/useLocationPhotoUpload';
import { locationFormSchema, type LocationFormValues } from '../../schemas/location.schema';
import { useCreateLocation, useUpdateLocation } from '../../service/o2o-locations.queries';
import type { AdminLocation } from '../../types/o2o.types';
import {
  initLocationValues,
  toLocationBody,
  toUpdateLocationPayload,
} from '../../utils/location-form.utils';
import CoordinateFields from './CoordinateFields';
import OpenHoursFields from './OpenHoursFields';

export interface LocationFormModalProps {
  /** `null` = tạo mới; có địa điểm = sửa (gửi `expectedVersion`, chỉ trường đã đổi). */
  location: AdminLocation | null;
  onClose: () => void;
}

/**
 * Form tạo/sửa địa điểm (admin.md p6-05 §2.1). Nơi gọi CHỈ mount khi cần mở (key theo địa điểm) nên `defaultValues` luôn đúng
 * bản đang sửa. Lưu: tạo → `POST`, sửa → `PATCH` với `expectedVersion`; 409 `RES_003` → banner "Dữ liệu đã thay đổi" và GIỮ
 * nguyên nội dung đã nhập để so lại. Ảnh (`FileField` nhiều tệp, `/assets` scope `LOCATION`) dùng chung MỘT danh sách
 * cho cả tạo lẫn sửa — sửa chỉ gửi `photoAssetIds` khi TẬP id đổi (`toUpdateLocationPayload`), ảnh cũ không đụng tới
 * hiện lại dạng thẻ tên (không có thumbnail thật — id asset không phải URL xem trước).
 */
const LocationFormModal = memo(function LocationFormModal({
  location,
  onClose,
}: LocationFormModalProps) {
  const form = useZodForm<LocationFormValues>(locationFormSchema, {
    defaultValues: initLocationValues(location),
  });
  const create = useCreateLocation();
  const update = useUpdateLocation();
  const photos = useLocationPhotoUpload();
  const [conflict, setConflict] = useState(false);

  const handleConfirm = async (values?: LocationFormValues) => {
    if (!values) return;
    setConflict(false);
    try {
      if (location) await update.mutateAsync(toUpdateLocationPayload(location, values));
      else await create.mutateAsync(toLocationBody(values));
      // Thành công: FormModal tự gọi onOpenChange(false) → onClose.
    } catch (err) {
      if (extractErrorCode(err as AxiosError) === 'RES_003') setConflict(true);
      throw err; // FormModal giữ modal mở để người dùng sửa và gửi lại
    }
  };

  return (
    <FormModal<LocationFormValues>
      confirmDisabled={photos.uploading}
      confirmLabel={location ? 'Lưu thay đổi' : 'Tạo địa điểm'}
      form={form}
      open
      scrollable
      size="lg"
      title={location ? 'Sửa địa điểm' : 'Thêm địa điểm'}
      onConfirm={handleConfirm}
      onOpenChange={(next) => !next && onClose()}
    >
      {conflict ? (
        <Callout
          action={
            <Button size="sm" variant="stroke" onClick={onClose}>
              Đóng để tải lại
            </Button>
          }
          description="Người khác vừa sửa địa điểm này. Đóng form rồi mở lại để lấy bản mới nhất."
          intent="warning"
          title="Dữ liệu đã thay đổi"
        />
      ) : null}
      <FormGrid cols={2}>
        <TextField label="Tên địa điểm" maxLength={O2O_LIMITS.nameMax} name="name" required />
        <SelectField label="Loại" name="type" options={LOCATION_TYPE_OPTIONS} required />
      </FormGrid>
      <TextField label="Địa chỉ" maxLength={O2O_LIMITS.addressMax} name="address" required />
      <CoordinateFields />
      <MultiSelectField label="Tiện ích" name="amenities" options={AMENITY_OPTIONS} />
      <OpenHoursFields />
      <FileField
        accept={LOCATION_PHOTO_ACCEPT}
        description={`Tối đa ${O2O_LIMITS.photosMax} ảnh, mỗi ảnh JPEG/PNG/WebP ≤ 5 MB.`}
        filesTitle="Ảnh địa điểm"
        label="Ảnh"
        maxFiles={O2O_LIMITS.photosMax}
        maxSize={5}
        multiple
        name="photos"
        onUpload={photos.onUpload}
      />
    </FormModal>
  );
});

export default LocationFormModal;
