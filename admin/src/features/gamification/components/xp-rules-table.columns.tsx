import { Button, NumberInput, Toggle } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatDate } from '@/shared/utils/format';

import { UNSUPPORTED_SOURCES } from '../constants/gamification.labels';
import type { XpRule, XpRuleDraft } from '../types/gamification.types';
import { xpSourceMeta } from '../utils/xp-event-format';
import { pickDraft, sameDraft } from '../utils/xp-rule-draft';

export interface XpRuleColumnActions {
  /** Có `gamification:update` — không có thì mọi ô chỉ đọc và không có nút "Lưu". */
  canUpdate: boolean;
  /** Bản nháp đang sửa của luật (chưa có ⇒ giá trị đã lưu). */
  draftOf: (rule: XpRule) => XpRuleDraft;
  patch: (rule: XpRule, part: Partial<XpRuleDraft>) => void;
  onSave: (rule: XpRule) => void;
}

/**
 * Cột bảng tab "Luật XP" (admin.md p4-03 §2.1). Mỗi ô nhập/công tắc mang NHÃN TRUY CẬP theo tên nguồn
 * ("Số XP — Hoàn thành task"): trong một bảng lặp 9 dòng, ô không tên chỉ đọc ra "ô nhập số" / "công
 * tắc" nên người đọc màn hình không biết đang sửa luật nào.
 */
export function buildXpRuleColumns({
  canUpdate,
  draftOf,
  patch,
  onSave,
}: XpRuleColumnActions): TableColumn<XpRule>[] {
  return [
    {
      key: 'source',
      header: 'Nguồn',
      width: 240,
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate text-body-14 text-fg-1">
            {xpSourceMeta(r.sourceType).label}
          </div>
          <div className="truncate text-caption-12 text-fg-4">
            {xpSourceMeta(r.sourceType).hint}
          </div>
        </div>
      ),
    },
    {
      key: 'xp',
      header: 'XP',
      width: 120,
      cell: (r) => (
        <NumberInput
          aria-label={`Số XP — ${xpSourceMeta(r.sourceType).label}`}
          disabled={!canUpdate}
          max={1000}
          min={0}
          value={draftOf(r).xp}
          onChange={(v) => patch(r, { xp: v ?? 0 })}
        />
      ),
    },
    {
      key: 'dailyCap',
      header: 'Trần/ngày',
      width: 130,
      cell: (r) => (
        <NumberInput
          aria-label={`Trần XP mỗi ngày — ${xpSourceMeta(r.sourceType).label}`}
          disabled={!canUpdate}
          max={10000}
          min={0}
          placeholder="Không trần"
          value={draftOf(r).dailyCap}
          onChange={(v) => patch(r, { dailyCap: v })}
        />
      ),
    },
    {
      key: 'streak',
      header: 'Tính chuỗi ngày',
      width: 130,
      cell: (r) => (
        <Toggle
          aria-label={`Tính vào chuỗi ngày — ${xpSourceMeta(r.sourceType).label}`}
          checked={draftOf(r).countsForStreak}
          disabled={!canUpdate}
          onCheckedChange={(v) => patch(r, { countsForStreak: v })}
        />
      ),
    },
    {
      key: 'active',
      header: 'Bật',
      width: 110,
      cell: (r) =>
        UNSUPPORTED_SOURCES.has(r.sourceType) ? (
          <span className="text-caption-12 text-fg-4">Chưa hỗ trợ</span>
        ) : (
          <Toggle
            aria-label={`Bật luật — ${xpSourceMeta(r.sourceType).label}`}
            checked={draftOf(r).isActive}
            disabled={!canUpdate}
            onCheckedChange={(v) => patch(r, { isActive: v })}
          />
        ),
    },
    {
      key: 'updatedAt',
      header: 'Cập nhật',
      width: 170,
      cell: (r) => (
        <span className="tabular-nums text-caption-12 text-fg-4">
          {formatDate(r.updatedAt, 'HH:mm DD/MM/YYYY')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 100,
      cell: (r) =>
        canUpdate ? (
          <Button
            disabled={sameDraft(draftOf(r), pickDraft(r))}
            size="sm"
            variant="primary"
            onClick={() => onSave(r)}
          >
            Lưu
          </Button>
        ) : null,
    },
  ];
}
