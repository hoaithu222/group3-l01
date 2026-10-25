import { memo, useCallback, useMemo, useRef, useState } from 'react';

import Divider from '@/shared/ui/primitives/Divider';
import Input from './Input';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { cn } from '@/shared/utils/style/cn';
import { generateDistinctHexColor } from '@/shared/utils/style/color-hsl.utils';

/** Preset mặc định (legacy 8-hex) — dùng khi caller không truyền `preset`. */
const DEFAULT_PRESET: readonly string[] = [
  '#06B6D4',
  '#3B82F6',
  '#0EA5E9',
  '#22C55E',
  '#F59E0B',
  '#F26410',
  '#F43F5E',
  '#8B5CF6',
];

const FALLBACK = '#06B6D4';
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export interface ColorPalettePanelProps {
  /** Hex đang chọn. Rỗng/không hợp lệ → coi như chưa chọn. */
  value?: string | null;
  onChange: (hex: string) => void;
  /** Danh sách hex preset. Bỏ trống → 8 hex mặc định. */
  preset?: readonly string[];
  /** Hex đã dùng bởi bản ghi khác → nút bị khoá + dấu ✕. */
  usedColors?: readonly string[];
  /** Nút gợi ý màu ngẫu nhiên (dùng khi số bản ghi vượt quá bảng màu). */
  showRandomSuggest?: boolean;
  /** Nhãn tooltip cho ô màu đã bị chiếm. */
  takenLabel?: string;
  className?: string;
}

/**
 * Bảng chọn màu — lưới preset + màu tuỳ chỉnh (native picker · ô hex · gợi ý ngẫu nhiên).
 *
 * Tách khỏi `ColorPickerField` để dùng được ở NGOÀI react-hook-form: cùng một bảng
 * màu phải dùng chung cho field trong form (màu thẻ đơn vị) và cho từng dòng trong
 * danh sách (màu mũi thi công) — nơi không có RHF context và mỗi dòng là một bản ghi
 * riêng chứ không phải một field.
 */
const ColorPalettePanel = memo(function ColorPalettePanel({
  value,
  onChange,
  preset,
  usedColors,
  showRandomSuggest,
  takenLabel = 'Màu đã được sử dụng',
  className,
}: ColorPalettePanelProps) {
  const current = HEX_RE.test(value ?? '') ? value!.toUpperCase() : '';
  const [hexDraft, setHexDraft] = useState(current);
  const nativeRef = useRef<HTMLInputElement>(null);

  const activePreset = useMemo(() => preset ?? DEFAULT_PRESET, [preset]);
  const usedSet = useMemo(
    () => new Set((usedColors ?? []).map((hex) => hex.toUpperCase())),
    [usedColors],
  );

  const commit = useCallback(
    (hex: string) => {
      const normalized = hex.toUpperCase();
      setHexDraft(normalized);
      onChange(normalized);
    },
    [onChange],
  );

  const handleHexInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setHexDraft(raw);
      if (HEX_RE.test(raw)) onChange(raw.toUpperCase());
    },
    [onChange],
  );

  const handleHexBlur = useCallback(() => {
    if (!HEX_RE.test(hexDraft)) setHexDraft(current);
  }, [hexDraft, current]);

  const handleRandom = useCallback(
    () => commit(generateDistinctHexColor([...usedSet])),
    [commit, usedSet],
  );

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="grid grid-cols-8 justify-items-center gap-1.5">
        {activePreset.map((hex) => {
          const upper = hex.toUpperCase();
          const active = current === upper;
          const takenByOther = usedSet.has(upper) && !active;
          return (
            <button
              key={hex}
              className={cn(
                // Cỡ CỐ ĐỊNH: panel dùng ở nhiều popover rộng hẹp khác nhau, để
                // `w-full` thì ô màu phình theo bề rộng vật chứa.
                'flex size-6 items-center justify-center rounded-full border-2 transition-transform active:scale-90',
                takenByOther
                  ? 'cursor-not-allowed border-transparent opacity-35'
                  : 'cursor-pointer',
                active && 'border-neutral-0/70',
                !active && !takenByOther && 'border-transparent hover:border-neutral-0/30',
              )}
              disabled={takenByOther}
              style={{ backgroundColor: hex }}
              title={takenByOther ? takenLabel : upper}
              type="button"
              onClick={() => commit(hex)}
            >
              {active && <SystemIcon className="text-neutral-0" name="check-outline" size={11} />}
              {takenByOther && (
                <SystemIcon className="text-neutral-0" name="xmark-outline" size={11} />
              )}
            </button>
          );
        })}
      </div>

      <Divider variant="dashed" />

      {/* Màu tuỳ chỉnh: native picker + ô hex + gợi ý ngẫu nhiên */}
      <div className="flex items-center gap-2">
        <div className="relative shrink-0">
          <button
            className="flex size-6 cursor-pointer items-center justify-center rounded-full border border-dashed border-border-2 bg-bg-2 text-fg-4 transition-colors hover:border-primary-4 hover:text-primary-5"
            title="Chọn màu tùy chỉnh"
            type="button"
            onClick={() => nativeRef.current?.click()}
          >
            <SystemIcon name="plus-outline" size={11} />
          </button>
          <input
            ref={nativeRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 size-0 opacity-0"
            tabIndex={-1}
            type="color"
            value={hexDraft || current || FALLBACK}
            onChange={(e) => commit(e.target.value)}
          />
        </div>

        <Input
          maxLength={7}
          placeholder={current || FALLBACK}
          size="sm"
          value={hexDraft}
          onBlur={handleHexBlur}
          onChange={handleHexInput}
        />

        {showRandomSuggest && (
          <button
            className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border-2 bg-bg-2 text-fg-4 transition-colors hover:border-primary-4 hover:text-primary-5"
            title="Gợi ý màu ngẫu nhiên (tránh trùng)"
            type="button"
            onClick={handleRandom}
          >
            <SystemIcon name="arrows-rotate-outline" size={11} />
          </button>
        )}
      </div>

      {usedSet.has(current) && <p className="text-caption-12 text-warning">{takenLabel}.</p>}
    </div>
  );
});

export default ColorPalettePanel;
