import { Link } from 'react-router-dom';

import type { TableColumn } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import type { LeaderboardEntry } from '../types/gamification.types';

/**
 * `/user` viết cứng CÓ CHỦ ĐÍCH — file này nằm trên nhánh `page.lazy` của `gamificationModule`; import `MODULE_PATHS`/`module-registry.ts`
 * sẽ khép vòng (`npm run check:cycles`), cùng lý do đã ghi ở `workspace-member-table.columns.tsx`. Khớp `user.routes.tsx` (`/user/:id`).
 */
const USER_MODULE_PATH = '/user';

/** Đích của tên người dùng — `/user/:id` chuyển về danh sách người dùng với ngăn kéo mở đúng người. `id` mã hoá để không chèn được `/`, `?`, `#`. */
export const leaderboardUserHref = (userId: string): string => `${USER_MODULE_PATH}/${encodeURIComponent(userId)}`;

/**
 * Cột bảng xếp hạng (admin.md p4-03 §2.4). Tên là `<Link>` sang người dùng khi có `user:view` (`canViewUser`); thiếu quyền → chữ thường
 * (không dẫn tới trang sẽ bị chặn).
 */
export function buildLeaderboardColumns(canViewUser: boolean): TableColumn<LeaderboardEntry>[] {
  return [
    {
      key: 'rank',
      header: 'Hạng',
      width: 80,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{r.rank}</span>,
    },
    {
      key: 'name',
      header: 'Người dùng',
      cell: (r) =>
        canViewUser ? (
          <Link className="truncate text-link hover:underline" to={leaderboardUserHref(r.userId)}>
            {r.name}
          </Link>
        ) : (
          <span className="truncate text-fg-1">{r.name}</span>
        ),
    },
    {
      key: 'level',
      header: 'Cấp',
      width: 100,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{r.level}</span>,
    },
    {
      key: 'xp',
      header: 'XP',
      width: 140,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{formatNumber(r.xp)}</span>,
    },
  ];
}
