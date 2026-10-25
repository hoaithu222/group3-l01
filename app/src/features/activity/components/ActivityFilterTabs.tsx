import { Tabs } from '@/shared/ui/tab';
import { hapticSelection } from '@/shared/utils/haptics';
import type { InboxFilter } from '@/core/notifications';

/** Ba tab của p1-07 `app.md` §3. `calls`/`meetings` thuộc Phase 2 nên chưa có tab. */
export type ActivityTab = Extract<InboxFilter, 'all' | 'following' | 'mentions'>;

const ITEMS: { key: ActivityTab; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'mentions', label: 'Nhắc đến bạn' },
  { key: 'following', label: 'Đang theo dõi' },
];

export interface ActivityFilterTabsProps {
  /** Lớp cho khung ngoài của hàng tab (`ScrollView` khi cuộn ngang) — lề/khe do màn quyết. */
  className?: string;
  onChange: (tab: ActivityTab) => void;
  value: ActivityTab;
}

export function ActivityFilterTabs({ className, onChange, value }: ActivityFilterTabsProps) {
  return (
    <Tabs
      className={className}
      items={ITEMS}
      scrollable
      value={value}
      variant="underline"
      // Rung "đổi lựa chọn" khi chuyển tab lọc (không rung khi chạm lại tab đang mở).
      onChange={(key) => {
        if (key !== value) hapticSelection();
        onChange(key as ActivityTab);
      }}
    />
  );
}
