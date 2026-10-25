import { Badge, Button, NumberInput, Toggle } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import { COIN_LIMITS, COIN_SOURCE_LABELS } from '../constants/economy.constants';
import type { CoinRuleDraft } from '../types/economy-catalog.types';
import {
  pickRuleDraft,
  ruleDraftError,
  sameRuleDraft,
  type CoinRuleRow,
} from '../utils/coin-rule-draft';

export interface CoinRuleColumnActions {
  /** Có `gamification:update` — không có thì mọi ô chỉ đọc và không có nút "Lưu". */
  canUpdate: boolean;
  /** Bản nháp đang sửa của dòng (chưa sửa ⇒ giá trị đã lưu). */
  draftOf: (row: CoinRuleRow) => CoinRuleDraft;
  patch: (row: CoinRuleRow, part: Partial<CoinRuleDraft>) => void;
  onSave: (row: CoinRuleRow) => void;
}

const labelOf = (row: CoinRuleRow): string =>
  COIN_SOURCE_LABELS[row.sourceType]?.label ?? row.sourceType;

/**
 * Cột bảng "Quy tắc thưởng" (admin.md p7-02 §2.1) — sửa TẠI DÒNG rồi "Lưu" (hỏi lý do). Mỗi ô mang NHÃN TRUY CẬP theo tên nguồn ("Xu mỗi lần — Hoàn thành task").
 * Lỗi nhập (xu ngoài 1–1 000, trần ngoài 1–200) chỉ hiện SAU khi dòng bị sửa — dòng chưa có luật để nguyên 0 xu không đỏ lòm — và khoá nút Lưu.
 */
export function buildCoinRuleColumns({
  canUpdate,
  draftOf,
  patch,
  onSave,
}: CoinRuleColumnActions): TableColumn<CoinRuleRow>[] {
  return [
    {
      key: 'source',
      header: 'Nguồn thưởng',
      width: 250,
      cell: (r) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-body-14 text-fg-1">{labelOf(r)}</span>
            {!r.rule && (
              <Badge color="warning" variant="tinted">
                Chưa có luật
              </Badge>
            )}
          </div>
          <div className="truncate text-caption-12 text-fg-4">
            {COIN_SOURCE_LABELS[r.sourceType]?.hint}
          </div>
        </div>
      ),
    },
    {
      key: 'coins',
      header: 'Xu mỗi lần',
      width: 150,
      cell: (r) => {
        const draft = draftOf(r);
        const error = sameRuleDraft(draft, pickRuleDraft(r)) ? null : ruleDraftError(draft);
        return (
          <div className="flex flex-col gap-0.5">
            <NumberInput
              allowDecimal={false}
              aria-label={`Xu mỗi lần — ${labelOf(r)}`}
              disabled={!canUpdate}
              invalid={!!error}
              max={COIN_LIMITS.ruleCoinsMax}
              min={0}
              value={draft.coins}
              onChange={(v) => patch(r, { coins: v ?? 0 })}
            />
            {error && <span className="text-caption-12 text-error">{error}</span>}
          </div>
        );
      },
    },
    {
      key: 'dailyCap',
      header: 'Trần/ngày',
      width: 150,
      cell: (r) => (
        <NumberInput
          allowDecimal={false}
          aria-label={`Trần xu mỗi ngày — ${labelOf(r)}`}
          disabled={!canUpdate}
          max={COIN_LIMITS.dailyEarnCap}
          min={0}
          placeholder="Theo trần chung"
          value={draftOf(r).dailyCap}
          onChange={(v) => patch(r, { dailyCap: v })}
        />
      ),
    },
    {
      key: 'active',
      header: 'Bật',
      width: 80,
      cell: (r) => (
        <Toggle
          aria-label={`Bật luật — ${labelOf(r)}`}
          checked={draftOf(r).isActive}
          disabled={!canUpdate}
          onCheckedChange={(v) => patch(r, { isActive: v })}
        />
      ),
    },
    {
      key: 'issued7d',
      header: 'Phát 7 ngày',
      width: 120,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{formatNumber(r.rule?.issued7d ?? 0)}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: 90,
      cell: (r) => {
        if (!canUpdate) return null;
        const draft = draftOf(r);
        return (
          <Button
            aria-label={`Lưu luật — ${labelOf(r)}`}
            disabled={sameRuleDraft(draft, pickRuleDraft(r)) || ruleDraftError(draft) !== null}
            size="sm"
            variant="primary"
            onClick={() => onSave(r)}
          >
            Lưu
          </Button>
        );
      },
    },
  ];
}
