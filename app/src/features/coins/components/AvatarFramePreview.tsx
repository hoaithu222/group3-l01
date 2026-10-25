import { View } from 'react-native';

import { useAuthStore } from '@/shell/store/slices/auth';
import { Avatar } from '@/shared/ui/avatar';

import type { FrameToken } from '../utils/shop-data';

/**
 * Xem trước KHUNG ảnh đại diện trên chính avatar của tôi (app.md p7-02 §3: "preview trên avatar của tôi"). Khung = viền màu (`color`, `width` từ `ShopItem.data`)
 * quanh `Avatar` — BE P0 chưa có ảnh khung (`assetId` luôn `null`, cần `AssetScope SHOP_ITEM`), nên khung là màu + độ dày do admin đặt.
 * Không có khung hợp lệ ⇒ chỉ avatar trần (vật phẩm hỏng dữ liệu vẫn xem được). Hình chỉ trang trí: nghĩa nằm ở tên/loại vật phẩm bên cạnh.
 *
 * ⚠️ Màu viền là DỮ LIỆU của vật phẩm (không phải màu giao diện) nên đi qua `style`, không qua token — đã lọc `#RRGGBB` ở `frameOf`.
 * ⚠️ Vòng viền và `Avatar` tách khe 2dp bằng `p-3xs`: viền dính sát ảnh thì màu khung loang vào mép ảnh, nhìn như ảnh bị nhuộm.
 */
export function AvatarFramePreview({ frame }: { frame: FrameToken | null }) {
  const user = useAuthStore((state) => state.user);

  return (
    <View
      accessibilityElementsHidden
      className="items-center justify-center rounded-full p-3xs"
      importantForAccessibility="no-hide-descendants"
      style={frame ? { borderColor: frame.color, borderWidth: frame.width } : undefined}
    >
      <Avatar
        name={user?.name}
        size="lg"
        source={user?.avatar ? { uri: user.avatar } : undefined}
      />
    </View>
  );
}
