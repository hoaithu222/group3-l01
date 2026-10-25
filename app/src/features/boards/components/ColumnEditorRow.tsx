import { Text, View } from 'react-native';

import { ActionMenu } from '@/shared/ui/action-menu';
import { Chip } from '@/shared/ui/chip';
import { Icon } from '@/shared/ui/icon';
import { Input } from '@/shared/ui/input';

import { COLUMN_KIND_ART, COLUMN_KIND_LABEL, COLUMN_KINDS } from '../constants/kanban.constants';
import type { ColumnDraft } from '../utils/columns-draft';

export interface ColumnEditorRowProps {
  canMoveDown: boolean;
  canMoveUp: boolean;
  disabled: boolean;
  draft: ColumnDraft;
  index: number;
  titleMax: number;
  onChange: (patch: Partial<Pick<ColumnDraft, 'kind' | 'title' | 'wipLimit'>>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

/**
 * MỘT dòng trong `ColumnsEditor`: tên · loại (TODO/IN_PROGRESS/REVIEW/DONE) ·
 * giới hạn WIP · menu "⋯" (Đưa lên/Đưa xuống/Xoá). Sắp xếp bằng lệnh Lên/Xuống chứ không kéo thả
 * (`app.md` §2 `ColumnsEditor`) — dùng được bằng một tay và trình đọc màn hình.
 *
 * Ô tên/WIP là UNCONTROLLED (`defaultValue`, key theo `draft.key`) — cùng luật
 * IME-safe với ô tìm kiếm.
 */
export function ColumnEditorRow({
  canMoveDown,
  canMoveUp,
  disabled,
  draft,
  index,
  titleMax,
  onChange,
  onMove,
  onRemove,
}: ColumnEditorRowProps) {
  return (
    <View className="gap-xs rounded-sm border-hairline border-border-1 bg-bg-1 p-sm">
      <View className="flex-row items-center gap-xs">
        <Text className="text-label-md font-semibold text-fg-2">{`${index + 1}.`}</Text>
        <View className="flex-1">
          <Input
            accessibilityLabel={`Tên cột ${index + 1}`}
            defaultValue={draft.title}
            disabled={disabled}
            maxLength={titleMax}
            placeholder="Tên cột"
            onChangeText={(title) => onChange({ title })}
          />
        </View>
        {/* Lên/Xuống/Xoá gom vào MỘT menu "⋯" (`ActionMenu`) — ba nút icon cạnh nhau, có nút Xoá đỏ sát nút Lên/Xuống, dễ bấm nhầm và chiếm hàng riêng. */}
        <ActionMenu
          accessibilityLabel={`Tuỳ chọn cột ${index + 1}`}
          items={[
            { disabled: !canMoveUp, hidden: disabled, icon: 'arrow-up-small', key: 'up', label: 'Đưa lên', onPress: () => onMove(-1) },
            { disabled: !canMoveDown, hidden: disabled, icon: 'arrow-down-small', key: 'down', label: 'Đưa xuống', onPress: () => onMove(1) },
            { hidden: disabled, icon: 'delete', key: 'delete', label: 'Xoá cột', onPress: onRemove, tone: 'danger' },
          ]}
          title={draft.title.trim() || `Cột ${index + 1}`}
        />
      </View>

      <View className="flex-row flex-wrap gap-xs">
        {COLUMN_KINDS.map((kind) => (
          <Chip
            key={kind}
            disabled={disabled}
            label={COLUMN_KIND_LABEL[kind]}
            // Cùng icon với đầu cột Kanban (`COLUMN_KIND_ART`) — chọn loại ở đây là thấy trước cột sẽ trông thế nào.
            leading={<Icon color={disabled ? 'fg-2' : 'fg-brand'} name={COLUMN_KIND_ART[kind].icon} size="sm" />}
            role="radio"
            selected={draft.kind === kind}
            size="sm"
            onPress={() => onChange({ kind })}
          />
        ))}
      </View>

      {/* Nhãn hiện + gợi ý ngắn: placeholder dài cũ ("… bỏ trống = không giới hạn") bị cắt trong ô hẹp cạnh ba nút, và biến mất khi gõ. */}
      <Input
        accessibilityLabel={`Giới hạn số thẻ cột ${index + 1}`}
        defaultValue={draft.wipLimit}
        digitsOnly
        disabled={disabled}
        keyboardType="number-pad"
        label="Giới hạn số thẻ"
        maxLength={3}
        placeholder="Không giới hạn"
        onChangeText={(wipLimit) => onChange({ wipLimit })}
      />
    </View>
  );
}
