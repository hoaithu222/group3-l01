import { memo } from 'react';

import { ColorPickerField, NumberField, TextField } from '@/shared/ui';

import { COIN_LIMITS } from '../constants/economy.constants';
import type { ShopItemKind } from '../types/economy.types';

export interface ShopItemDataFieldsProps {
  kind: ShopItemKind;
}

/**
 * Ô nhập `ShopItem.data` THEO LOẠI (BE kiểm bằng `SHOP_ITEM_DATA_SCHEMAS`, `.strict()`): khung avatar = màu + độ dày viền 1–8; giao diện hồ sơ = màu chủ đạo + màu nhấn;
 * gói emoji = danh sách emoji. Chỉ giá trị hiển thị đơn giản — không URL, không HTML. Màu là dữ liệu người dùng chọn (ngoại lệ hợp lệ của luật cấm hex).
 */
const ShopItemDataFields = memo(function ShopItemDataFields({ kind }: ShopItemDataFieldsProps) {
  if (kind === 'AVATAR_FRAME') {
    return (
      <>
        <ColorPickerField label="Màu viền" name="color" required />
        <NumberField label="Độ dày viền (px)" max={8} min={1} name="width" required />
      </>
    );
  }
  if (kind === 'PROFILE_THEME') {
    return (
      <>
        <ColorPickerField label="Màu chủ đạo" name="primary" required />
        <ColorPickerField label="Màu nhấn" name="accent" required />
      </>
    );
  }
  return (
    <TextField
      description={`Cách nhau bằng dấu cách hoặc dấu phẩy, tối đa ${COIN_LIMITS.emojiPackMax} emoji.`}
      label="Danh sách emoji"
      name="emojis"
      required
    />
  );
});

export default ShopItemDataFields;
