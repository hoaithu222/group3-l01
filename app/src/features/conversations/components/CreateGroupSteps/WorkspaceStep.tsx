import { Pressable, ScrollView, Text } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { EmptyState } from '@/shared/ui/empty-state';
import { Icon } from '@/shared/ui/icon';
import { hapticSelection } from '@/shared/utils/haptics';
import { cn } from '@/shared/utils/style/cn';

import type { WorkspaceOption } from '../../api/conversations.types';
import { PersonRowsSkeleton } from '../PersonRowsSkeleton';

export interface WorkspaceStepProps {
  isLoading: boolean;
  options: WorkspaceOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Bước 1 (app.md §3) — chọn workspace ACTIVE; `CreateGroupScreen` tự bỏ qua bước này khi chỉ có 1.
 *
 * Hàng đang chọn: nền `bg-primary` (10%) + dấu tick — màu không là dấu hiệu duy nhất, và `accessibilityState.selected` báo cho trình đọc
 * màn hình. TỰ cuộn (`ScrollView`): màn cha `scrollable={false}`, người thuộc nhiều nhóm làm việc thì hàng dưới từng bị cắt khỏi đáy màn.
 */
export function WorkspaceStep({ isLoading, options, selectedId, onSelect }: WorkspaceStepProps) {
  if (isLoading) return <PersonRowsSkeleton label="Đang tải nhóm làm việc" rows={4} />;
  if (options.length === 0) {
    return (
      <EmptyState
        description="Bạn cần tham gia ít nhất một nhóm làm việc trước."
        icon="add-team"
        title="Chưa có nhóm làm việc"
        tone="info"
      />
    );
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-2xs pb-md"
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      {options.map((ws) => {
        const selected = selectedId === ws.id;
        return (
          <Pressable
            key={ws.id}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            className={cn(
              'flex-row items-center gap-sm px-md py-sm active:opacity-70',
              selected && 'bg-bg-primary',
            )}
            onPress={() => {
              if (!selected) hapticSelection();
              onSelect(ws.id);
            }}
          >
            <Avatar
              name={ws.name}
              size="md"
              source={ws.avatarUrl ? { uri: ws.avatarUrl } : undefined}
            />
            <Text className="flex-1 text-label-md font-semibold text-fg-1" numberOfLines={1}>
              {ws.name}
            </Text>
            {selected ? <Icon color="fg-brand" name="checkmark-circle" size={22} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
