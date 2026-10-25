import { useState } from 'react';
import { Text, View } from 'react-native';

import { Select, SelectSheet, type SelectOption } from '@/shared/ui/select';

import type { IntegrationTarget, IntegrationTargetScopeType } from '../api/integrations.types';
import type { TargetChoice } from '../hooks/useIntegrationDraft';
import { useTargetChannels, useTargetGroupChats } from '../queries/integrations.queries';
import { targetLabel } from '../utils/integration-labels';

export interface TargetScopePickerProps {
  wsId: string;
  /** Đích hiện tại (tên `null` khi là kênh/nhóm chat riêng tư người xem không đọc được). */
  current: IntegrationTarget;
  /** Nơi vừa chọn (chưa lưu) — `null` = giữ đích cũ. */
  value: TargetChoice | null;
  disabled?: boolean;
  /** Lỗi `INT_005` hiện NGAY tại trường này. */
  error?: string;
  onChange: (next: TargetChoice) => void;
}

/**
 * Giá trị của `SelectSheet` phải duy nhất trên CẢ HAI danh sách (kênh + nhóm chat): ghép `loại:id` để một id không thể trùng nhau giữa hai loại,
 * và để `onChange` biết ngay người dùng chọn loại nào mà không phải dò cả hai danh sách.
 */
const SEPARATOR = ':';
const encode = (scopeType: IntegrationTargetScopeType, id: string): string =>
  `${scopeType}${SEPARATOR}${id}`;

function decode(value: string): { id: string; scopeType: IntegrationTargetScopeType } | null {
  const cut = value.indexOf(SEPARATOR);
  if (cut < 0) return null;
  const scopeType = value.slice(0, cut);
  if (scopeType !== 'CHANNEL' && scopeType !== 'CONVERSATION') return null;
  return { id: value.slice(cut + 1), scopeType };
}

/**
 * Chọn NƠI NHẬN tin (app.md §2 `TargetScopePicker`): kênh TEXT mình đã tham gia HOẶC nhóm chat (GROUP) của nhóm làm việc này — BE nhận cả hai
 * (`targetScopeType` `CHANNEL`/`CONVERSATION`) và vẫn kiểm quyền ghi lúc lưu (`INT_005`). Hội thoại 1-1 không có trong danh sách (BE từ chối).
 * Chọn kênh riêng tư hoặc nhóm chat (luôn riêng tư) → cảnh báo nội dung tích hợp sẽ hiện với những người trong đó (app.md §7).
 */
export function TargetScopePicker({
  wsId,
  current,
  value,
  disabled,
  error,
  onChange,
}: TargetScopePickerProps) {
  const [open, setOpen] = useState(false);
  const channels = useTargetChannels(wsId, open);
  const groupChats = useTargetGroupChats(wsId, open);
  const shown: TargetChoice = value ?? {
    id: current.scopeId,
    name: current.name ?? '',
    private: current.private,
    scopeType: current.scopeType,
  };

  const options: SelectOption[] = [
    ...(channels.data ?? []).map((c) => ({
      description: c.visibility === 'PRIVATE' ? 'Kênh riêng tư' : 'Kênh',
      label: `#${c.name}`,
      value: encode('CHANNEL', c.id),
    })),
    ...(groupChats.data ?? []).map((c) => ({
      description: 'Nhóm chat',
      label: c.title ?? 'Nhóm chat không tên',
      value: encode('CONVERSATION', c.id),
    })),
  ];
  const loading = open && (channels.isLoading || groupChats.isLoading);
  const failed = channels.isError && groupChats.isError;

  function handleSelect(next: string): void {
    const picked = decode(next);
    if (!picked) return;
    if (picked.scopeType === 'CHANNEL') {
      const c = channels.data?.find((ch) => ch.id === picked.id);
      if (c)
        onChange({
          id: c.id,
          name: c.name,
          private: c.visibility === 'PRIVATE',
          scopeType: 'CHANNEL',
        });
      return;
    }
    const g = groupChats.data?.find((chat) => chat.id === picked.id);
    if (g) onChange({ id: g.id, name: g.title ?? '', private: true, scopeType: 'CONVERSATION' });
  }

  return (
    <View className="gap-2xs">
      <Select
        disabled={disabled}
        label="Nơi nhận thông báo"
        message={error}
        messageTone={error ? 'error' : undefined}
        placeholder="Chọn kênh hoặc nhóm chat"
        value={targetLabel({ name: shown.name || null, scopeType: shown.scopeType })}
        onPress={() => setOpen(true)}
      />
      {shown.private ? (
        <Text className="text-caption-sm text-fg-2">
          {shown.scopeType === 'CONVERSATION'
            ? 'Thông báo sẽ hiển thị với thành viên nhóm chat này.'
            : 'Thông báo sẽ hiển thị với thành viên kênh riêng tư này.'}
        </Text>
      ) : null}
      <SelectSheet
        emptyMessage={
          loading
            ? 'Đang tải danh sách…'
            : failed
              ? 'Không tải được danh sách, thử lại sau.'
              : 'Không tìm thấy kênh hoặc nhóm chat phù hợp.'
        }
        options={options}
        searchable
        searchPlaceholder="Tìm kênh hoặc nhóm chat"
        title="Chọn nơi nhận"
        value={encode(shown.scopeType, shown.id)}
        visible={open}
        onChange={handleSelect}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}
