import { IconTile, type IconTileSize } from '@/shared/ui/icon-tile';

import { moduleTone } from './module-tone';
import type { ModuleConfig } from './types';

/**
 * Ô biểu tượng của một phân hệ — `IconTile` chung, tông màu theo phân hệ (`moduleTone`). Dùng chung cho danh sách chọn
 * phân hệ (`ModulePickerSheet`) và Trang chủ (thẻ hero, lưới), để các nơi không lệch nhau ở lần đổi token.
 *
 * ⛔ Không tự dựng ô vuông + cặp màu riêng ở đây: cặp `surface-*` + màu ngữ nghĩa của `IconTile` đã đo tương phản ở cả
 * hai chế độ; cặp tự chọn là thứ đầu tiên hỏng ở chế độ tối.
 *
 * Ô này TRANG TRÍ (icon không nhãn bị ẩn khỏi trình đọc màn hình): tên phân hệ nằm ở chữ đứng cạnh / nhãn của nút bọc ngoài.
 */
export function ModuleIconTile({
  module,
  size = 'md',
}: {
  module: Pick<ModuleConfig, 'icon' | 'id'>;
  size?: IconTileSize;
}) {
  return <IconTile name={module.icon} size={size} tone={moduleTone(module.id)} />;
}
