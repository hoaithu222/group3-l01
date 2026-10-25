import { memo } from 'react';

import { useImeSafeSearchInput } from '@/shared/hooks';
import { Dropdown, Input } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import {
  COMPANY_LIMITS,
  COMPANY_STATUS_META,
  COMPANY_STATUSES,
  COMPANY_TIER_LABEL,
  COMPANY_TIERS,
  STATUS_FILTER_ALL,
} from '../constants/recruiter.constants';

const STATUS_OPTIONS = [
  ...COMPANY_STATUSES.map((value) => ({ value, label: COMPANY_STATUS_META[value].label })),
  { value: STATUS_FILTER_ALL, label: 'Tất cả trạng thái' },
];
const TIER_OPTIONS = [
  { value: STATUS_FILTER_ALL, label: 'Mọi gói' },
  ...COMPANY_TIERS.map((value) => ({ value, label: COMPANY_TIER_LABEL[value] })),
];

export interface CompanyFiltersProps {
  /** Từ khoá đang áp (URL `?q=`) — ô nhập uncontrolled, IME-safe. */
  search: string;
  onSearchChange: (value: string) => void;
  /** Trạng thái đang áp hoặc `all`. */
  status: string;
  onStatusChange: (value: string) => void;
  tier: string;
  onTierChange: (value: string) => void;
}

/** Thanh lọc danh sách doanh nghiệp (admin.md p6-08 §2.1): tìm theo tên (lọc SERVER), trạng thái, gói. Mọi giá trị nằm trên URL. */
const CompanyFilters = memo(function CompanyFilters(p: CompanyFiltersProps) {
  const { inputProps } = useImeSafeSearchInput(p.search, p.onSearchChange);

  return (
    <>
      <Input
        {...inputProps}
        clearable
        maxLength={COMPANY_LIMITS.nameMax}
        placeholder="Tìm theo tên doanh nghiệp…"
        size="sm"
        startIcon={<SystemIcon name="magnifying-glass-outline" size={16} />}
        wrapperClassName="w-64"
      />
      <Dropdown
        aria-label="Lọc theo trạng thái doanh nghiệp"
        className="w-44"
        options={STATUS_OPTIONS}
        size="sm"
        value={p.status}
        onValueChange={p.onStatusChange}
      />
      <Dropdown
        aria-label="Lọc theo gói"
        className="w-36"
        options={TIER_OPTIONS}
        size="sm"
        value={p.tier}
        onValueChange={p.onTierChange}
      />
    </>
  );
});

export default CompanyFilters;
