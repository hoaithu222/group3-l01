import { memo, useCallback, useState } from 'react';

import ColorPalettePanel from '@/shared/ui/inputs/ColorPalettePanel';
import Popover from '@/shared/ui/overlays/Popover';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { cn } from '@/shared/utils/style/cn';

import FormItem from '../FormItem';
import { useFormField } from '../hooks/useFormField';
import { useFieldA11y } from '../hooks/useFieldA11y';
import { FIELD_HEIGHT, fieldSurface } from '@/shared/ui/inputs/field.theme';

const FALLBACK = '#06B6D4';
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

const normalizeHex = (v: unknown): string => {
  if (typeof v === 'string' && HEX_RE.test(v)) return v.toUpperCase();
  return FALLBACK;
};

export interface ColorPickerFieldProps {
  name: string;
  label?: string;
  required?: boolean;
  description?: string;
  disabled?: boolean;
  className?: string;
  /** Danh sách hex preset. Bỏ trống → 8 hex mặc định của panel. */
  preset?: readonly string[];
  /** Hex đã dùng bởi entity khác → disable button trong grid. */
  usedColors?: readonly string[];
  /** Hiển thị nút gợi ý màu random (dùng khi vượt palette). */
  showRandomSuggest?: boolean;
}

/**
 * ColorPickerField — bản tích hợp RHF của bảng chọn màu.
 *
 * Trigger: swatch tròn + mã hex. Nội dung popover là `ColorPalettePanel` dùng chung
 * (lưới preset + màu tuỳ chỉnh + gợi ý ngẫu nhiên) — cùng bảng màu đó còn được dùng
 * cho danh sách mũi thi công, nơi không có RHF context.
 */
function ColorPickerField({
  name,
  label,
  required,
  description,
  disabled,
  className,
  preset,
  usedColors,
  showRandomSuggest,
}: ColorPickerFieldProps) {
  const { field, fieldState, readOnly } = useFormField(name);
  const error = fieldState.error?.message;
  const a11y = useFieldA11y({ label, description, error });
  const [open, setOpen] = useState(false);

  const value = normalizeHex(field.value);

  const handleOpenChange = useCallback((o: boolean) => setOpen(o), []);

  const commit = useCallback((hex: string) => field.onChange(hex.toUpperCase()), [field]);

  if (readOnly) {
    return (
      <FormItem className={className} label={label}>
        <div className="flex items-center gap-2 py-2">
          <span
            className="size-4 shrink-0 rounded-full border border-border-2"
            style={{ backgroundColor: value }}
          />
          <span className="font-mono text-body-14 text-fg-1">{value}</span>
        </div>
      </FormItem>
    );
  }

  const popoverContent = (
    <div className="w-64 p-3">
      <ColorPalettePanel
        preset={preset}
        showRandomSuggest={showRandomSuggest}
        takenLabel="Đã được dùng bởi đơn vị khác"
        usedColors={usedColors}
        value={value}
        onChange={commit}
      />
    </div>
  );

  return (
    <FormItem
      {...a11y.item}
      className={className}
      description={description}
      error={error}
      label={label}
      required={required}
    >
      <Popover
        align="start"
        content={popoverContent}
        disabled={disabled}
        open={open}
        side="bottom"
        sideOffset={4}
        variant="glass"
        onOpenChange={handleOpenChange}
      >
        <button
          {...a11y.trigger}
          aria-label={label ? undefined : 'Chọn màu thẻ đơn vị'}
          className={cn(
            fieldSurface({ focusMode: 'trigger', invalid: Boolean(error) }),
            'inline-flex cursor-pointer items-center gap-2 px-3',
            'disabled:cursor-not-allowed disabled:opacity-50',
            FIELD_HEIGHT.md,
          )}
          disabled={disabled}
          type="button"
        >
          <span
            className="size-4 shrink-0 rounded-full border border-border-2"
            style={{ backgroundColor: value }}
          />
          <span className="flex-1 text-left font-mono tabular-nums text-body-14 text-fg-1">
            {value}
          </span>
          <SystemIcon className="shrink-0 text-fg-4" name="angle-down-outline" size={14} />
        </button>
      </Popover>
    </FormItem>
  );
}

export default memo(ColorPickerField);
