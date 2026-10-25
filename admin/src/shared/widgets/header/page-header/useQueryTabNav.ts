/**
 * useQueryTabNav — dựng `nav` cho `<PageHeader>` từ dải tab URL-synced (`?tab=`) của trang.
 *
 * Thay cho hàng `<Tabs>` đầu vùng nội dung: tab của module lên THANH HEADER thành chip hai
 * bên bảng tên (bố cục của dự án gốc `vci-sun-pms-fe`), trả lại cả một hàng cho nội dung.
 *
 *   const nav = useQueryTabNav({ options, active, onSelect: handleTabChange, resetKeys: TAB_SCOPED_KEYS });
 *   <PageHeader nav={nav} title="Tuyển dụng" tone="pink" />
 *
 * Hook chỉ làm ĐÚNG MỘT việc: gắn `href` THẬT cho từng chip (`navigable-controls.md`) để
 * chuột phải / Ctrl+click / chuột giữa mở được tab đó ở thẻ mới. Danh sách tab, cách lọc
 * cờ/quyền, tab đang mở và handler đổi tab vẫn do TRANG quyết định như cũ.
 *
 * ⛔ `resetKeys` PHẢI khớp đúng những khoá mà `onSelect` xoá khi đổi tab. `href` là URL mà
 *    cú bấm THƯỜNG dựng ra; lệch nhau thì "mở thẻ mới" mang bộ lọc của tab cũ sang tab mới —
 *    đúng thứ `onSelect` đã cố tình dọn.
 *
 * ⛔ `resetKeys` / `shortLabels` phải là HẰNG cấp module (hoặc đã `useMemo`). Dựng mảng mới
 *    mỗi render là `nav` đổi identity liên tục và `<PageHeader>` (memo) render lại vô ích.
 */
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { useNavHref } from '@/shared/hooks';

import type { PageHeaderNavConfig } from './PageHeaderNav';

/** Một tab của trang — cùng hình dạng `options` mà kit2 `<Tabs>` nhận. */
export interface QueryTabOption {
  key: string;
  label: string;
}

export interface UseQueryTabNavOptions {
  /** Tab ĐƯỢC HIỆN (đã lọc cờ tính năng / quyền), đúng thứ tự hiển thị. */
  options: readonly QueryTabOption[];
  /** `key` của tab đang mở. `undefined` → không dựng nav (header chỉ còn bảng tên). */
  active: string | undefined;
  /** Handler đổi tab CỦA TRANG — chạy khi bấm chip bằng chuột trái thường. */
  onSelect: (key: string) => void;
  /**
   * Khoá URL mà `onSelect` xoá khi đổi tab. `'all'` = xoá MỌI khoá khác, chỉ giữ khoá tab.
   * Bỏ trống = giữ nguyên mọi khoá (đúng ngữ nghĩa `useQueryParams().setTab`).
   */
  resetKeys?: readonly string[] | 'all';
  /** Nhãn rút gọn theo `key` cho màn < 1024px / máy chạm — xem `PageHeaderNavItem.shortLabel`. */
  shortLabels?: Readonly<Partial<Record<string, string>>>;
  /** Số tab tối thiểu để hiện dải chip — mặc định 1. Đặt 2 cho trang KHÔNG vẽ dải khi chỉ có một tab. */
  minItems?: number;
  /** Tên khoá tab trên URL — mặc định `tab`. */
  tabKey?: string;
}

export function useQueryTabNav({
  options,
  active,
  onSelect,
  resetKeys,
  shortLabels,
  minItems = 1,
  tabKey = 'tab',
}: UseQueryTabNavOptions): PageHeaderNavConfig | undefined {
  const buildHref = useNavHref();
  const { pathname } = useLocation();

  return useMemo(() => {
    if (!active || options.length < minItems) return undefined;

    const hrefFor = (key: string) => {
      if (resetKeys === 'all') {
        return `${pathname}?${new URLSearchParams({ [tabKey]: key }).toString()}`;
      }
      const cleared = Object.fromEntries((resetKeys ?? []).map((k) => [k, null]));
      return buildHref({ ...cleared, [tabKey]: key });
    };

    return {
      items: options.map((o) => ({
        key: o.key,
        label: o.label,
        shortLabel: shortLabels?.[o.key],
        href: hrefFor(o.key),
      })),
      active,
      onSelect,
    };
  }, [active, buildHref, minItems, onSelect, options, pathname, resetKeys, shortLabels, tabKey]);
}
