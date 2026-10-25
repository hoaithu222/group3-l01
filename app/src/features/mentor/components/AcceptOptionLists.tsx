import { Text, View } from 'react-native';

import { Checkbox } from '@/shared/ui/checkbox';
import { Skeleton } from '@/shared/ui/skeleton';

import type { MentorChannelOption, MentorMemberOption } from '../api/mentor.types';
import { MENTOR_LIMITS } from '../constants/mentor.constants';

const toggleId = (list: string[], id: string, on: boolean): string[] =>
  on ? [...new Set([...list, id])] : list.filter((x) => x !== id);

export interface AcceptChannelListProps {
  invalidIds: string[];
  loading: boolean;
  options: MentorChannelOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}

/** Kênh chỉ định cho cố vấn — kênh riêng tư ghi rõ bằng chữ; kênh BE từ chối (`MENTOR_008`) ghi "Không chọn được". */
export function AcceptChannelList({
  invalidIds,
  loading,
  onChange,
  options,
  selected,
}: AcceptChannelListProps) {
  return (
    <View className="gap-xs">
      <Text className="text-label-md font-semibold text-fg-1">Kênh cố vấn được xem</Text>
      {loading ? <Skeleton className="h-11 rounded-md" /> : null}
      {options.map((c) => {
        const invalid = invalidIds.includes(c.id);
        const suffix = `${c.visibility === 'PRIVATE' ? ' · riêng tư' : ''}${c.isDefault ? ' · mặc định' : ''}${invalid ? ' · không chọn được' : ''}`;
        return (
          <View key={c.id} className="min-h-[44px] justify-center">
            <Checkbox
              checked={selected.includes(c.id)}
              label={`# ${c.name}${suffix}`}
              onChange={(on) => onChange(toggleId(selected, c.id, on))}
            />
          </View>
        );
      })}
    </View>
  );
}

export interface AcceptMemberListProps {
  loading: boolean;
  options: MentorMemberOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}

/** Thành viên kèm vào nhóm chat cố vấn (tối đa `includeMembersMax`); người đăng bài luôn có mặt (BE tự thêm). */
export function AcceptMemberList({ loading, onChange, options, selected }: AcceptMemberListProps) {
  const full = selected.length >= MENTOR_LIMITS.includeMembersMax;
  return (
    <View className="gap-xs">
      <Text className="text-label-md font-semibold text-fg-1">
        Thành viên kèm theo ({selected.length}/{MENTOR_LIMITS.includeMembersMax})
      </Text>
      {loading ? <Skeleton className="h-11 rounded-md" /> : null}
      {options.map((m) => (
        <View key={m.userId} className="min-h-[44px] justify-center">
          <Checkbox
            checked={selected.includes(m.userId)}
            disabled={full && !selected.includes(m.userId)}
            label={m.name}
            onChange={(on) => onChange(toggleId(selected, m.userId, on))}
          />
        </View>
      ))}
    </View>
  );
}
