import type { DefaultValues } from 'react-hook-form';

import { DEFAULT_ITEM_COLORS } from '../constants/economy.constants';
import type { ShopItemFormValues } from '../schemas/shop-item.schema';
import type {
  AdminShopItem,
  CreateShopItemPayload,
  UpdateShopItemPayload,
} from '../types/economy-catalog.types';
import { dayToEndIso, dayToStartIso, isoToDay, parseEmojis } from './shop-item-data.utils';

/** Trường `data` ĐANG áp dụng theo loại — khớp `SHOP_ITEM_DATA_SCHEMAS` BE (`.strict()`: không gửi khoá thừa). */
function buildItemData(v: ShopItemFormValues): Record<string, unknown> {
  if (v.kind === 'AVATAR_FRAME') return { color: v.color, width: v.width };
  if (v.kind === 'PROFILE_THEME') return { primary: v.primary, accent: v.accent };
  return { emojis: parseEmojis(v.emojis) };
}

export function emptyItemValues(): DefaultValues<ShopItemFormValues> {
  return {
    code: '',
    name: '',
    kind: 'AVATAR_FRAME',
    price: undefined,
    color: DEFAULT_ITEM_COLORS.frame,
    width: 3,
    primary: DEFAULT_ITEM_COLORS.primary,
    accent: DEFAULT_ITEM_COLORS.accent,
    emojis: '',
    availableRange: { from: null, to: null },
    isActive: true,
    reason: '',
  };
}

const str = (data: Record<string, unknown> | null, key: string, fallback: string): string => {
  const value = data?.[key];
  return typeof value === 'string' ? value : fallback;
};

/** Giá trị form từ vật phẩm đã lưu (sửa) — chuẩn hoá về cùng dạng với form để so "có thay đổi chưa". */
export function itemToValues(item: AdminShopItem): ShopItemFormValues {
  const width = item.data?.width;
  const rawEmojis: unknown = item.data?.emojis;
  const emojis = Array.isArray(rawEmojis)
    ? (rawEmojis as unknown[]).filter((e): e is string => typeof e === 'string')
    : [];
  return {
    code: item.code,
    name: item.name,
    kind: item.kind,
    price: item.price,
    color: str(item.data, 'color', DEFAULT_ITEM_COLORS.frame),
    width: typeof width === 'number' ? width : 3,
    primary: str(item.data, 'primary', DEFAULT_ITEM_COLORS.primary),
    accent: str(item.data, 'accent', DEFAULT_ITEM_COLORS.accent),
    emojis: emojis.join(' '),
    availableRange: { from: isoToDay(item.availableFrom), to: isoToDay(item.availableTo) },
    isActive: item.isActive,
    reason: '',
  };
}

const dataKey = (v: ShopItemFormValues): string => JSON.stringify(buildItemData(v));
const rangeChanged = (a: ShopItemFormValues, b: ShopItemFormValues): boolean =>
  a.availableRange.from !== b.availableRange.from || a.availableRange.to !== b.availableRange.to;

/** Đã đổi trường nào ngoài lý do chưa — chặn gửi bản sửa rỗng (chỉ tốn một dòng nhật ký + một `version`). */
export function hasItemChanges(item: AdminShopItem, v: ShopItemFormValues): boolean {
  const before = itemToValues(item);
  return (
    v.name.trim() !== before.name ||
    v.price !== before.price ||
    v.isActive !== before.isActive ||
    rangeChanged(before, v) ||
    dataKey(before) !== dataKey(v)
  );
}

export function toCreateItemPayload(v: ShopItemFormValues): CreateShopItemPayload {
  const { from, to } = v.availableRange;
  return {
    code: v.code,
    name: v.name,
    kind: v.kind,
    price: v.price,
    data: buildItemData(v),
    isActive: v.isActive,
    availableFrom: from ? dayToStartIso(from) : null,
    availableTo: to ? dayToEndIso(to) : null,
    reason: v.reason,
  };
}

/** Chỉ gửi trường ĐÃ ĐỔI (BE: `code`/`kind` không đổi được; đổi giá chỉ áp cho lần mua sau). Khung bán gửi cả cặp để BE kiểm `from < to`. */
export function toUpdateItemPayload(
  item: AdminShopItem,
  v: ShopItemFormValues,
): UpdateShopItemPayload {
  const before = itemToValues(item);
  const { from, to } = v.availableRange;
  return {
    id: item.id,
    expectedVersion: item.version,
    reason: v.reason,
    ...(v.name !== before.name && { name: v.name }),
    ...(v.price !== before.price && { price: v.price }),
    ...(v.isActive !== before.isActive && { isActive: v.isActive }),
    ...(dataKey(before) !== dataKey(v) && { data: buildItemData(v) }),
    ...(rangeChanged(before, v) && {
      availableFrom: from ? dayToStartIso(from) : null,
      availableTo: to ? dayToEndIso(to) : null,
    }),
  };
}
