import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Icon, type IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { formatDate } from '@/shared/utils/format/date.utils';

import type { BoardLabel } from '../../api/boards.types';
import type { TaskDetailDto } from '../../api/task-detail.types';
import { dueLabel } from '../../utils/task-format';
import { TaskLabels } from '../kanban/TaskLabels';

export type PropertyKind = 'assignees' | 'dates' | 'labels' | 'points';

export interface TaskPropertyRowProps {
  canEdit: boolean;
  detail: TaskDetailDto;
  labels: ReadonlyMap<string, BoardLabel>;
  onOpen: (kind: PropertyKind) => void;
}

interface RowProps {
  children: ReactNode;
  disabled: boolean;
  icon: IconName;
  /** Câu đọc đầy đủ: "Người làm: Lan, Minh. Chạm để thay đổi" (app.md §7). */
  spoken: string;
  title: string;
  /** Tông ô icon — mỗi thuộc tính một tông để mắt quét nhanh (trang trí; nhãn chữ bên cạnh mới là nghĩa). */
  tone: IconTileTone;
  onPress: () => void;
}

function Row({ children, disabled, icon, spoken, title, tone, onPress }: RowProps) {
  return (
    <Pressable
      accessibilityHint={disabled ? undefined : 'Chạm để thay đổi'}
      accessibilityLabel={spoken}
      accessibilityRole={disabled ? 'text' : 'button'}
      className="min-h-[44px] flex-row items-center gap-sm rounded-xs px-2xs py-xs active:opacity-70"
      disabled={disabled}
      onPress={onPress}
    >
      <IconTile name={icon} size="sm" tone={tone} />
      <Text className="w-20 text-label-md text-fg-2" maxFontSizeMultiplier={1.3}>
        {title}
      </Text>
      <View className="flex-1 items-start">{children}</View>
    </Pressable>
  );
}

/**
 * Các thuộc tính của thẻ: người làm · nhãn · ngày · điểm (app.md §2 `TaskPropertyRow`). Mỗi hàng bấm được
 * (khi có quyền sửa) để mở tấm chọn tương ứng; trên tablet nằm ở cột phải. Quá hạn có CHỮ "Quá hạn" +
 * icon cảnh báo chứ không chỉ màu đỏ (`app.md` §7).
 */
export function TaskPropertyRow({ canEdit, detail, labels, onOpen }: TaskPropertyRowProps) {
  const disabled = !canEdit;
  const names = detail.assignees.map((person) => person.name).join(', ');
  const start = detail.startDate ? formatDate(detail.startDate) : null;
  const due = dueLabel(detail);
  const dates = [start ? `Bắt đầu ${start}` : null, due ? `Hạn ${due}` : null]
    .filter(Boolean)
    .join(', ');
  const empty = (
    <Text className="text-body-md text-fg-2">{canEdit ? 'Chạm để thêm' : 'Chưa có'}</Text>
  );

  return (
    <View>
      <Row
        disabled={disabled}
        icon="user"
        spoken={`Người làm: ${names || 'chưa giao'}`}
        title="Người làm"
        tone="brand"
        onPress={() => onOpen('assignees')}
      >
        {detail.assignees.length === 0 ? (
          empty
        ) : (
          <View className="flex-row flex-wrap items-center gap-xs">
            {detail.assignees.map((person) => (
              <View key={person.id} className="max-w-full flex-row items-center gap-2xs">
                <Avatar
                  name={person.name}
                  size="xs"
                  source={person.avatarUrl ? { uri: person.avatarUrl } : undefined}
                />
                {/* `shrink`: `Text` của RN mặc định không co — tên dài đẩy hàng ra ngoài mép thay vì xuống dòng. */}
                <Text className="shrink text-body-md text-fg-1">{person.name}</Text>
              </View>
            ))}
          </View>
        )}
      </Row>
      <Row
        disabled={disabled}
        icon="discount"
        spoken={`Nhãn: ${
          detail.labelIds.length === 0
            ? 'chưa có'
            : detail.labelIds
                .map((id) => labels.get(id)?.name)
                .filter(Boolean)
                .join(', ')
        }`}
        title="Nhãn"
        tone="accent"
        onPress={() => onOpen('labels')}
      >
        {detail.labelIds.length === 0 ? (
          empty
        ) : (
          <TaskLabels labelIds={detail.labelIds} labels={labels} />
        )}
      </Row>
      <Row
        disabled={disabled}
        icon="calendar"
        spoken={`Ngày: ${dates || 'chưa đặt'}`}
        title="Ngày"
        tone="info"
        onPress={() => onOpen('dates')}
      >
        {dates ? (
          <View className="gap-3xs">
            {start ? <Text className="text-body-md text-fg-1">{`Bắt đầu ${start}`}</Text> : null}
            {due ? (
              <View className="max-w-full flex-row items-center gap-2xs">
                {detail.isOverdue ? <Icon color="error" name="alert-warning" size={16} /> : null}
                <Text
                  className={
                    detail.isOverdue
                      ? 'shrink text-body-md font-semibold text-error'
                      : 'shrink text-body-md text-fg-1'
                  }
                >
                  {`Hạn ${due}`}
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          empty
        )}
      </Row>
      <Row
        disabled={disabled}
        icon="star"
        spoken={`Điểm: ${detail.storyPoints ?? 'chưa ước lượng'}`}
        title="Điểm"
        tone="warning"
        onPress={() => onOpen('points')}
      >
        {detail.storyPoints === null ? (
          empty
        ) : (
          <Text className="text-body-md text-fg-1">{String(detail.storyPoints)}</Text>
        )}
      </Row>
    </View>
  );
}
