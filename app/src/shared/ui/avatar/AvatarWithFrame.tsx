import { View } from 'react-native';

import { Avatar, type AvatarProps } from './Avatar';

/**
 * Khung ảnh đại diện — viền màu quanh `Avatar` (vật phẩm hồ sơ `AVATAR_FRAME` mua ở chợ xu, p7-02). BE P0/P1 CHƯA có ảnh khung thật (`ShopItem.assetId`
 * luôn `null`, cần `AssetScope SHOP_ITEM`), nên khung là màu + độ dày admin đặt trong `ShopItem.data` — dùng `parseAvatarFrameToken` để đọc AN TOÀN từ
 * JSON tự do đó rồi truyền vào đây; component KHÔNG biết gì về "vật phẩm"/"chợ" (đặt ở `shared/ui` nên không import `features/coins`).
 */
export interface AvatarFrameToken {
  /** `#RRGGBB`. */
  color: string;
  /** Độ dày viền (dp), 1–8. */
  width: number;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Đọc token khung từ `data` của một vật phẩm `AVATAR_FRAME` (`{ color, width }`) — thiếu/sai màu ⇒ `null` (không vẽ khung, vẫn xem avatar trần được).
 * Dùng ở MỌI nơi hiện avatar hồ sơ (chi tiết listing chợ, hồ sơ công khai…) — xem `AvatarWithFrame`.
 */
export function parseAvatarFrameToken(data: Record<string, unknown> | null | undefined): AvatarFrameToken | null {
  if (!isRecord(data)) return null;
  const color = typeof data.color === 'string' && HEX_COLOR.test(data.color) ? data.color : null;
  if (!color) return null;
  const rawWidth = typeof data.width === 'number' && Number.isFinite(data.width) ? data.width : 3;
  return { color, width: Math.min(8, Math.max(1, Math.round(rawWidth))) };
}

export interface AvatarWithFrameProps extends AvatarProps {
  /** `null`/`undefined` ⇒ avatar trần (không vẽ viền) — hành vi giống `Avatar` thường. */
  frame?: AvatarFrameToken | null;
}

/**
 * `Avatar` có thể bọc khung màu đang trang bị. Viền và ảnh tách khe 2dp (`p-3xs`): viền dính sát ảnh thì màu khung loang vào mép, nhìn như ảnh bị nhuộm.
 * Khung là DỮ LIỆU vật phẩm (không phải token giao diện) nên đi qua `style`, không qua class màu — `parseAvatarFrameToken` đã lọc `#RRGGBB` hợp lệ.
 *
 * ⚠️ KHÔNG ẩn khỏi cây accessibility như bản xem trước riêng của cửa hàng (`features/coins` `AvatarFramePreview`, nơi avatar chỉ là hình minh hoạ cạnh
 * tên vật phẩm) — ở đây avatar thường là danh tính chính của người dùng (hồ sơ công khai, người bán trên chợ…) nên vẫn phải đọc được tên qua `Avatar`.
 */
export function AvatarWithFrame({ frame, ...avatarProps }: AvatarWithFrameProps) {
  if (!frame) return <Avatar {...avatarProps} />;
  return (
    <View
      className="items-center justify-center rounded-full p-3xs"
      style={{ borderColor: frame.color, borderWidth: frame.width }}
    >
      <Avatar {...avatarProps} />
    </View>
  );
}
