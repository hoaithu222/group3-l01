import { Text, View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { ListItem } from '@/shared/ui/list';
import { Skeleton } from '@/shared/ui/skeleton';
import { hapticSelection } from '@/shared/utils/haptics';

import type { BoardTemplate } from '../api/boards.types';
import { useBoardTemplates } from '../queries/board-blueprints.queries';

export interface BoardTemplatePickerProps {
  /** Mã mẫu đang chọn (`null` = chưa chọn). */
  selected: string | null;
  onSelect: (template: BoardTemplate) => void;
}

function TemplateOption({
  selected,
  template,
  onSelect,
}: {
  selected: boolean;
  template: BoardTemplate;
  onSelect: (template: BoardTemplate) => void;
}) {
  return (
    <Card>
      <ListItem
        description={template.description}
        emphasis="title"
        label={template.name}
        selected={selected}
        trailing={
          selected ? <Icon color="fg-brand" label="Đang chọn" name="checkmark-circle" /> : undefined
        }
        onPress={() => {
          hapticSelection();
          onSelect(template);
        }}
      />
      {/* Cột và nhãn bằng CHỮ (không chỉ chấm màu) để người chọn biết bảng sẽ có gì trước khi tạo. */}
      <View className="gap-3xs">
        <Text className="text-caption-lg text-fg-2">
          {`${template.columns.length} cột: ${template.columns.map((column) => column.title).join(' · ')}`}
        </Text>
        {template.labels.length > 0 ? (
          <Text className="text-caption-lg text-fg-2">
            {`Nhãn: ${template.labels.map((label) => label.name).join(', ')}`}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

/**
 * Danh sách mẫu bảng dựng sẵn ở màn "Tạo bảng" (p3-02 P1: "Đồ án", "Scrum nhẹ"…), chọn MỘT. Tải khi mở (`GET /board-templates`, dữ liệu
 * tĩnh nên cache dài): khung xương lúc chờ · lỗi + "Thử lại" (thiếu mẫu không chặn cách tạo khác) · rỗng thì nói thẳng. Chọn mẫu chỉ ghi
 * nhớ mã — bảng chỉ tạo khi bấm "Tạo bảng" ở đáy màn.
 */
export function BoardTemplatePicker({ selected, onSelect }: BoardTemplatePickerProps) {
  const templates = useBoardTemplates();

  if (templates.isLoading) {
    return (
      <View className="gap-sm">
        {[0, 1].map((index) => (
          <Skeleton key={index} className="h-28 rounded-md" />
        ))}
      </View>
    );
  }

  if (templates.isError) {
    return (
      <Alert
        actions={
          <Button label="Thử lại" size="xs" variant="secondary" onPress={() => void templates.refetch()} />
        }
        description={toErrorMessage(templates.error)}
        title="Không tải được danh sách mẫu"
        tone="error"
      />
    );
  }

  const items = templates.data ?? [];
  if (items.length === 0) {
    return (
      <Text className="text-body-md text-fg-2">
        {'Chưa có mẫu bảng nào. Hãy chọn "Mặc định" hoặc "Tuỳ chỉnh".'}
      </Text>
    );
  }

  return (
    <View className="gap-sm">
      {items.map((template) => (
        <TemplateOption
          key={template.code}
          selected={template.code === selected}
          template={template}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}
