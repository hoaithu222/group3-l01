import { memo } from 'react';
import { Link } from 'react-router-dom';

import { Button, Dropdown, Input, SegmentToggle } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { useImeSafeSearchInput } from '@/shared/hooks';

import { SKILL_CATEGORY_OPTIONS, SKILL_LIMITS } from '../constants/skill.constants';

export type SkillActiveFilter = 'all' | 'true' | 'false';

const ALL = 'all';
const CATEGORY_FILTER_OPTIONS = [{ value: ALL, label: 'Mọi nhóm' }, ...SKILL_CATEGORY_OPTIONS];
const STATUS_OPTIONS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'true', label: 'Đang bật' },
  { key: 'false', label: 'Tắt' },
];

export interface SkillsToolbarProps {
  /** Từ khoá đang áp (URL `?q=`) — ô nhập uncontrolled, IME-safe. */
  search: string;
  onSearchChange: (value: string) => void;
  category: string;
  onCategoryChange: (value: string | null) => void;
  status: SkillActiveFilter;
  onStatusChange: (value: SkillActiveFilter) => void;
  /** `skill:create` — nút "Tạo kỹ năng" (liên kết thật tới `/skill/new`). */
  canCreate: boolean;
  /** `skill:update` — nút "Đánh giá lại toàn bộ". */
  canReevaluate: boolean;
  onReevaluate: () => void;
}

/** Thanh công cụ danh sách kỹ năng (admin.md p6-06 §2.1): tìm theo tên/mã (lọc SERVER), nhóm, trạng thái, Tạo, Đánh giá lại toàn bộ. */
const SkillsToolbar = memo(function SkillsToolbar(p: SkillsToolbarProps) {
  const { inputProps } = useImeSafeSearchInput(p.search, p.onSearchChange);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          {...inputProps}
          clearable
          maxLength={SKILL_LIMITS.nameMax}
          placeholder="Tìm theo tên hoặc mã…"
          size="sm"
          startIcon={<SystemIcon name="magnifying-glass-outline" size={16} />}
          wrapperClassName="w-64"
        />
        <Dropdown
          aria-label="Lọc theo nhóm kỹ năng"
          className="w-44"
          options={CATEGORY_FILTER_OPTIONS}
          size="sm"
          value={p.category || ALL}
          onValueChange={(v) => p.onCategoryChange(v === ALL ? null : v)}
        />
        <SegmentToggle
          aria-label="Lọc theo trạng thái kỹ năng"
          options={STATUS_OPTIONS}
          value={p.status}
          onValueChange={(v) => p.onStatusChange(v as SkillActiveFilter)}
        />
      </div>
      <div className="flex items-center gap-2">
        {p.canReevaluate ? (
          <Button size="sm" variant="stroke" onClick={p.onReevaluate}>
            Đánh giá lại toàn bộ
          </Button>
        ) : null}
        {p.canCreate ? (
          <Button asChild size="sm" variant="primary">
            <Link to="/skill/new">Tạo kỹ năng</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
});

export default SkillsToolbar;
