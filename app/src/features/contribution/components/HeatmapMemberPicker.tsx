import { useMemo } from 'react';

import type { SelectOption } from '@/shared/ui/select';

import type { ContributionMember } from '../api/contribution.types';
import { HeatmapPersonPicker } from './HeatmapPersonPicker';

export interface HeatmapMemberPickerProps {
  members: readonly ContributionMember[];
  /** `'all'` (cả bảng) hoặc id thành viên. */
  value: string;
  onChange: (userId: string) => void;
}

/** Bộ chọn phạm vi của biểu đồ hoạt động của BẢNG (app.md §3): chip "Cả bảng" và chip "Thành viên" mở tấm chọn người — người đã rời nhóm vẫn chọn được, có chú thích chữ. */
export function HeatmapMemberPicker({ members, value, onChange }: HeatmapMemberPickerProps) {
  const options: SelectOption[] = useMemo(
    () =>
      members.map((member) => ({
        label: member.user.membership === 'LEFT' ? `${member.user.name} (đã rời nhóm)` : member.user.name,
        value: member.user.id,
      })),
    [members],
  );

  return <HeatmapPersonPicker allLabel="Cả bảng" options={options} value={value} onChange={onChange} />;
}
