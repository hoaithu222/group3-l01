import { memo } from 'react';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import Badge from '@/shared/ui/primitives/Badge';
import type { SelectedLabel } from './dropdown-tree-select.utils';
import { FIELD_CLEAR_ICON } from '@/shared/ui/inputs/field.theme';

/**
 * DropdownTreeSelectValue — inner content of the trigger button: placeholder,
 * single label or multi chips, plus clear + caret. Kept out of the main file to
 * honour the kit2 component line budget.
 */
interface DropdownTreeSelectValueProps {
  multi: boolean;
  labels: SelectedLabel[];
  placeholder: string;
  clearable: boolean;
  onRemove: (id: string) => void;
  onClear: (event: React.MouseEvent) => void;
  /** Max chip hiển thị inline — dư ra gộp thành "+N". Bỏ trống = hiện hết (wrap). */
  maxDisplay?: number;
}

const DropdownTreeSelectValue = memo(
  ({
    multi,
    labels,
    placeholder,
    clearable,
    onRemove,
    onClear,
    maxDisplay,
  }: DropdownTreeSelectValueProps) => {
    const hasSelection = labels.length > 0;

    // Cắt theo maxDisplay — dư ra hiển thị bằng badge "+N" (tham khảo MultiSelect).
    const visibleLabels = maxDisplay != null ? labels.slice(0, maxDisplay) : labels;
    const overflowCount = maxDisplay != null ? Math.max(0, labels.length - maxDisplay) : 0;

    return (
      <>
        {!hasSelection ? (
          <span className="text-fg-5 flex-1 truncate">{placeholder}</span>
        ) : multi ? (
          <span className="flex flex-wrap gap-1 items-center flex-1 min-w-0">
            {visibleLabels.map((item) => (
              <Badge
                key={item.id}
                className="shrink-0 whitespace-nowrap"
                color="primary"
                endIcon={
                  <span
                    aria-label={`Bỏ chọn ${item.label}`}
                    className="inline-flex items-center justify-center cursor-pointer hover:text-primary-7"
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onRemove(item.id);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <SystemIcon name="xmark-outline" size={FIELD_CLEAR_ICON.chip} />
                  </span>
                }
                variant="tinted"
              >
                {item.label}
              </Badge>
            ))}
            {overflowCount > 0 && (
              <Badge className="shrink-0" color="neutral" variant="tinted">
                +{overflowCount}
              </Badge>
            )}
          </span>
        ) : (
          <span className="flex-1 truncate">{labels[0].label}</span>
        )}

        {clearable && hasSelection && (
          <span
            aria-label="Xoá lựa chọn"
            className="inline-flex shrink-0 text-fg-4 hover:text-fg-2 cursor-pointer"
            role="button"
            tabIndex={-1}
            onClick={onClear}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <SystemIcon name="circle-xmark-outline" size={12} />
          </span>
        )}
        <SystemIcon
          className="size-5 text-fg-4 shrink-0 self-center"
          name="angle-down-outline"
          size={10}
        />
      </>
    );
  },
);

DropdownTreeSelectValue.displayName = 'DropdownTreeSelectValue';

export default DropdownTreeSelectValue;
