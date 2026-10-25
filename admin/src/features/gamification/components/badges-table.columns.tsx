import { Link } from 'react-router-dom';

import { Button } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { isModifiedClick } from '@/shared/utils/browser/link.utils';
import { formatNumber } from '@/shared/utils/format';

import { BADGE_RARITY_LABELS } from '../constants/gamification.labels';
import type { AdminBadge } from '../types/gamification.types';
import { summarizeCriteria } from '../utils/badge-form.utils';
import BadgeIcon from './BadgeIcon';

export interface BadgeRowActions {
  /** Có `gamification:update` — hiện Sửa / Tắt·Bật / Cấp bù. */
  canUpdate: boolean;
  /** URL THẬT mở ngăn kéo chi tiết của huy hiệu (giữ nguyên `?tab`/`?q`/`?page`) — chuột phải/Ctrl+click mở tab mới được. */
  hrefFor: (badge: AdminBadge) => string;
  /** Click TRÁI thường → mở ngăn kéo tại chỗ (không điều hướng cả trang). */
  onOpen: (badge: AdminBadge) => void;
  onEdit: (badge: AdminBadge) => void;
  onToggle: (badge: AdminBadge) => void;
  onBackfill: (badge: AdminBadge) => void;
}

/**
 * Cột bảng tab "Huy hiệu" (admin.md p4-03 §2.2). Tên huy hiệu là `<Link>` tới ngăn kéo chi tiết (kèm nhật ký) —
 * `docs/rules/navigable-controls.md`: điều hướng có URL đích phải là liên kết thật, không phải nút + `navigate()`.
 */
export function buildBadgeColumns({
  canUpdate,
  hrefFor,
  onOpen,
  onEdit,
  onToggle,
  onBackfill,
}: BadgeRowActions): TableColumn<AdminBadge>[] {
  return [
    {
      key: 'icon',
      header: '',
      width: 56,
      cell: (b) => <BadgeIcon emoji={b.emoji} iconAssetId={b.iconAssetId} name={b.name} />,
    },
    {
      key: 'name',
      header: 'Huy hiệu',
      width: 260,
      cell: (b) => (
        <div className="min-w-0">
          <Link
            className="block truncate text-body-14 text-link hover:underline"
            to={hrefFor(b)}
            onClick={(e) => {
              if (isModifiedClick(e)) return;
              e.preventDefault();
              onOpen(b);
            }}
          >
            {b.name}
          </Link>
          <div className="truncate text-caption-12 text-fg-4">{b.code}</div>
        </div>
      ),
    },
    {
      key: 'rarity',
      header: 'Độ hiếm',
      width: 120,
      cell: (b) => BADGE_RARITY_LABELS[b.rarity],
    },
    {
      key: 'criteria',
      header: 'Điều kiện',
      width: 260,
      cell: (b) => <span className="text-caption-12 text-fg-3">{summarizeCriteria(b.criteria)}</span>,
    },
    {
      key: 'unlocked',
      header: 'Đã đạt',
      width: 100,
      align: 'right',
      cell: (b) => <span className="tabular-nums">{formatNumber(b.unlockedCount)}</span>,
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: 110,
      cell: (b) => (
        <span className={b.isActive ? 'text-fg-1' : 'text-fg-4'}>{b.isActive ? 'Bật' : 'Tắt'}</span>
      ),
    },
    {
      key: 'order',
      header: 'Thứ tự',
      width: 80,
      align: 'right',
      cell: (b) => <span className="tabular-nums">{b.order}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: 220,
      cell: (b) =>
        canUpdate ? (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => onEdit(b)}>
              Sửa
            </Button>
            <Button size="sm" variant="stroke" onClick={() => onToggle(b)}>
              {b.isActive ? 'Tắt' : 'Bật'}
            </Button>
            {b.isActive ? (
              <Button size="sm" variant="ghost" onClick={() => onBackfill(b)}>
                Cấp bù
              </Button>
            ) : null}
          </div>
        ) : null,
    },
  ];
}
