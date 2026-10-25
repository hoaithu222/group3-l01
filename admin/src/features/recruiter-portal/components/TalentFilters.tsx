import { memo, useMemo } from 'react';

import { useImeSafeSearchInput } from '@/shared/hooks';
import { Button, Input, MultiSelect, NumberInput, Text } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import { TALENT_LIMITS } from '../constants/portal.constants';
import type { SkillOption } from '../types/talent.types';

export interface TalentFiltersValues {
  skills: string[];
  minContribution: number;
  minBadges: number;
  role: string;
  location: string;
  q: string;
}

export interface TalentFiltersProps {
  values: TalentFiltersValues;
  skillOptions: readonly SkillOption[];
  /** Danh mục kỹ năng đang tải/lỗi — ô chọn kỹ năng vẫn hiện (giữ mã đã chọn từ URL) nhưng chưa có nhãn. */
  skillsLoading: boolean;
  hasFilter: boolean;
  onSkillsChange: (codes: string[]) => void;
  onMinContributionChange: (n: number | null) => void;
  onMinBadgesChange: (n: number | null) => void;
  onRoleChange: (v: string) => void;
  onLocationChange: (v: string) => void;
  onKeywordChange: (v: string) => void;
  onClear: () => void;
}

/**
 * Bộ lọc ứng viên (admin.md p6-08 §2.4): kỹ năng (≤ 10, từ danh mục) · đóng góp tối thiểu (%) · số huy hiệu tối thiểu · vị trí mong muốn · khu vực · từ khoá.
 * Mọi giá trị nằm trên URL (F5 giữ nguyên) — component chỉ hiển thị và báo thay đổi. Ba ô chữ là uncontrolled IME-safe (`useImeSafeSearchInput`) để gõ tiếng Việt có dấu không mất chữ;
 * việc debounce 400 ms nằm ở `useTalentFilters` (gọi API), không ở đây. Kit2 chưa có `SliderField` nên "đóng góp tối thiểu" là ô số 0–100.
 */
const TalentFilters = memo(function TalentFilters(p: TalentFiltersProps) {
  const role = useImeSafeSearchInput(p.values.role, p.onRoleChange);
  const location = useImeSafeSearchInput(p.values.location, p.onLocationChange);
  const keyword = useImeSafeSearchInput(p.values.q, p.onKeywordChange);

  // Mã đã chọn mà danh mục chưa tải/không còn: vẫn hiện (nhãn = mã) để người dùng bỏ chọn được, không âm thầm giữ một bộ lọc vô hình.
  const options = useMemo(() => {
    const known = new Set(p.skillOptions.map((s) => s.code));
    return [
      ...p.skillOptions.map((s) => ({ value: s.code, label: s.name })),
      ...p.values.skills.filter((c) => !known.has(c)).map((c) => ({ value: c, label: c })),
    ];
  }, [p.skillOptions, p.values.skills]);

  const atSkillLimit = p.values.skills.length >= TALENT_LIMITS.filterSkillsMax;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Text size="small" weight="medium">
          Bộ lọc ứng viên
        </Text>
        {p.hasFilter ? (
          <Button size="xs" variant="ghost" onClick={p.onClear}>
            Xoá bộ lọc
          </Button>
        ) : null}
      </div>
      <Input
        {...keyword.inputProps}
        clearable
        maxLength={TALENT_LIMITS.keywordMax}
        placeholder="Từ khoá (tên, tiêu đề, vị trí)…"
        size="sm"
        startIcon={<SystemIcon name="magnifying-glass-outline" size={16} />}
      />
      <div className="flex flex-col gap-1">
        <Text size="tiny" skin="muted">
          Kỹ năng đã xác thực (tối đa {TALENT_LIMITS.filterSkillsMax})
        </Text>
        <MultiSelect
          aria-label="Lọc theo kỹ năng"
          clearable
          maxDisplay={2}
          options={options.map((o) => ({
            ...o,
            disabled: atSkillLimit && !p.values.skills.includes(o.value),
          }))}
          placeholder={p.skillsLoading ? 'Đang tải kỹ năng…' : 'Mọi kỹ năng'}
          searchable
          searchPlaceholder="Tìm kỹ năng…"
          size="sm"
          value={p.values.skills}
          onValueChange={p.onSkillsChange}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Text size="tiny" skin="muted">
            Đóng góp tối thiểu
          </Text>
          <NumberInput
            aria-label="Đóng góp tối thiểu (%)"
            max={100}
            min={0}
            size="sm"
            suffix="%"
            value={p.values.minContribution > 0 ? p.values.minContribution : null}
            onChange={p.onMinContributionChange}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Text size="tiny" skin="muted">
            Số huy hiệu tối thiểu
          </Text>
          <NumberInput
            allowDecimal={false}
            aria-label="Số huy hiệu tối thiểu"
            max={TALENT_LIMITS.minBadgesMax}
            min={0}
            size="sm"
            value={p.values.minBadges > 0 ? p.values.minBadges : null}
            onChange={p.onMinBadgesChange}
          />
        </div>
      </div>
      <Input
        {...role.inputProps}
        aria-label="Vị trí mong muốn"
        clearable
        maxLength={TALENT_LIMITS.roleMax}
        placeholder="Vị trí mong muốn (vd Frontend)"
        size="sm"
      />
      <Input
        {...location.inputProps}
        aria-label="Khu vực"
        clearable
        maxLength={TALENT_LIMITS.locationMax}
        placeholder="Khu vực (vd Hà Nội)"
        size="sm"
      />
    </div>
  );
});

export default TalentFilters;
