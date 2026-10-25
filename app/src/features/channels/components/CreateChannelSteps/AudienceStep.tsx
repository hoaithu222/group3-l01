import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Checkbox } from '@/shared/ui/checkbox';
import { EmptyState } from '@/shared/ui/empty-state';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { SearchInput } from '@/shared/ui/search';
import { hapticSelection } from '@/shared/utils/haptics';
import { cn } from '@/shared/utils/style/cn';

import type { ChannelVisibility } from '../../api';
import { useWorkspaceMemberOptions } from '../../queries/channel-members.queries';
import type { ChannelDraft } from './create-channel-draft.types';

const VISIBILITY_LABEL: Record<ChannelVisibility, string> = {
  PRIVATE: 'Chỉ người được mời',
  PUBLIC: 'Mọi người trong nhóm',
};
const VISIBILITY_DESCRIPTION: Record<ChannelVisibility, string> = {
  PRIVATE: 'Chỉ người được thêm mới thấy kênh này tồn tại.',
  PUBLIC: 'Ai trong nhóm cũng thấy và tự tham gia được.',
};

export interface AudienceStepProps {
  draft: ChannelDraft;
  onChange: (patch: Partial<ChannelDraft>) => void;
  wsId: string;
}

/**
 * Bước 3/5 — công khai/riêng tư + chọn thành viên ban đầu khi riêng tư (app.md
 * §3: "hiện câu lịch sử" dù chưa chọn ai). Chuyển sang PUBLIC thì xoá sạch
 * `initialMemberIds` đã chọn — trường đó chỉ có ý nghĩa với PRIVATE (be.md §5.1).
 */
export function AudienceStep({ draft, onChange, wsId }: AudienceStepProps) {
  const [query, setQuery] = useState('');
  const { data: options = [] } = useWorkspaceMemberOptions(wsId, query);

  function toggleMember(userId: string): void {
    const next = draft.initialMemberIds.includes(userId)
      ? draft.initialMemberIds.filter((id) => id !== userId)
      : [...draft.initialMemberIds, userId];
    onChange({ initialMemberIds: next });
  }

  return (
    <View className="gap-md">
      <View className="gap-sm">
        {(['PUBLIC', 'PRIVATE'] as const).map((visibility) => {
          const selected = draft.visibility === visibility;
          return (
            <Pressable
              key={visibility}
              accessibilityLabel={`${VISIBILITY_LABEL[visibility]}. ${VISIBILITY_DESCRIPTION[visibility]}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, selected }}
              // Cùng khuôn thẻ chọn của `TypeStep`: ô icon + chữ + dấu tích khi chọn (không để màu là dấu hiệu duy nhất).
              className={cn(
                'flex-row items-center gap-sm rounded-md border-hairline p-sm active:opacity-80',
                selected ? 'border-border-brand bg-action-tint' : 'border-border-1',
              )}
              onPress={() => {
                if (!selected) hapticSelection();
                onChange({ visibility, ...(visibility === 'PUBLIC' && { initialMemberIds: [] }) });
              }}
            >
              <IconTile
                name={visibility === 'PRIVATE' ? 'lock' : 'add-team'}
                tone={visibility === 'PRIVATE' ? 'warning' : 'info'}
              />
              <View className="flex-1 gap-3xs">
                <Text className={cn('text-label-lg font-semibold', selected ? 'text-fg-brand' : 'text-fg-1')}>
                  {VISIBILITY_LABEL[visibility]}
                </Text>
                <Text className="text-caption-sm text-fg-2">{VISIBILITY_DESCRIPTION[visibility]}</Text>
              </View>
              {selected ? <Icon color="fg-brand" name="checkmark-circle" size="sm" /> : null}
            </Pressable>
          );
        })}
      </View>

      {draft.visibility === 'PRIVATE' ? (
        <View className="gap-sm">
          <Text className="text-caption-sm text-fg-2">
            Người được thêm sẽ xem được lịch sử tin nhắn cũ của kênh (khi có).
          </Text>
          <SearchInput placeholder="Tìm thành viên" onChangeText={setQuery} />
          {options.length === 0 ? (
            <EmptyState
              description="Không tìm thấy thành viên."
              icon="search"
              size="compact"
              tone="neutral"
            />
          ) : (
            <View className="gap-2xs">
              {options.map((option) => (
                <Checkbox
                  key={option.userId}
                  accessibilityLabel={option.displayName ?? option.name}
                  checked={draft.initialMemberIds.includes(option.userId)}
                  label={
                    <View className="flex-row items-center gap-sm">
                      {/* Ảnh thật khi có (`avatarUrl` BE đã gửi), chữ viết tắt đỡ khi thiếu/lỗi tải. */}
                      <Avatar
                        name={option.displayName ?? option.name}
                        size="sm"
                        source={option.avatarUrl ? { uri: option.avatarUrl } : undefined}
                      />
                      <Text className="text-body-md text-fg-1">{option.displayName ?? option.name}</Text>
                    </View>
                  }
                  onChange={() => toggleMember(option.userId)}
                />
              ))}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}
