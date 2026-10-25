import { Button, Toggle } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import { COIN_QUEST_METRIC_LABELS } from '../constants/economy.constants';
import type { AdminCoinQuest } from '../types/economy-catalog.types';

export interface QuestColumnActions {
  /** Có `gamification:update` — không có thì công tắc bị khoá và không có nút "Sửa". */
  canUpdate: boolean;
  onEdit: (quest: AdminCoinQuest) => void;
  /** Bấm công tắc → mở hộp thoại lý do; trạng thái chỉ đổi khi BE xác nhận. */
  onToggle: (quest: AdminCoinQuest) => void;
}

/**
 * Cột bảng "Nhiệm vụ ngày" (admin.md p7-02 §2.1): mã, tiêu đề + mô tả, chỉ số đếm, mục tiêu, xu thưởng, thứ tự, công tắc bật/tắt, nút Sửa.
 * Control mỗi dòng mang NHÃN TRUY CẬP theo tên nhiệm vụ.
 */
export function buildQuestColumns({
  canUpdate,
  onEdit,
  onToggle,
}: QuestColumnActions): TableColumn<AdminCoinQuest>[] {
  return [
    {
      key: 'order',
      header: 'Thứ tự',
      width: 80,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{r.order}</span>,
    },
    {
      key: 'code',
      header: 'Mã',
      width: 160,
      cell: (r) => <span className="block truncate text-fg-3">{r.code}</span>,
    },
    {
      key: 'quest',
      header: 'Nhiệm vụ',
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate text-body-14 text-fg-1">{r.title}</div>
          <div className="truncate text-caption-12 text-fg-4">{r.description}</div>
        </div>
      ),
    },
    {
      key: 'metric',
      header: 'Đếm theo',
      width: 190,
      cell: (r) => COIN_QUEST_METRIC_LABELS[r.metric] ?? r.metric,
    },
    {
      key: 'target',
      header: 'Mục tiêu',
      width: 100,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{formatNumber(r.target)}</span>,
    },
    {
      key: 'coins',
      header: 'Thưởng (xu)',
      width: 110,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{formatNumber(r.coins)}</span>,
    },
    {
      key: 'active',
      header: 'Bật',
      width: 80,
      cell: (r) => (
        <Toggle
          aria-label={`Bật nhiệm vụ — ${r.title}`}
          checked={r.isActive}
          disabled={!canUpdate}
          onCheckedChange={() => onToggle(r)}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 80,
      cell: (r) =>
        canUpdate ? (
          <Button
            aria-label={`Sửa nhiệm vụ ${r.title}`}
            size="sm"
            variant="ghost"
            onClick={() => onEdit(r)}
          >
            Sửa
          </Button>
        ) : null,
    },
  ];
}
