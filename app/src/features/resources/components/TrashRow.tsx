import { Text, View } from 'react-native';

import { ActionMenu } from '@/shared/ui/action-menu';
import { Button } from '@/shared/ui/button';

import type { TrashEntry } from '../utils/trash-entries';
import { ResourceThumb } from './ResourceThumb';

export interface TrashRowProps {
  busy: boolean;
  canPurge: boolean;
  canRestore: boolean;
  entry: TrashEntry;
  onPurge: (entry: TrashEntry) => void;
  onRestore: (entry: TrashEntry) => void;
}

/**
 * Một mục trong thùng rác: tên, loại, "Còn N ngày", "Khôi phục" (app.md p3-01 §3). Nút CHỈ hiện khi có quyền —
 * ngoại tuyến/ARCHIVED hay MEMBER xem của người khác thì hàng chỉ đọc.
 *
 * ✅ "Khôi phục" là hành động thường dùng nên là nút riêng; "Xoá vĩnh viễn" (không hoàn tác) nằm trong menu "⋯" bên cạnh —
 * trước đây hai nút cùng cỡ đứng sát nhau ở MỖI hàng (xoá vĩnh viễn ngay cạnh khôi phục, một cú chạm trượt là mất tệp).
 * Vào menu rồi vẫn còn hộp thoại xác nhận của màn cha. Nhãn nút "⋯" nêu tên mục để trình đọc màn hình không đọc mười
 * nút y hệt nhau.
 */
export function TrashRow({ busy, canPurge, canRestore, entry, onPurge, onRestore }: TrashRowProps) {
  const showPurge = canPurge && entry.kind === 'resource';

  return (
    <View
      accessibilityLabel={`${entry.name}, ${entry.subtitle}, ${entry.daysLabel}`}
      accessible={!canRestore && !showPurge}
      className="gap-xs border-b-hairline border-divider-1 px-md py-sm"
    >
      <View className="flex-row items-center gap-sm">
        <ResourceThumb
          className="size-4xl rounded-sm"
          icon={entry.icon}
          recyclingKey={entry.key}
          tone={entry.tone}
        />
        <View className="flex-1 gap-3xs">
          <Text className="text-label-md text-fg-1" numberOfLines={2}>
            {entry.name}
          </Text>
          <Text className="text-caption-sm text-fg-2" numberOfLines={1}>
            {entry.subtitle}
          </Text>
          <Text className="text-caption-sm text-fg-2">{entry.daysLabel}</Text>
        </View>
      </View>
      {canRestore || showPurge ? (
        <View className="flex-row items-center justify-end gap-xs">
          {canRestore ? (
            <Button
              accessibilityLabel={`Khôi phục ${entry.name}`}
              disabled={busy}
              label="Khôi phục"
              size="sm"
              variant="secondary"
              onPress={() => onRestore(entry)}
            />
          ) : null}
          {showPurge ? (
            <ActionMenu
              accessibilityLabel={`Thêm thao tác cho ${entry.name}`}
              items={[
                {
                  description: 'Xoá hẳn khỏi kho, không khôi phục được',
                  disabled: busy,
                  icon: 'delete',
                  key: 'purge',
                  label: 'Xoá vĩnh viễn',
                  onPress: () => onPurge(entry),
                  tone: 'danger',
                },
              ]}
              title={entry.name}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
