import { useState } from 'react';
import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';

import type { MeetingStatus, RangeScope, WorkspaceOption } from '../../api/meetings.types';
import { STATUS_LABEL } from '../../constants/meetings.constants';
import { DEFAULT_FILTERS, type CalendarFilters } from '../../hooks/useCalendarFilters';

const STATUSES: MeetingStatus[] = ['SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED'];
const SCOPES: { label: string; value: RangeScope }[] = [
  { label: 'Của tôi', value: 'MINE' },
  { label: 'Tất cả tôi thấy', value: 'ALL_VISIBLE' },
];

export interface CalendarFilterSheetProps {
  filters: CalendarFilters;
  onApply: (next: CalendarFilters) => void;
  onClose: () => void;
  visible: boolean;
  workspaces: WorkspaceOption[];
}

function Body({
  filters,
  onApply,
  workspaces,
}: Omit<CalendarFilterSheetProps, 'onClose' | 'visible'>) {
  const [draft, setDraft] = useState<CalendarFilters>(filters);
  const toggleStatus = (status: MeetingStatus) =>
    setDraft((d) => ({
      ...d,
      statuses: d.statuses.includes(status)
        ? d.statuses.filter((s) => s !== status)
        : [...d.statuses, status],
    }));

  return (
    <View className="gap-md pb-sm">
      <View className="gap-xs">
        <Text className="text-label-md font-semibold text-fg-1">Hiển thị</Text>
        <View className="flex-row flex-wrap gap-xs">
          {SCOPES.map((s) => (
            <Chip
              key={s.value}
              label={s.label}
              role="radio"
              selected={draft.scope === s.value}
              onPress={() => setDraft({ ...draft, scope: s.value })}
            />
          ))}
        </View>
      </View>
      {workspaces.length > 1 ? (
        <View className="gap-xs">
          <Text className="text-label-md font-semibold text-fg-1">Nhóm</Text>
          <View className="flex-row flex-wrap gap-xs">
            <Chip
              label="Tất cả nhóm"
              role="radio"
              selected={draft.workspaceId === ''}
              onPress={() => setDraft({ ...draft, workspaceId: '' })}
            />
            {workspaces.map((w) => (
              <Chip
                key={w.id}
                // Ảnh đại diện nhóm (`avatarUrl` có sẵn, trước chưa vẽ) — nhận ra nhóm bằng ảnh nhanh hơn đọc tên; thiếu ảnh ⇒ chữ viết tắt.
                avatar={
                  <Avatar
                    name={w.name}
                    size="sm"
                    source={w.avatarUrl ? { uri: w.avatarUrl } : undefined}
                  />
                }
                label={w.name}
                role="radio"
                selected={draft.workspaceId === w.id}
                onPress={() => setDraft({ ...draft, workspaceId: w.id })}
              />
            ))}
          </View>
        </View>
      ) : null}
      <View className="gap-xs">
        <Text className="text-label-md font-semibold text-fg-1">Trạng thái</Text>
        <View className="flex-row flex-wrap gap-xs">
          {STATUSES.map((s) => (
            <Chip
              key={s}
              label={STATUS_LABEL[s]}
              role="checkbox"
              selected={draft.statuses.includes(s)}
              onPress={() => toggleStatus(s)}
            />
          ))}
        </View>
      </View>
      <View className="flex-row gap-sm">
        <View className="flex-1">
          <Button
            fullWidth
            label="Đặt lại"
            variant="secondary"
            onPress={() => setDraft(DEFAULT_FILTERS)}
          />
        </View>
        <View className="flex-1">
          <Button fullWidth label="Áp dụng" onPress={() => onApply(draft)} />
        </View>
      </View>
    </View>
  );
}

/** Bộ lọc lịch (app.md p2-04 §3): Của tôi / Tất cả tôi thấy, nhóm, trạng thái. Bản nháp chỉ áp khi bấm "Áp dụng". */
export function CalendarFilterSheet({ onClose, visible, ...rest }: CalendarFilterSheetProps) {
  return (
    <BottomSheet title="Bộ lọc lịch" visible={visible} onClose={onClose}>
      {visible ? (
        <Body
          {...rest}
          onApply={(next) => {
            rest.onApply(next);
            onClose();
          }}
        />
      ) : null}
    </BottomSheet>
  );
}
