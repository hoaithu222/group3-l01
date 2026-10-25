/**
 * DockItem — một ô trong Dock.
 *
 * ⛔ Dùng `<Link to>` chứ KHÔNG `<button onClick={navigate}>`: mục Dock ĐI TỚI
 *    TRANG nên phải là liên kết thật để chuột phải / Ctrl+click / chuột giữa mở
 *    được tab mới (`navigable-controls.md`).
 *
 * ⛔ Tooltip KHÔNG phải nguồn duy nhất của nhãn — trên máy chạm người dùng
 *    không bao giờ rê chuột được. `aria-label` luôn mang tên mục
 *    (`ipad-responsive.md §7`).
 *
 * Hai hiệu ứng nằm trên HAI phần tử khác nhau và đó là điều kiện để chúng không
 * đè nhau (xem `dock-magnify.css`):
 *    `<Link>` mang `DOCK_MAGNIFY_ITEM_CLASS`  → phóng lân cận
 *    `<span>` mang `DOCK_ENTER_CLASS`         → bay vào khi thanh vừa bung
 */
import { memo } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';

import { Badge, Tooltip } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { cn } from '@/shared/utils/style/cn';

import { DOCK_ENTER_CLASS, DOCK_MAGNIFY_ITEM_CLASS, dockStyles } from './dock.theme';
import type { DockItemConfig } from './dock-items.config';

/** Chấm số chỉ đủ chỗ cho 2 chữ số — từ đây trở lên hiện `99+`. */
const MAX_BADGE = 99;

interface DockItemProps {
  item: DockItemConfig;
  active?: boolean;
  /** Bật hiệu ứng phóng lân cận (chỉ có tác dụng khi có con trỏ thật). */
  magnify?: boolean;
  /**
   * Độ trễ (ms) của hiệu ứng bay vào — `Dock` tính theo khoảng cách tới tâm
   * thanh, nhờ vậy sóng icon lan từ giữa ra hai bên.
   */
  enterDelayMs?: number;
  /**
   * Gọi SAU khi người dùng chọn mục. Dùng để đóng thanh ở chế độ tự ẩn — kể cả
   * khi bấm đúng mục của TRANG ĐANG MỞ, lúc đó `pathname` không đổi nên không
   * có sự kiện điều hướng nào để dựa vào.
   */
  onSelect?: () => void;
}

const DockItem = memo(function DockItem({
  item,
  active = false,
  magnify = false,
  enterDelayMs = 0,
  onSelect,
}: DockItemProps) {
  // `softHover` là NGHỊCH ĐẢO của `magnify` — hai hiệu ứng loại trừ nhau, bật
  // cả hai là cú nảy cộng dồn (xem chú thích slot `item` trong `dock.theme.ts`).
  const s = dockStyles({ active, softHover: !magnify });
  const pending = item.badge && item.badge > 0 ? item.badge : 0;
  // Chấm số chỉ là hình — số việc chờ phải có trong tên đọc được của liên kết.
  const label = pending ? `${item.label}, ${item.badgeLabel ?? `${pending} mục đang chờ`}` : item.label;

  return (
    <Tooltip
      arrow={false}
      className={s.tooltip()}
      content={label}
      side="top"
      sideOffset={magnify ? 14 : 10}
    >
      <Link
        aria-current={active ? 'page' : undefined}
        aria-label={label}
        className={cn(s.item(), magnify && DOCK_MAGNIFY_ITEM_CLASS)}
        to={item.href}
        onClick={onSelect}
      >
        <span
          className={cn(s.glyph(), DOCK_ENTER_CLASS)}
          style={{ ['--dock-icon-delay' as string]: `${enterDelayMs}ms` } as CSSProperties}
        >
          <SystemIcon name={item.icon} size={22} />
        </span>
        {pending > 0 && (
          <Badge aria-hidden className={s.badge()} color="error" size="xs" variant="solid">
            {pending > MAX_BADGE ? `${MAX_BADGE}+` : pending}
          </Badge>
        )}
        {active && <span aria-hidden className={s.indicator()} />}
      </Link>
    </Tooltip>
  );
});

export default DockItem;
