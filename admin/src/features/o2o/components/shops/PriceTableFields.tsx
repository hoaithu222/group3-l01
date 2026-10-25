import { memo } from 'react';

import { FormGrid, FormSection, NumberField, ToggleField } from '@/shared/ui';

import { O2O_LIMITS } from '../../constants/o2o.constants';
import { CAPABILITY_KEYS, CAPABILITY_LABELS, PRICE_FIELDS } from '../../constants/print.constants';

/**
 * Bảng giá + năng lực của tiệm — DÙNG CHUNG cho form tạo tiệm và form sửa bảng giá (cùng tên trường `priceTable.*`,
 * `capabilities.*`). Đồng/trang là SỐ NGUYÊN ≥ 0; tiệm không có năng lực nào (vd không in màu) thì cấu hình đó bị từ chối
 * khi khách đặt (`O2O_002`). Phải nằm trong `<Form>`.
 */
const PriceTableFields = memo(function PriceTableFields() {
  return (
    <>
      <FormSection description="Đồng mỗi trang, số nguyên." title="Bảng giá">
        <FormGrid cols={2}>
          {PRICE_FIELDS.map((f) => (
            <NumberField
              key={f.key}
              label={f.label}
              max={O2O_LIMITS.priceMax}
              min={0}
              name={`priceTable.${f.key}`}
              required
              step={100}
            />
          ))}
          <NumberField
            description="Phần trăm giảm khi in 2 mặt (0–100)."
            label="Giảm khi in 2 mặt (%)"
            max={100}
            min={0}
            name="priceTable.duplexDiscountPct"
            required
          />
          <NumberField
            description="Đơn nhỏ hơn mức này vẫn tính mức này."
            label="Đơn tối thiểu (đồng)"
            max={O2O_LIMITS.minOrderMax}
            min={0}
            name="priceTable.minOrder"
            required
            step={500}
          />
        </FormGrid>
      </FormSection>
      <FormSection title="Năng lực của tiệm">
        <FormGrid cols={2}>
          {CAPABILITY_KEYS.map((k) => (
            <ToggleField key={k} label={CAPABILITY_LABELS[k]} name={`capabilities.${k}`} />
          ))}
        </FormGrid>
      </FormSection>
    </>
  );
});

export default PriceTableFields;
