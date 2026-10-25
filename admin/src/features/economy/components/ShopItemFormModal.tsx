import { memo } from 'react';

import {
  DateRangeField,
  FormModal,
  NumberField,
  SelectField,
  TextareaField,
  TextField,
  ToggleField,
  useZodForm,
} from '@/shared/ui';

import { COIN_LIMITS, SHOP_ITEM_KIND_OPTIONS } from '../constants/economy.constants';
import { shopItemFormSchema, type ShopItemFormValues } from '../schemas/shop-item.schema';
import { useCreateShopItem, useUpdateShopItem } from '../service/economy.mutations';
import type { AdminShopItem } from '../types/economy-catalog.types';
import { isVersionConflict } from '../utils/economy-errors';
import { applyServerErrors } from '../utils/form-errors.utils';
import {
  emptyItemValues,
  hasItemChanges,
  itemToValues,
  toCreateItemPayload,
  toUpdateItemPayload,
} from '../utils/shop-item-form.utils';
import ShopItemDataFields from './ShopItemDataFields';

export interface ShopItemFormModalProps {
  /** `null` = thêm mới; có giá trị = sửa (mã và loại khoá). */
  item: AdminShopItem | null;
  onClose: () => void;
}

/**
 * Form thêm/sửa vật phẩm (admin.md p7-02 §2.1) — `useZodForm` + `schemas/shop-item.schema.ts`. Nơi dùng CHỈ dựng modal khi đang mở (mount mới mỗi lần mở → form luôn sạch).
 * Sửa chỉ gửi trường ĐÃ ĐỔI kèm `expectedVersion`; chưa đổi gì thì khoá nút Lưu. `RES_003` (vật phẩm vừa bị sửa ở nơi khác) → đóng modal, danh sách tự tải lại
 * (interceptor đã báo "vui lòng tải lại"); lỗi trường của BE (trùng mã, `data`, khung bán) gắn vào đúng ô. Lý do (10–500) bắt buộc, vào nhật ký.
 */
const ShopItemFormModal = memo(function ShopItemFormModal({
  item,
  onClose,
}: ShopItemFormModalProps) {
  const form = useZodForm<ShopItemFormValues>(shopItemFormSchema, {
    defaultValues: item ? itemToValues(item) : emptyItemValues(),
  });
  const create = useCreateShopItem();
  const update = useUpdateShopItem();
  const kind = form.watch('kind');
  const unchanged = !!item && !hasItemChanges(item, form.watch());

  const handleConfirm = async (data?: ShopItemFormValues) => {
    if (!data) return;
    try {
      if (item) await update.mutateAsync(toUpdateItemPayload(item, data));
      else await create.mutateAsync(toCreateItemPayload(data));
    } catch (err) {
      if (isVersionConflict(err)) return;
      applyServerErrors(
        form,
        err,
        {
          code: 'code',
          name: 'name',
          price: 'price',
          reason: 'reason',
          data: kind === 'AVATAR_FRAME' ? 'color' : kind === 'PROFILE_THEME' ? 'primary' : 'emojis',
          availableFrom: 'availableRange',
          availableTo: 'availableRange',
        },
        item ? undefined : 'code',
      );
      throw err;
    }
  };

  return (
    <FormModal<ShopItemFormValues>
      confirmDisabled={unchanged}
      confirmLabel={item ? 'Lưu thay đổi' : 'Thêm vật phẩm'}
      form={form}
      open
      scrollable
      size="sm"
      title={item ? 'Sửa vật phẩm' : 'Thêm vật phẩm'}
      onConfirm={handleConfirm}
      onOpenChange={(open) => !open && onClose()}
    >
      <TextField
        description={
          item ? 'Mã không đổi được sau khi tạo.' : 'Chữ thường, số, dấu gạch ngang (2–40 ký tự).'
        }
        disabled={!!item}
        label="Mã"
        name="code"
        required
      />
      <TextField label="Tên vật phẩm" maxLength={COIN_LIMITS.shopNameMax} name="name" required />
      <SelectField
        description={item ? 'Loại không đổi được sau khi tạo.' : undefined}
        disabled={!!item}
        label="Loại"
        name="kind"
        options={SHOP_ITEM_KIND_OPTIONS}
        required
      />
      <ShopItemDataFields kind={kind} />
      <NumberField
        description={item ? 'Đổi giá chỉ áp cho lần mua sau.' : undefined}
        label="Giá (xu)"
        max={COIN_LIMITS.shopPriceMax}
        min={1}
        name="price"
        required
      />
      <DateRangeField
        description="Để trống = bán không giới hạn thời gian; ngày kết thúc tính đến hết ngày đó."
        label="Khung thời gian bán"
        name="availableRange"
      />
      <ToggleField label="Đang bán" name="isActive" />
      <TextareaField
        label="Lý do"
        maxLength={500}
        name="reason"
        placeholder="Ghi rõ lý do — sẽ lưu vào nhật ký quản trị"
        required
        rows={3}
        showCount
      />
    </FormModal>
  );
});

export default ShopItemFormModal;
