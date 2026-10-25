import { memo } from 'react';

import { Button, Dropdown, NumberInput } from '@/shared/ui';

import { COUNTER_LABELS } from '../constants/gamification.labels';

export interface CriteriaClause {
  counter: string;
  value: number;
}

export interface CriteriaClauseListProps {
  title: string;
  clauses: CriteriaClause[];
  /** Số mệnh đề tối thiểu (nhóm "Tất cả" BE bắt buộc ≥ 1; nhóm "Một trong" được rỗng). */
  minCount: number;
  onChange: (next: CriteriaClause[]) => void;
}

const COUNTER_OPTIONS = Object.entries(COUNTER_LABELS).map(([value, label]) => ({ value, label }));
const NEW_CLAUSE: CriteriaClause = { counter: 'tasksDone', value: 1 };

/**
 * Một nhóm điều kiện huy hiệu (`criteria.all` hoặc `criteria.any`): counter chọn từ danh sách cố
 * định `COUNTER_KEYS` (không có trường tự do) + ngưỡng `≥`.
 */
const CriteriaClauseList = memo(function CriteriaClauseList({
  title,
  clauses,
  minCount,
  onChange,
}: CriteriaClauseListProps) {
  const update = (i: number, p: Partial<CriteriaClause>) =>
    onChange(clauses.map((c, idx) => (idx === i ? { ...c, ...p } : c)));

  return (
    <div className="flex flex-col gap-2">
      <span className="text-body-14 text-fg-2">{title}</span>
      {clauses.map((c, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Dropdown
              aria-label={`Loại điều kiện ${i + 1}`}
              options={COUNTER_OPTIONS}
              value={c.counter}
              onValueChange={(v) => update(i, { counter: v })}
            />
          </div>
          <span className="text-fg-4">≥</span>
          <div className="w-28">
            <NumberInput
              aria-label={`Ngưỡng điều kiện ${i + 1}`}
              min={1}
              value={c.value}
              onChange={(v) => update(i, { value: v ?? 1 })}
            />
          </div>
          <Button
            disabled={clauses.length <= minCount}
            size="sm"
            variant="ghost"
            onClick={() => onChange(clauses.filter((_, idx) => idx !== i))}
          >
            Xoá
          </Button>
        </div>
      ))}
      <div>
        <Button size="sm" variant="stroke" onClick={() => onChange([...clauses, NEW_CLAUSE])}>
          Thêm điều kiện
        </Button>
      </div>
    </div>
  );
});

export default CriteriaClauseList;
