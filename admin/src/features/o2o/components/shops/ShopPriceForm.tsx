import type { AxiosError } from 'axios';
import { memo, useState } from 'react';

import { extractErrorCode } from '@/core/api/error.handler';
import { Button, Callout, Form, FormActions, TextareaField, useZodForm } from '@/shared/ui';

import { O2O_LIMITS } from '../../constants/o2o.constants';
import { shopPriceFormSchema, type ShopPriceFormValues } from '../../schemas/shop.schema';
import { useUpdateShop } from '../../service/o2o-shops.queries';
import type { AdminShopDetail } from '../../types/o2o.types';
import { initShopPriceValues, toShopPriceUpdatePayload } from '../../utils/shop-form.utils';
import PriceTableView from '../shared/PriceTableView';
import PriceTableFields from './PriceTableFields';

export interface ShopPriceFormProps {
  shop: AdminShopDetail;
  /** `o2o:update` — thiếu thì chỉ đọc (bảng giá hiện dạng chữ, không có form). */
  canEdit: boolean;
  /** Tải lại bản mới nhất (sau 409 `RES_003`). */
  onReload: () => void;
}

/**
 * Tab "Bảng giá" của ngăn kéo tiệm (admin.md p6-05 §2.2): sửa bảng giá + năng lực kèm LÝ DO (vào nhật ký). Đơn ĐÃ GỬI giữ báo giá
 * cũ (snapshot — IR-15), chỉ đơn mới theo giá mới. Lưu gửi `expectedVersion`; 409 `RES_003` → banner "Dữ liệu đã thay đổi" và GIỮ
 * nguyên form. Không có `o2o:update` → chỉ xem bảng giá.
 */
const ShopPriceForm = memo(function ShopPriceForm({ shop, canEdit, onReload }: ShopPriceFormProps) {
  const form = useZodForm<ShopPriceFormValues>(shopPriceFormSchema, {
    defaultValues: initShopPriceValues(shop),
  });
  const update = useUpdateShop();
  const [conflict, setConflict] = useState(false);

  if (!canEdit)
    return <PriceTableView capabilities={shop.capabilities} priceTable={shop.priceTable} />;

  const handleSubmit = async (values: ShopPriceFormValues) => {
    setConflict(false);
    try {
      await update.mutateAsync(toShopPriceUpdatePayload(shop, values));
      form.reset({ ...values, reason: '' });
    } catch (err) {
      if (extractErrorCode(err as AxiosError) === 'RES_003') setConflict(true);
    }
  };

  return (
    <Form form={form} onSubmit={handleSubmit}>
      {conflict ? (
        <Callout
          action={
            <Button size="sm" variant="stroke" onClick={onReload}>
              Tải lại
            </Button>
          }
          description="Người khác vừa sửa tiệm này. Nội dung bạn nhập vẫn giữ nguyên — tải lại để so rồi lưu lại."
          intent="warning"
          title="Dữ liệu đã thay đổi"
        />
      ) : null}
      <Callout
        description="Đơn khách đã gửi giữ nguyên báo giá cũ; chỉ đơn mới tính theo bảng giá này."
        intent="info"
        variant="ghost"
      />
      <PriceTableFields />
      <TextareaField
        description="Vào nhật ký quản trị."
        label="Lý do đổi"
        maxLength={O2O_LIMITS.shopReasonMax}
        name="reason"
        required
        rows={2}
        showCount
      />
      <FormActions isSubmitting={form.formState.isSubmitting} submitLabel="Lưu bảng giá" />
    </Form>
  );
});

export default ShopPriceForm;
