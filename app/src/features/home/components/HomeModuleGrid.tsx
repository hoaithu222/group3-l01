import { Card } from '@/shared/ui/card';
import type { ModuleConfig } from '@/shell/navigation/types';

import { HOME_GRID_MAX_TILES } from '../constants/home-modules.constants';

import { HomeModuleTile } from './HomeModuleTile';

/**
 * Lưới phân hệ (tầng 2) — các phân hệ KHÔNG lên hero, bốn cột, tối đa `HOME_GRID_MAX_TILES` ô (hai dòng), trong MỘT thẻ.
 * Thay cho bản cũ chỉ liệt kê phân hệ PHỤ, một dòng bốn ô: nay lưới chứa cả phân hệ chính (thanh tab vẫn giữ nguyên),
 * và mỗi ô có tông màu riêng + số chưa đọc + nhấn giữ để ghim.
 *
 * Ô rộng `w-1/4` (phần trăm) trong `flex-row flex-wrap`, KHÔNG dùng `gap`/`justify-between`: khe cột trôi theo bề rộng
 * máy và dòng cuối thiếu ô thì bị dàn ra hai mép. Dòng cuối thiếu ô thì các ô dồn trái, đúng cột với dòng trên —
 * không cần ô trống giữ chỗ. `Card` mặc định có `gap-sm`, phải `gap-0` (gap áp cả hai chiều sẽ phá `w-1/4`).
 *
 * ⚠️ Quá `HOME_GRID_MAX_TILES` ô thì chỉ hiện các ô đầu (thứ tự khai báo); phần còn lại nằm ở tấm chọn phân hệ mà
 * `HomeModules` mở bằng "Tất cả (N)".
 */
export function HomeModuleGrid({
  badgeOf,
  canPin,
  modules,
  onOpen,
  onTogglePin,
}: {
  badgeOf: (module: ModuleConfig) => number | undefined;
  canPin: boolean;
  modules: ModuleConfig[];
  onOpen: (module: ModuleConfig) => void;
  onTogglePin: (module: ModuleConfig) => void;
}) {
  if (modules.length === 0) return null;

  return (
    <Card className="flex-row flex-wrap gap-0 p-xs" padded={false}>
      {modules.slice(0, HOME_GRID_MAX_TILES).map((module) => (
        <HomeModuleTile
          key={module.id}
          badge={badgeOf(module)}
          canPin={canPin}
          module={module}
          onOpen={onOpen}
          onTogglePin={onTogglePin}
        />
      ))}
    </Card>
  );
}
