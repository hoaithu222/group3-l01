import { useEffect, useRef, useState, type FocusEvent } from 'react';
import { cn } from '@/shared/utils/style/cn';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { FIELD_HEIGHT, fieldSurface } from '@/shared/ui/inputs/field.theme';

/** Size axis (kit2 form standard): sm=32 / md=36 / lg=40 px height. */
export type PickerTriggerSize = 'sm' | 'md' | 'lg';

// Extends HTMLAttributes so Radix `asChild` / Slot can inject onClick, aria-*, ref, etc.
interface PickerTriggerProps extends React.HTMLAttributes<HTMLDivElement> {
  open: boolean;
  disabled: boolean;
  invalid?: boolean;
  displayText: string;
  placeholder: string;
  canClear: boolean;
  onClear: (e: React.MouseEvent) => void;
  size?: PickerTriggerSize;
  /**
   * Icon đầu trigger — mặc định calendar (date), có thể đổi (vd clock cho time).
   * Truyền `null` để KHÔNG hiện icon nào, nhường hết bề ngang cho chữ.
   */
  icon?: React.ComponentProps<typeof SystemIcon>['name'] | null;

  /** Enable inline manual typing inside the trigger. Default false. */
  editable?: boolean;
  /**
   * Fires on every keystroke when editable.
   *
   * Trả về `string` để VIẾT LẠI chữ đang hiện trong ô — dùng cho auto-format
   * lúc gõ (vd TimePicker: gõ đủ `1530` là ô đổi ngay thành `15:30`). Trả
   * `void` thì giữ nguyên chữ người dùng gõ.
   */
  onInputChange?: (raw: string) => string | void;
  /**
   * Fires on Enter or blur — caller parses + decides whether to commit.
   *
   * Trả về `string` (dạng chuẩn) để chuẩn hoá lại chữ trong ô sau khi chốt.
   * BẮT BUỘC với phím Enter: lúc đó ô VẪN đang focus nên `useEffect` đồng bộ
   * `displayText` bên dưới cố tình bỏ qua — không trả thì ô kẹt ở chữ thô
   * người dùng vừa gõ dù giá trị đã chốt đúng.
   */
  onInputCommit?: (raw: string) => string | void;
  /** Show invalid-state styling for the typed text. */
  inputError?: boolean;
  /** Called when user focuses the input (click or keyboard tab) — used to open the popover. */
  onRequestOpen?: () => void;
  /** Focus input ngay khi mount (vd. vừa vào chế độ sửa trên lưới) — tự mở popover luôn. */
  autoFocus?: boolean;
}

export function PickerTrigger({
  open,
  disabled,
  invalid,
  displayText,
  placeholder,
  canClear,
  onClear,
  size = 'md',
  editable = false,
  onInputChange,
  onInputCommit,
  inputError = false,
  onRequestOpen,
  icon = 'calendar-outline',
  autoFocus = false,
  className,
  id,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  ...rest // onClick (Radix toggle), data-*, ref from Radix Slot
}: PickerTriggerProps) {
  // Internal buffer so the user can type freely while parent value is "stale"
  // (commit happens on Enter/blur). Sync from displayText only when not focused.
  const inputRef = useRef<HTMLInputElement>(null);
  const [buffer, setBuffer] = useState(displayText);

  useEffect(() => {
    if (!editable) return;
    const focused = document.activeElement === inputRef.current;

    if (!focused) setBuffer(displayText);
  }, [displayText, editable]);

  const isError = invalid || inputError;

  /**
   * ── Tên trợ năng phải bám phần tử NHẬN FOCUS ─────────────────────────────
   * Ở chế độ gõ tay (`editable`), thứ người dùng Tab tới là `<input>` bên
   * trong — wrapper chỉ là `<div>`, không focus được. Gắn `aria-labelledby`
   * lên wrapper thì trình đọc màn hình vẫn đọc ô nhập KHÔNG TÊN. Nên id/aria
   * đi theo phần tử thật: `editable` → `<input>`, còn lại → wrapper (chính nó
   * là trigger của popover). Vì vậy nhóm prop này được rút khỏi `...rest`.
   */
  const a11yProps = {
    id,
    'aria-labelledby': ariaLabelledBy,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid ?? (isError || undefined),
  };

  /** Chốt giá trị rồi ghi lại ô bằng dạng chuẩn caller trả về (nếu có). */
  const commit = (raw: string) => {
    const normalized = onInputCommit?.(raw);
    if (typeof normalized === 'string') setBuffer(normalized);
  };

  const handleInputBlur = (e: FocusEvent<HTMLInputElement>) => {
    // Skip commit when focus moves INTO the calendar popover (day pick, nav
    // buttons). The popover's own handler owns committing the picked value.
    const next = e.relatedTarget as HTMLElement | null;
    if (next && next.closest('[data-radix-popper-content-wrapper]')) return;
    commit(buffer);
  };

  return (
    <div
      {...rest} // Radix onClick is here — opens the popover when wrapper clicked.
      {...(editable ? {} : a11yProps)}
      className={cn(
        'flex items-center gap-2 px-3 select-none text-body-14',
        FIELD_HEIGHT[size],
        editable ? 'cursor-text' : 'cursor-pointer',
        // Đặt SAU cursor-* để `cursor-not-allowed` của state disabled thắng.
        fieldSurface({ focusMode: 'trigger', invalid: isError, disabled }),
        className,
      )}
      // Cùng "kênh" focus với Dropdown/MultiSelect/TreeSelect: `fieldSurface`
      // (focusMode 'trigger') nối `data-[state=open]` vào đúng viền + ring 2px.
      // Radix Popover.Trigger (asChild) cũng inject data-state, nhưng đặt sau
      // {...rest} để prop `open` của picker luôn là nguồn sự thật.
      data-state={open ? 'open' : 'closed'}
    >
      {/* Icon đầu ô: ở chế độ gõ tay nó đóng vai nút mở panel. KHÔNG gắn onClick
          — click nổi lên wrapper để Radix tự toggle. onMouseDown preventDefault
          giữ con trỏ ở lại trong ô.
          ⛔ Icon phải lấy từ prop `icon`, KHÔNG hardcode: bản trước cắm cứng
          `calendar-outline` ở nhánh editable nên TimePicker (đã truyền
          `clock-outline`) hiện ra cái lịch. `null` = không icon. */}
      {icon &&
        (editable ? (
          <button
            aria-label="Mở bảng chọn"
            className="p-0.5 -ml-0.5 text-fg-4 hover:text-fg-2 transition-colors shrink-0 cursor-pointer disabled:cursor-not-allowed"
            disabled={disabled}
            tabIndex={-1}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
          >
            <SystemIcon name={icon} size={14} />
          </button>
        ) : (
          <SystemIcon className="text-fg-4 shrink-0" name={icon} size={15} />
        ))}

      {editable ? (
        <input
          ref={inputRef}
          {...a11yProps}
          // Vào edit mode trên lưới → sẵn sàng gõ/mở lịch ngay, giống `Input autoFocus` của các cell text khác.
          autoFocus={autoFocus}
          className={cn(
            'flex-1 min-w-0 bg-transparent outline-none border-none text-body-14',
            'text-fg-1 placeholder:text-fg-4',
            disabled && 'cursor-not-allowed',
          )}
          disabled={disabled}
          placeholder={placeholder}
          spellCheck={false}
          type="text"
          value={buffer}
          onBlur={handleInputBlur}
          onChange={(e) => {
            const raw = e.target.value;
            const formatted = onInputChange?.(raw);
            setBuffer(typeof formatted === 'string' ? formatted : raw);
          }}
          // Block input clicks from bubbling — they must NOT toggle the popover
          // (focusing the input already opened it via onFocus → onRequestOpen).
          onClick={(e) => e.stopPropagation()}
          onFocus={() => onRequestOpen?.()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit(buffer);
            } else if (e.key === 'Escape') {
              setBuffer(displayText);
              (e.target as HTMLInputElement).blur();
            }
          }}
          onMouseDown={(e) => e.stopPropagation()}
        />
      ) : (
        // text-fg-5 cho placeholder — đồng bộ với mọi field khác (trước đây
        // riêng picker dùng text-fg-4, sáng hơn hẳn nên trông như đã có giá trị).
        //
        // ⛔ `truncate` BẮT BUỘC (= whitespace-nowrap + overflow-hidden + ellipsis).
        // Trigger có CHIỀU CAO CỐ ĐỊNH (`FIELD_HEIGHT`), nên nếu chuỗi ngày dài
        // hơn ô — điển hình là range "DD/MM/YYYY - DD/MM/YYYY" ở size sm — chữ
        // xuống 2 dòng và TRÀN RA NGOÀI khung, phá cả hàng toolbar chứa nó.
        // Có ellipsis thì trường hợp xấu nhất chỉ là cụt đuôi, layout vẫn nguyên;
        // `title` cho xem đủ khi hover.
        <span
          className={cn('flex-1 truncate text-body-14', displayText ? 'text-fg-1' : 'text-fg-4')}
          title={displayText || undefined}
        >
          {displayText || placeholder}
        </span>
      )}

      {canClear && (
        <button
          aria-label="Xóa giá trị"
          className="p-0.5 text-fg-4 hover:text-fg-2 hover:bg-bg-2 transition-colors cursor-pointer"
          tabIndex={-1}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClear(e);
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <SystemIcon name="xmark-outline" size={12} />
        </button>
      )}
    </div>
  );
}
