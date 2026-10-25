import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { Section } from '@/shared/ui/section';
import { hapticSelection } from '@/shared/utils/haptics';

import type { WorkspaceTemplate } from '../api';
import { TEMPLATE_TILE_TONES } from '../constants/workspace-templates.constants';

export interface TemplateOptionListProps {
  /** Hiện dòng "Không dùng mẫu" (tạo nhóm). Màn áp mẫu cho nhóm đã có luôn chọn một mẫu nên tắt. */
  allowNone: boolean;
  disabled: boolean;
  /** Mã mẫu đang chọn; `null` = "Không dùng mẫu". */
  selectedCode: string | null;
  templates: readonly WorkspaceTemplate[];
  /** Tiêu đề khối (mặc định "Chọn mẫu") — form tạo nhóm đặt "Mẫu nhóm (không bắt buộc)" thay vì chồng thêm một tiêu đề ngoài. */
  title?: string;
  /** `null` = "Không dùng mẫu". */
  onSelect: (template: WorkspaceTemplate | null) => void;
}

const CHECK = <Icon color="fg-brand" label="Đang chọn" name="checkmark-circle" size="sm" />;

/**
 * Danh sách MẪU để chọn MỘT (app.md p5-04 §3 "Không dùng mẫu + 3 thẻ mẫu"): ô icon · tên · mô tả · số kênh. Dựng bằng
 * `ListItem` có `selected` (mẫu của danh sách chọn một giá trị): trình đọc màn hình nghe "đang chọn", và dấu tích nhìn thấy
 * được đi kèm — màu nền không phải dấu hiệu duy nhất.
 *
 * Mỗi mẫu một ô icon có tông (`TEMPLATE_TILE_TONES`, xoay theo vị trí) để các mẫu cạnh nhau tách bạch; "Không dùng mẫu" là ô
 * trung tính (chỉ kênh Chung). Đổi lựa chọn thì rung nhẹ (`hapticSelection`); bấm lại dòng đang chọn thì không.
 */
export function TemplateOptionList({
  allowNone,
  disabled,
  selectedCode,
  templates,
  title = 'Chọn mẫu',
  onSelect,
}: TemplateOptionListProps) {
  function choose(template: WorkspaceTemplate | null): void {
    if ((template?.code ?? null) !== selectedCode) hapticSelection();
    onSelect(template);
  }

  return (
    <Section icon="magic-wand-01" title={title}>
      <Card>
        {allowNone ? (
          <ListItem
            description="Chỉ có kênh Chung — thêm kênh sau."
            disabled={disabled}
            divider
            emphasis="title"
            label="Không dùng mẫu"
            leading={<IconTile name="chat-bubble" size="sm" tone="neutral" />}
            selected={selectedCode === null}
            trailing={selectedCode === null ? CHECK : undefined}
            onPress={() => choose(null)}
          />
        ) : null}
        {templates.map((template, index) => {
          const isSelected = template.code === selectedCode;
          return (
            <ListItem
              key={template.code}
              description={template.description || undefined}
              disabled={disabled}
              divider
              emphasis="title"
              label={template.name}
              leading={
                <IconTile
                  name="magic-wand-01"
                  size="sm"
                  tone={TEMPLATE_TILE_TONES[index % TEMPLATE_TILE_TONES.length]}
                />
              }
              selected={isSelected}
              trailing={isSelected ? CHECK : undefined}
              value={`${template.channels.length} kênh`}
              onPress={() => choose(template)}
            />
          );
        })}
      </Card>
    </Section>
  );
}
