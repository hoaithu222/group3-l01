import type { AxiosError } from 'axios';
import { memo, useMemo } from 'react';

import { extractErrorCode } from '@/core/api/error.handler';
import {
  Callout,
  EmailField,
  FormGrid,
  FormModal,
  SelectField,
  TextField,
  useZodForm,
} from '@/shared/ui';

import { O2O_LIMITS, SHOP_LOCATION_QUERY } from '../../constants/o2o.constants';
import { shopCreateFormSchema, type ShopCreateFormValues } from '../../schemas/shop.schema';
import { useAdminLocations } from '../../service/o2o-locations.queries';
import { useCreateShop } from '../../service/o2o-shops.queries';
import { initShopCreateValues, toCreateShopPayload } from '../../utils/shop-form.utils';
import PriceTableFields from './PriceTableFields';

export interface ShopFormModalProps {
  onClose: () => void;
}

/**
 * Form tạo tiệm in (admin.md p6-05 §2.2). Địa điểm chọn trong các địa điểm loại "Tiệm in" CHƯA có tiệm (lọc từ danh sách địa
 * điểm — BE cũng chặn `O2O_013`); chủ tiệm nhập EMAIL (BE tra tài khoản đang hoạt động — không có → `O2O_009`, gắn thẳng vào ô
 * email). Tiệm mới ở trạng thái CHỜ DUYỆT — chưa nhận đơn tới khi duyệt. Nơi gọi chỉ mount khi mở nên `defaultValues` luôn mới.
 */
const ShopFormModal = memo(function ShopFormModal({ onClose }: ShopFormModalProps) {
  const form = useZodForm<ShopCreateFormValues>(shopCreateFormSchema, {
    defaultValues: initShopCreateValues(),
  });
  const create = useCreateShop();
  const { data, isError } = useAdminLocations(SHOP_LOCATION_QUERY);
  const options = useMemo(
    () =>
      (data?.data ?? [])
        .filter((l) => !l.shop)
        .map((l) => ({ value: l.id, label: `${l.name} — ${l.address}` })),
    [data],
  );

  const handleConfirm = async (values?: ShopCreateFormValues) => {
    if (!values) return;
    try {
      await create.mutateAsync(toCreateShopPayload(values));
      // Thành công: FormModal tự gọi onOpenChange(false) → onClose.
    } catch (err) {
      const code = extractErrorCode(err as AxiosError);
      if (code === 'O2O_009') {
        form.setError('ownerEmail', {
          type: 'server',
          message: 'Không tìm thấy tài khoản với email này',
        });
      } else if (code === 'O2O_013') {
        form.setError('locationId', {
          type: 'server',
          message: 'Địa điểm đã có tiệm in hoặc không phải loại "Tiệm in"',
        });
      }
      throw err; // FormModal giữ modal mở để sửa và gửi lại
    }
  };

  return (
    <FormModal<ShopCreateFormValues>
      confirmLabel="Tạo tiệm in"
      form={form}
      open
      scrollable
      size="lg"
      title="Thêm tiệm in"
      onConfirm={handleConfirm}
      onOpenChange={(next) => !next && onClose()}
    >
      {isError ? (
        <Callout
          description="Không tải được danh sách địa điểm — đóng form rồi mở lại."
          intent="error"
          title="Không chọn được địa điểm"
        />
      ) : null}
      <SelectField
        description={
          options.length === 0
            ? 'Chưa có địa điểm loại "Tiệm in" nào chưa gắn tiệm — tạo địa điểm ở tab "Địa điểm" trước.'
            : 'Chỉ hiện địa điểm loại "Tiệm in" chưa có tiệm.'
        }
        label="Địa điểm"
        name="locationId"
        options={options}
        required
        searchable
      />
      <FormGrid cols={2}>
        <EmailField
          description="Tài khoản phải đang hoạt động; chủ tiệm có quyền vào cổng sau khi tiệm được duyệt."
          label="Email chủ tiệm"
          name="ownerEmail"
          required
        />
        <TextField
          label="Tên hiển thị"
          maxLength={O2O_LIMITS.nameMax}
          name="displayName"
          required
        />
      </FormGrid>
      <TextField
        description="Tuỳ chọn. Số di động Việt Nam hoặc dạng quốc tế (+84…)."
        label="Số điện thoại"
        name="phone"
      />
      <PriceTableFields />
    </FormModal>
  );
});

export default ShopFormModal;
