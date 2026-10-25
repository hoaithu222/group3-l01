import { Link } from 'react-router-dom';

import { Badge, Button } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import { SKILL_CATEGORY_LABELS } from '../constants/skill.constants';
import type { AdminSkill } from '../types/skill.types';
import { summarizeCriteria } from '../utils/skill-form.utils';

export interface SkillRowActions {
  /** `skill:update` — nút Bật/Tắt. */
  canUpdate: boolean;
  onToggle: (skill: AdminSkill) => void;
}

const LABELS_SHOWN = 3;

/**
 * Cột bảng danh sách kỹ năng (admin.md p6-06 §2.1). Tên là `<Link>` tới `/skill/:id` (navigable-controls: điều hướng có URL đích phải là liên
 * kết thật); nhãn khớp hiện ≤ 3 chip + "+N"; trạng thái có CHỮ (không chỉ màu).
 */
export function buildSkillColumns({
  canUpdate,
  onToggle,
}: SkillRowActions): TableColumn<AdminSkill>[] {
  return [
    {
      key: 'name',
      header: 'Kỹ năng',
      width: 240,
      cell: (s) => (
        <div className="min-w-0">
          <Link
            className="block truncate text-body-14 text-link hover:underline"
            to={`/skill/${encodeURIComponent(s.id)}`}
          >
            {s.name}
          </Link>
          <div className="truncate font-mono text-caption-12 text-fg-4">{s.code}</div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Nhóm',
      width: 120,
      cell: (s) => (
        <Badge color="neutral" variant="tinted">
          {SKILL_CATEGORY_LABELS[s.category]}
        </Badge>
      ),
    },
    {
      key: 'labels',
      header: 'Nhãn khớp',
      width: 220,
      cell: (s) => (
        <div className="flex flex-wrap gap-1">
          {s.labelMatch.slice(0, LABELS_SHOWN).map((l) => (
            <Badge key={l} color="neutral" size="sm" variant="outline">
              {l}
            </Badge>
          ))}
          {s.labelMatch.length > LABELS_SHOWN ? (
            <span className="text-caption-12 text-fg-3">+{s.labelMatch.length - LABELS_SHOWN}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'criteria',
      header: 'Tiêu chí',
      width: 240,
      cell: (s) => (
        <span className="text-caption-12 text-fg-3">{summarizeCriteria(s.criteria)}</span>
      ),
    },
    {
      key: 'holders',
      header: 'Người đạt',
      width: 100,
      align: 'right',
      cell: (s) => <span className="tabular-nums">{formatNumber(s.holdersCount)}</span>,
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: 110,
      cell: (s) => (
        <span className={s.isActive ? 'text-fg-1' : 'text-fg-4'}>
          {s.isActive ? 'Đang bật' : 'Tắt'}
        </span>
      ),
    },
    {
      key: 'order',
      header: 'Thứ tự',
      width: 80,
      align: 'right',
      cell: (s) => <span className="tabular-nums">{s.order}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: 90,
      cell: (s) =>
        canUpdate ? (
          <Button size="sm" variant="stroke" onClick={() => onToggle(s)}>
            {s.isActive ? 'Tắt' : 'Bật'}
          </Button>
        ) : null,
    },
  ];
}
