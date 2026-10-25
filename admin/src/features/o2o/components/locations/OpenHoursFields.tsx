import { memo } from 'react';
import { useFormContext } from 'react-hook-form';

import { Button, FieldArray, SelectField, Text, TimeField } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import { NEW_OPEN_HOUR, O2O_LIMITS, WEEKDAY_OPTIONS } from '../../constants/o2o.constants';
import type { LocationFormValues } from '../../schemas/location.schema';

/**
 * Giờ mở cửa theo ngày (`FieldArray`): mỗi hàng = thứ + giờ mở + giờ đóng; một ngày có thể nhiều khung (ca sáng/chiều).
 * Đóng phải SAU mở (không qua nửa đêm — tách hai dòng ngày) — schema báo lỗi ở ô "Giờ đóng". Phải nằm trong `<Form>`.
 */
const OpenHoursFields = memo(function OpenHoursFields() {
  const { formState } = useFormContext<LocationFormValues>();
  const listError =
    formState.errors.openHours?.root?.message ?? formState.errors.openHours?.message;

  return (
    <FieldArray<LocationFormValues, 'openHours'> name="openHours">
      {({ fields, append, remove }) => (
        <div className="flex flex-col gap-3">
          {fields.length === 0 ? (
            <Text size="small" skin="muted">
              Chưa khai giờ mở cửa — ứng dụng hiện "Chưa có giờ mở cửa" và địa điểm bị loại khỏi bộ
              lọc "Đang mở".
            </Text>
          ) : null}
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="grid grid-cols-1 items-start gap-3 md:grid-cols-[10rem_8rem_8rem_auto]"
            >
              <SelectField
                label={`Thứ (khung ${index + 1})`}
                name={`openHours.${index}.day`}
                options={WEEKDAY_OPTIONS}
              />
              <TimeField label="Giờ mở" name={`openHours.${index}.open`} />
              <TimeField label="Giờ đóng" name={`openHours.${index}.close`} />
              <div className="md:pt-6">
                <Button
                  aria-label={`Xoá khung giờ ${index + 1}`}
                  size="sm"
                  skin="danger"
                  startIcon={<SystemIcon name="trash-outline" size={14} />}
                  variant="ghost"
                  onClick={() => remove(index)}
                />
              </div>
            </div>
          ))}
          {listError ? (
            <Text role="alert" size="small" skin="error">
              {listError}
            </Text>
          ) : null}
          <Button
            className="self-start"
            disabled={fields.length >= O2O_LIMITS.openHoursMax}
            size="sm"
            startIcon={<SystemIcon name="plus-outline" size={14} />}
            variant="stroke"
            onClick={() => append({ ...NEW_OPEN_HOUR })}
          >
            Thêm khung giờ
          </Button>
        </div>
      )}
    </FieldArray>
  );
});

export default OpenHoursFields;
