import { Tabs } from '@/shared/ui/tab';
import { hapticSelection } from '@/shared/utils/haptics';

import type { WorkspaceSearchType } from '../api';
import type { SearchTabDef } from '../constants/workspace-search.constants';
import { tabAccessibilityLabel, tabLabel, type TabCounts } from '../utils/tab-counts';

export interface SearchTabsProps {
  /** Số kết quả ĐÃ BIẾT theo tab (từ cache) — tab chưa mở thì chưa có số. */
  counts: TabCounts;
  /** Đã lọc theo vai trò: khách không có tab "Người". */
  tabs: readonly SearchTabDef[];
  value: WorkspaceSearchType;
  onChange: (type: WorkspaceSearchType) => void;
}

/**
 * Hàng tab loại kết quả (app.md p5-04 §2): Tin nhắn · Tệp · Kênh · Người · Cuộc họp. Số đếm nằm ngay trong nhãn ("Tin nhắn 12",
 * "Tin nhắn 30+" khi còn trang sau — BE không đếm chính xác). Trình đọc màn hình nghe "Tin nhắn, có kết quả" / "không có kết
 * quả" thay vì chỉ nghe con số. Cuộn ngang vì năm nhãn tiếng Việt kèm số không vừa máy 360dp nếu chia đều.
 */
export function SearchTabs({ counts, tabs, value, onChange }: SearchTabsProps) {
  const items = tabs.map((tab) => ({
    accessibilityLabel: tabAccessibilityLabel(tab.label, counts[tab.key]),
    key: tab.key,
    label: tabLabel(tab.label, counts[tab.key]),
  }));

  return (
    <Tabs
      className="px-md"
      items={items}
      scrollable
      value={value}
      variant="underline"
      onChange={(key) => {
        if (key !== value) hapticSelection(); // đổi tab = đổi lựa chọn trong nhóm
        onChange(key as WorkspaceSearchType);
      }}
    />
  );
}
