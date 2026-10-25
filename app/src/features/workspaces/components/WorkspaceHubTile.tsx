import { Text } from 'react-native';

import { BadgeAnchor } from '@/shared/ui/badge';
import { CountBadge } from '@/shared/ui/count-badge';
import { IconTile } from '@/shared/ui/icon-tile';
import { PressableScale } from '@/shared/ui/motion';
import { cn } from '@/shared/utils/style/cn';

import type { WorkspaceHubEntry } from '../hooks/useWorkspaceHubEntries';
import { hubEntryA11yLabel } from '../utils/workspace-hub-layout';

/** Ô nhỏ (~68–90dp) co mạnh hơn mặc định 0.97 mới thấy được dưới ngón tay — cùng số với ô phân hệ của Trang chủ. */
const TILE_SCALE = 0.94;

export interface WorkspaceHubTileProps {
  entry: WorkspaceHubEntry;
  /** Lớp BỀ RỘNG ô trong hàng `flex-wrap` (`w-1/4`…) — `WorkspaceHubCard` chọn theo số ô. */
  widthClassName: string;
}

/**
 * Một ô của lưới "Lối vào nhanh": ô icon tông theo PHÂN HỆ (`entry.tone`) + tên tối đa hai dòng, căn giữa — cùng khuôn ô phân
 * hệ của Trang chủ (`HomeModuleTile`), ⛔ không import chéo feature nên dựng lại bằng chính các mảnh của bộ chung.
 *
 * · Số chưa đọc (chỉ "Kênh" có) cưỡi lên góc ô icon (`BadgeAnchor` + `CountBadge`, `self-center` để đè `self-start` mặc định
 *   — không thì icon dạt trái ô).
 * · Mô tả KHÔNG in ra (ô chật) mà đi vào nhãn trợ năng (`hubEntryA11yLabel`), cùng câu với dòng danh sách.
 * · `fill`: khối nhìn thấy cao bằng ô ⇒ ô tên một dòng cao bằng ô tên hai dòng cùng hàng, vệt nhấn `bg-2` phủ đều; vùng chạm
 *   là cả ô (≥ 64dp cao, ≥ 68dp rộng ở máy 320dp).
 */
export function WorkspaceHubTile({ entry, widthClassName }: WorkspaceHubTileProps) {
  const unread = entry.badge !== undefined && entry.badge > 0 ? entry.badge : 0;

  return (
    <PressableScale
      accessibilityLabel={hubEntryA11yLabel(entry)}
      accessibilityRole="button"
      className={widthClassName}
      contentClassName={({ pressed }) =>
        cn('min-h-16 items-center gap-2xs rounded-sm px-3xs py-xs', pressed && 'bg-bg-2')
      }
      fill
      scaleTo={TILE_SCALE}
      onPress={entry.onPress}
    >
      <BadgeAnchor
        badge={unread > 0 ? <CountBadge count={unread} size="sm" /> : undefined}
        className="self-center"
      >
        <IconTile name={entry.icon} tone={entry.tone} />
      </BadgeAnchor>
      <Text className="text-center text-caption-lg text-fg-1" numberOfLines={2}>
        {entry.label}
      </Text>
    </PressableScale>
  );
}
