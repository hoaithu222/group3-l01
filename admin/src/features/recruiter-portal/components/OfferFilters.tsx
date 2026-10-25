import { memo, useMemo } from 'react';

import { OFFER_STATUS_META, OFFER_STATUSES } from '@/features/recruiter';
import type { CompanyMemberView } from '@/features/recruiter';
import { Button, Dropdown, RangeDatePicker } from '@/shared/ui';
import type { DateRange } from '@/shared/ui';

import { OFFER_FILTER_ALL } from '../hooks/useOfferFilters';

const STATUS_OPTIONS = [
  { value: OFFER_FILTER_ALL, label: 'Mọi trạng thái' },
  ...OFFER_STATUSES.map((value) => ({ value, label: OFFER_STATUS_META[value].label })),
];

export interface OfferFiltersProps {
  status: string;
  recruiter: string;
  range: DateRange;
  members: readonly CompanyMemberView[];
  hasFilter: boolean;
  onStatusChange: (v: string) => void;
  onRecruiterChange: (v: string) => void;
  onRangeChange: (range: DateRange) => void;
  onClear: () => void;
}

/** Thanh lọc lời mời (admin.md p6-08 §2.6): trạng thái · người gửi (thành viên công ty) · khoảng ngày gửi. Mọi giá trị nằm trên URL. */
const OfferFilters = memo(function OfferFilters(p: OfferFiltersProps) {
  const recruiterOptions = useMemo(
    () => [
      { value: OFFER_FILTER_ALL, label: 'Mọi người gửi' },
      ...p.members.map((m) => ({ value: m.userId, label: m.name })),
    ],
    [p.members],
  );

  return (
    <>
      <Dropdown
        aria-label="Lọc theo trạng thái lời mời"
        className="w-44"
        options={STATUS_OPTIONS}
        size="sm"
        value={p.status}
        onValueChange={p.onStatusChange}
      />
      <Dropdown
        aria-label="Lọc theo người gửi"
        className="w-48"
        options={recruiterOptions}
        size="sm"
        value={p.recruiter}
        onValueChange={p.onRecruiterChange}
      />
      <RangeDatePicker
        className="w-64"
        placeholder="Ngày gửi"
        range={p.range}
        showQuickSelect
        size="sm"
        onRangeChange={p.onRangeChange}
      />
      {p.hasFilter ? (
        <Button size="sm" variant="ghost" onClick={p.onClear}>
          Xoá bộ lọc
        </Button>
      ) : null}
    </>
  );
});

export default OfferFilters;
