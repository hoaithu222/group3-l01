/**
 * PageHeaderNav — dải chip tab + action của page, ôm sát MỘT BÊN bảng tên.
 *
 * `PageHeader` chia đôi `nav.items` rồi dựng HAI dải: dải bên trái nghiêng
 * `start`, dải bên phải nghiêng `end` — cả cụm chĩa về phía tiêu đề trung tâm.
 *
 * HÌNH KHỐI (clip-path bình hành + `edge`/`face` + quầng sáng) nằm ở
 * `ChipSurface` trong `PageHeaderChip`, dùng chung NGUYÊN VĂN cho nút back /
 * action / tab. File này chỉ lo LOGIC nav — đừng dựng lại clip-path ở đây.
 *
 * ⛔ Tab PHẢI có `href` THẬT khi state tab nằm trên URL (`?tab=…` hoặc route
 *    riêng) — chỉ khi đó chuột phải / Ctrl+click mới mở được tab mới
 *    (`navigable-controls.md`). Tab sống trong `useState`/store thì KHÔNG có URL
 *    để mở tab mới ⇒ đó đã là vi phạm `api-patterns.md §URL-synced Filters`, hãy
 *    đẩy state lên URL chứ đừng bịa một href (`navigable-controls.md §6`).
 *
 * ⛔ Chật chỗ thì CUỘN, không ẩn (`ipad-responsive.md §4`). Việc cuộn + vệt mờ
 *    mép cuối do ô cha lo (`pageHeaderStyles.navCell` / `headerStyles.pageSlot`).
 */
import { memo, useCallback } from 'react';

import type { SystemIconName } from '@/shared/ui';

import { pageNavStyles } from './page-header.theme';
import PageHeaderChip from './PageHeaderChip';
import type { PageHeaderChipSide } from './PageHeaderChip';

/** ⛔ CHIP TAB CHỈ CÓ CHỮ — KHÔNG icon (đồng bộ bảng tên). Đừng thêm field `icon`. */
export interface PageHeaderNavItem {
  key: string;
  label: string;
  /**
   * Nhãn RÚT GỌN cho máy tính bảng (và mọi màn < 1024px). Bỏ trống → chip dùng
   * `label` ở mọi bề rộng, PC không đổi một pixel nào.
   *
   * ⛔ ĐIỀN CHO MỌI TAB CÓ NHÃN DÀI (> ~12 ký tự). Chip tab là `shrink-0
   *    whitespace-nowrap` nên KHÔNG co được: nhãn dài đẩy cụm tâm phình ra, mà
   *    trên iPad hai cụm mép cũng phình theo vùng chạm ⇒ ba cụm hết biên.
   * ⛔ KHÔNG rút xuống icon-only: tab là ĐIỀU HƯỚNG chính của module, mất chữ là
   *    người dùng không đọc được mình đang ở tab nào.
   */
  shortLabel?: string;
  /** URL thật của tab — xem docblock đầu file. */
  href?: string;
}

/**
 * Action ghim NGAY SAU chip tab cuối cùng (vd "Cài đặt" của module).
 *
 * Khác `PageHeaderNavItem`: đây KHÔNG phải tab — bấm vào chạy lệnh chứ không đổi
 * `active`, và nó KHÔNG BAO GIỜ sáng lên trạng thái bật.
 *
 * ⛔ HÌNH KHỐI DÙNG CHUNG với chip tab: cùng clip-path bình hành, cùng chiều
 *    cao, cùng thang chữ. Thứ phân biệt action với tab là ICON dẫn.
 */
export interface PageHeaderNavAction {
  key: string;
  label: string;
  icon: SystemIconName;
  href?: string;
  newTab?: boolean;
  onSelect: () => void;
}

export interface PageHeaderNavConfig {
  /**
   * `readonly` — widget CHỈ ĐỌC danh sách này. Khai readonly để call-site dựng
   * bảng tab bằng `as const` là truyền thẳng vào được.
   */
  items: readonly PageHeaderNavItem[];
  /** `key` của mục đang mở. */
  active: string;
  onSelect: (key: string) => void;
  /** Action phụ đứng sau chip cuối. Bỏ trống → không render gì. */
  actions?: readonly PageHeaderNavAction[];
  /**
   * Số chip ghim ở cụm TRÁI bảng tên. Bỏ trống → chia đôi danh sách. Dùng khi
   * một nhóm tab phải đứng liền nhau bên trái.
   */
  splitAt?: number;
  /**
   * Khoá CẢ CỤM — dùng khi lý do khoá là CHUNG cho mọi chip.
   *
   * ⛔ PHẢI khoá ở ĐÂY, đừng chỉ `return` sớm trong `onSelect`: chặn trong
   *    handler thì chip vẫn sáng như thường và bấm vào KHÔNG có phản hồi gì —
   *    user đọc ra như app treo.
   */
  disabled?: boolean;
}

interface PageHeaderNavProps extends PageHeaderNavConfig {
  /** `start` = dải bên TRÁI bảng tên · `end` = dải bên PHẢI. */
  side: PageHeaderChipSide;
}

const s = pageNavStyles();

/**
 * Local sub-component memoized — KHÔNG export (ngoại lệ §1 của
 * `clean-code-standards.md`, mẫu ghi trong `widget-composition.md §3`).
 * Cần vì mỗi chip có `useCallback` riêng.
 */
const NavChip = memo(function NavChip({
  item,
  active,
  side,
  disabled,
  onSelect,
}: {
  item: PageHeaderNavItem;
  active: boolean;
  side: PageHeaderChipSide;
  disabled?: boolean;
  onSelect: (key: string) => void;
}) {
  const handleSelect = useCallback(() => onSelect(item.key), [item.key, onSelect]);

  return (
    <PageHeaderChip
      active={active}
      // Tab là ĐƯỜNG ĐI giữa các màn ⇒ chip đang mở mang `aria-current="page"`.
      // Chip toggle thì dùng `pressed`, đừng trộn hai ngữ nghĩa vào một prop.
      current={active}
      disabled={disabled}
      href={item.href}
      label={item.label}
      shortLabel={item.shortLabel}
      side={side}
      onSelect={handleSelect}
    />
  );
});

function PageHeaderNav({ items, active, side, onSelect, actions, disabled }: PageHeaderNavProps) {
  if (items.length === 0 && !actions?.length) return null;

  return (
    // `data-header-chip` — CỜ CHO Ô CHA, không phải style của chip: ô cha
    // (`pageHeaderStyles.cluster` · `headerStyles.pageSlot`) bắt cờ này để đẩy
    // cả dải xuống sát mép dưới thanh, còn nội dung thường thì giữ canh giữa.
    <span className={s.root()} data-header-chip>
      {items.map((item) => (
        <NavChip
          key={item.key}
          active={item.key === active}
          disabled={disabled}
          item={item}
          side={side}
          onSelect={onSelect}
        />
      ))}
      {/* ⛔ Action rút xuống ICON-ONLY, tab thì KHÔNG. Tab là ĐƯỜNG ĐI giữa các
          màn — bỏ chữ là người dùng phải đoán. Action là lệnh phụ (Cài đặt,
          Xuất…), icon + tooltip đủ nhận ra — đúng bậc 2 của thang rút gọn trong
          `ipad-responsive.md §4`. `tooltip` giữ tên gọi cho trình đọc màn hình
          và cho thao tác chạm-giữ.
          ⛔ KHÔNG truyền `active` cho action: nó không phải tab, sáng lên là
          user đọc ra như đang đứng ở một tab vô hình. */}
      {actions?.map((action) => (
        <PageHeaderChip
          key={action.key}
          disabled={disabled}
          href={action.href}
          icon={action.icon}
          newTab={action.newTab}
          side={side}
          tooltip={action.label}
          onSelect={action.onSelect}
        />
      ))}
    </span>
  );
}

export default memo(PageHeaderNav);
