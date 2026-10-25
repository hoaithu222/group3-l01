import { useCallback, useMemo, useState } from 'react';
import { PickerTrigger, type PickerTriggerSize } from './picker-trigger';
import Popover from '@/shared/ui/overlays/Popover';
import { formatTimeValue, splitTimeValue } from './parse-time.utils';
import { TimeColumn } from './time-column';
import { useTimeInput } from './useTimeInput';

/**
 * TimePicker — CHỌN từ 2 cột (Giờ · Phút) hoặc GÕ THẲNG vào ô.
 *
 * Gõ tay đọc số theo độ dài, đúng thói quen bàn phím số: `1530` → 15:30,
 * `930` → 09:30, `15` → 15:00. Luật đọc + toàn bộ case validate nằm ở
 * `parse-time.utils.ts` (có test khoá hành vi).
 *
 * Ngừng gõ `commitDelay` ms là tự validate + lưu, khỏi cần Enter — chi tiết ba
 * đường chốt giá trị xem `useTimeInput.ts`.
 *
 * Giá trị là chuỗi "HH:mm" (24h). Trigger/footer dùng chung hệ date-picker.
 */
export type TimePickerSize = PickerTriggerSize;

export interface TimePickerProps {
  /** Giá trị "HH:mm" (24h). */
  value?: string | null;
  onChange?: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  size?: TimePickerSize;
  className?: string;
  /** Bước phút trong DANH SÁCH chọn (mặc định 1). KHÔNG ràng buộc giá trị gõ tay. */
  minuteStep?: number;
  /** Cho phép gõ giờ trực tiếp vào ô. Mặc định true. */
  allowManualInput?: boolean;
  /** Focus ô ngay khi mount (vd. vừa vào chế độ sửa trên lưới) — tự mở panel luôn. */
  autoFocus?: boolean;
  /** Báo lỗi cú pháp lên trên (form dùng để hiện message dưới field). `null` = hợp lệ. */
  onParseError?: (message: string | null) => void;
  /**
   * Số ms ngừng gõ thì tự validate + lưu, khỏi cần Enter. Mặc định 500.
   * Đặt `0` để tắt — khi đó chỉ Enter / rời ô mới chốt.
   */
  commitDelay?: number;
  /**
   * ── Trợ năng: nối với nhãn nằm NGOÀI component ────────────────────────────
   * Phần tử tương tác ở đây là `<button>` / `<div>`, không phải `<input>` thật,
   * nên `<label htmlFor>` một mình không đủ để trình đọc màn hình đọc ra tên ô.
   * Nơi dùng (vd các `*Field` của kit2 form) truyền `aria-labelledby` trỏ vào id
   * của nhãn. Tất cả đều OPTIONAL — không truyền thì hành vi y hệt trước đây.
   */
  id?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

function TimePicker({
  value,
  onChange,
  placeholder = 'HH:mm',
  disabled = false,
  invalid = false,
  size,
  className,
  minuteStep = 1,
  allowManualInput = true,
  autoFocus = false,
  onParseError,
  commitDelay = 500,
  id,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  // Popover portal ra body sẽ nằm NGOÀI subtree của Radix Dialog → RemoveScroll
  // (scroll-lock của Modal) chặn wheel. Portal thẳng vào DialogContent để cột
  // giờ/phút cuộn được khi TimePicker nằm trong Modal.
  const [container, setContainer] = useState<HTMLElement | null>(null);

  const { hour: selHour, minute: selMinute } = useMemo(() => splitTimeValue(value), [value]);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutes = useMemo(
    () =>
      Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep).filter(
        (m) => m < 60,
      ),
    [minuteStep],
  );

  const closePanel = useCallback(() => setOpen(false), []);

  const { parseError, reset, handleInputChange, handleInputCommit } = useTimeInput({
    commitDelay,
    onCommit: (next) => onChange?.(next),
    onParseError,
    onSettled: closePanel,
  });

  const pickHour = useCallback(
    (h: number) => {
      onChange?.(formatTimeValue(h, selMinute ?? 0));
      reset();
    },
    [onChange, selMinute, reset],
  );

  const pickMinute = useCallback(
    (m: number) => {
      onChange?.(formatTimeValue(selHour ?? 0, m));
      reset();
    },
    [onChange, selHour, reset],
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange?.(null);
      reset();
    },
    [onChange, reset],
  );

  const handleOpenChange = useCallback((next: boolean) => {
    if (next) {
      setContainer(
        (document.querySelector('[role="dialog"][data-state="open"]') as HTMLElement) ?? null,
      );
    }
    setOpen(next);
  }, []);

  return (
    <Popover
      align="start"
      className="w-44 p-0"
      container={container}
      content={
        <>
          <div className="flex">
            <TimeColumn
              className="border-r border-divider-2"
              items={hours}
              label="Giờ"
              value={selHour}
              onPick={pickHour}
            />
            <TimeColumn items={minutes} label="Phút" value={selMinute} onPick={pickMinute} />
          </div>
          {parseError && (
            <p className="border-t border-divider-2 px-3 py-2 text-caption-12 text-error">
              {parseError}
            </p>
          )}
        </>
      }
      disabled={disabled}
      open={open}
      sideOffset={6}
      onOpenAutoFocus={(e) => e.preventDefault()}
      onOpenChange={disabled ? undefined : handleOpenChange}
    >
      <PickerTrigger
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-labelledby={ariaLabelledBy}
        autoFocus={autoFocus}
        canClear={!!value && !disabled}
        className={className}
        disabled={disabled}
        displayText={value ?? ''}
        editable={allowManualInput}
        icon={null}
        id={id}
        inputError={!!parseError}
        invalid={invalid}
        open={open}
        placeholder={placeholder}
        size={size}
        onClear={handleClear}
        onInputChange={handleInputChange}
        onInputCommit={handleInputCommit}
        onRequestOpen={() => !disabled && handleOpenChange(true)}
      />
    </Popover>
  );
}

export default TimePicker;
