import { View } from 'react-native';

import type { TemplateSelection } from '@/shared/workspace-templates';

import type { WorkspaceTemplate } from '../api';
import { selectTemplate, toggleChannelKey } from '../utils/selection';
import type { SkipPlan } from '../utils/skip-plan';
import { TemplateChannelList } from './TemplateChannelList';
import { TemplateOptionList } from './TemplateOptionList';

export interface TemplatePickerProps {
  /** Hiện "Không dùng mẫu" — form TẠO NHÓM. Màn áp mẫu cho nhóm đã có tắt nó. */
  allowNone?: boolean;
  disabled?: boolean;
  /** Tiêu đề khối chọn mẫu (mặc định "Chọn mẫu") — xem `TemplateOptionList.title`. */
  optionsTitle?: string;
  /** Kênh dự kiến bị bỏ qua của mẫu ĐANG chọn (màn áp mẫu). */
  skips?: SkipPlan;
  templates: readonly WorkspaceTemplate[];
  /** Mẫu + kênh đang chọn; `null` = "Không dùng mẫu". */
  value: TemplateSelection | null;
  onChange: (value: TemplateSelection | null) => void;
}

/**
 * Bộ chọn mẫu nhóm (app.md p5-04 §2 `TemplatePicker`): danh sách mẫu (chọn một) → kênh của mẫu đó với ô tick. Chọn mẫu thì
 * tick sẵn đúng các kênh `defaultSelected`; bỏ tick là bỏ kênh khỏi `channelKeys` gửi lên. Component THUẦN, controlled: state
 * nằm ở nơi gọi (form tạo nhóm giữ nó cùng `Idempotency-Key`; màn áp mẫu giữ cùng phần khoá idempotency).
 */
export function TemplatePicker({
  allowNone = true,
  disabled = false,
  optionsTitle,
  skips,
  templates,
  value,
  onChange,
}: TemplatePickerProps) {
  const selected = templates.find((template) => template.code === value?.code) ?? null;

  return (
    // `gap-xl` (24): hai khối có tiêu đề riêng (`Section`) — cùng nhịp khe giữa hai khối của mọi màn (`screen-layout.md`).
    <View className="gap-xl">
      <TemplateOptionList
        allowNone={allowNone}
        disabled={disabled}
        selectedCode={selected?.code ?? null}
        templates={templates}
        title={optionsTitle}
        onSelect={(template) => onChange(template ? selectTemplate(template) : null)}
      />
      {selected && value ? (
        <TemplateChannelList
          channels={selected.channels}
          checkedKeys={value.channelKeys}
          disabled={disabled}
          skips={skips}
          onToggle={(key, checked) => onChange(toggleChannelKey(selected, value, key, checked))}
        />
      ) : null}
    </View>
  );
}
