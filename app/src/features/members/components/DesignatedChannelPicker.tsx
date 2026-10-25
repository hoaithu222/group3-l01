import { Text, View } from 'react-native';

import { Checkbox } from '@/shared/ui/checkbox';
import { EmptyState } from '@/shared/ui/empty-state';
import { Skeleton } from '@/shared/ui/skeleton';

import { GUEST_CHANNELS_MAX, type GuestChannelOption } from '../api';

export interface DesignatedChannelPickerProps {
  disabled?: boolean;
  /** Lỗi cấp trường (vd BE trả "kênh riêng tư không quản lý") — hiện ngay dưới danh sách. */
  error?: string;
  isLoading?: boolean;
  max?: number;
  onChange: (ids: string[]) => void;
  options: readonly GuestChannelOption[];
  selectedIds: readonly string[];
}

/**
 * Chọn kênh khách được vào (app.md p3-04 §2), ≥ 1 và ≤ `max`.
 *
 * ⚠️ Danh sách kênh (p1-03) không cho biết mình có QUẢN LÝ một kênh riêng tư hay
 * không, nên kênh riêng tư vẫn chọn được và có chú thích "cần quyền quản lý" —
 * BE mới là nơi từ chối (mã lỗi ở `INVITATION_ERROR.CHANNEL_NOT_MANAGED`), màn
 * hiện lỗi thay vì đoán quyền ở client.
 */
export function DesignatedChannelPicker({
  disabled,
  error,
  isLoading,
  max = GUEST_CHANNELS_MAX,
  onChange,
  options,
  selectedIds,
}: DesignatedChannelPickerProps) {
  const selected = new Set(selectedIds);
  const atLimit = selected.size >= max;

  function toggle(id: string): void {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  }

  return (
    <View className="gap-xs">
      <View className="flex-row items-center justify-between gap-sm">
        <Text className="text-label-md text-fg-1">Kênh khách được vào</Text>
        <Text className="text-caption-sm text-fg-2">
          {selected.size}/{max}
        </Text>
      </View>

      {isLoading ? (
        <View className="gap-xs">
          <Skeleton className="h-10 rounded-md" />
          <Skeleton className="h-10 rounded-md" />
        </View>
      ) : options.length === 0 ? (
        <EmptyState
          description="Hãy tạo một kênh trong nhóm trước, rồi quay lại mời khách vào đúng kênh đó."
          icon="chat-bubble"
          size="compact"
          title="Chưa có kênh phù hợp"
          tone="info"
        />
      ) : (
        <View className="gap-2xs">
          {options.map((channel) => {
            const isPrivate = channel.visibility === 'PRIVATE';
            const checked = selected.has(channel.id);
            return (
              <Checkbox
                key={channel.id}
                accessibilityLabel={`${channel.name}${isPrivate ? ', kênh riêng tư' : ''}`}
                checked={checked}
                disabled={disabled || (!checked && atLimit)}
                label={
                  <View className="gap-3xs">
                    <Text className="text-body-md text-fg-1">{channel.name}</Text>
                    {isPrivate ? (
                      <Text className="text-caption-sm text-fg-2">Riêng tư · cần quyền quản lý kênh</Text>
                    ) : null}
                  </View>
                }
                onChange={() => toggle(channel.id)}
              />
            );
          })}
        </View>
      )}

      {error ? <Text className="text-caption-sm text-error">{error}</Text> : null}
    </View>
  );
}
