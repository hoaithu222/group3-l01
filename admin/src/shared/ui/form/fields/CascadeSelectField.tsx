import { useState, useEffect, useCallback, useId } from 'react';
import { useFormContext } from 'react-hook-form';
import FormItem from '../FormItem';
import Dropdown, { type DropdownOption, type DropdownSize } from '@/shared/ui/selects/Dropdown';
import { useFormMeta } from '../form.context';

export interface CascadeLevel {
  name: string;
  label: string;
  /** Receives values of all preceding levels as args. */
  fetch: (...parentValues: string[]) => Promise<DropdownOption[]>;
}

export interface CascadeSelectFieldProps {
  levels: CascadeLevel[];
  disabled?: boolean;
  className?: string;
  size?: DropdownSize;
}

/**
 * Cascading selects — selecting a parent auto-resets and refetches downstream levels.
 * Example: Province → District → Ward.
 */
function CascadeSelectField({ levels, disabled, className, size }: CascadeSelectFieldProps) {
  const { readOnly } = useFormMeta();
  // `useFieldA11y` là hook nên KHÔNG gọi được trong vòng lặp cấp. Mỗi cấp vẫn
  // cần một bộ id riêng, nên dẫn xuất từ MỘT `useId()` của component cha —
  // `level.name` là duy nhất trong một cascade nên đủ để tách.
  const uid = useId();
  const { watch, setValue, getValues, formState } = useFormContext();
  const [optionsMap, setOptionsMap] = useState<Record<string, DropdownOption[]>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>(() =>
    levels[0] ? { [levels[0].name]: true } : {},
  );

  const fetchLevel = useCallback(
    async (levelIndex: number) => {
      const level = levels[levelIndex];
      const parentValues = levels.slice(0, levelIndex).map((l) => getValues(l.name) as string);
      if (levelIndex > 0 && !parentValues[levelIndex - 1]) {
        setOptionsMap((m) => ({ ...m, [level.name]: [] }));
        return;
      }
      setLoadingMap((m) => ({ ...m, [level.name]: true }));
      try {
        const opts = await level.fetch(...parentValues);
        setOptionsMap((m) => ({ ...m, [level.name]: opts }));
      } finally {
        setLoadingMap((m) => ({ ...m, [level.name]: false }));
      }
    },
    [levels, getValues],
  );

  /**
   * Nạp cấp đầu tiên khi mount.
   *
   * ⛔ KHÔNG gọi thẳng `fetchLevel(0)`: hàm đó `setLoadingMap` NGAY LẬP TỨC,
   * tức setState đồng bộ trong effect → thêm một lượt render thừa ngay sau
   * commit đầu (rule `react-hooks/set-state-in-effect`). Cấp 0 không có cha
   * nên trạng thái tải khởi tạo được luôn ở `useState`, và ở đây chỉ còn phần
   * bất đồng bộ.
   *
   * `cancelled` chặn setState sau khi component đã gỡ — bản gốc thiếu, nên
   * đóng form trong lúc danh sách đang tải sẽ ghi state vào chỗ không còn tồn tại.
   */
  useEffect(() => {
    const first = levels[0];
    if (!first) return;
    let cancelled = false;

    void (async () => {
      try {
        const opts = await first.fetch();
        if (!cancelled) setOptionsMap((m) => ({ ...m, [first.name]: opts }));
      } finally {
        if (!cancelled) setLoadingMap((m) => ({ ...m, [first.name]: false }));
      }
    })();

    return () => {
      cancelled = true;
    };
    // Chỉ chạy một lần lúc mount — đổi `levels` giữa chừng là đổi cả hình dạng
    // form, chỗ đó phải remount component chứ không nạp lại ngầm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = useCallback(
    (levelIndex: number, value: string) => {
      setValue(levels[levelIndex].name, value, { shouldValidate: true, shouldDirty: true });
      // Reset and refetch all downstream levels
      for (let i = levelIndex + 1; i < levels.length; i++) {
        setValue(levels[i].name, '', { shouldDirty: true });
      }
      if (levelIndex + 1 < levels.length) fetchLevel(levelIndex + 1);
    },
    [levels, setValue, fetchLevel],
  );

  return (
    <div className={className}>
      {levels.map((level, idx) => {
        const value = watch(level.name) as string | undefined;
        const error = (formState.errors[level.name] as { message?: string } | undefined)?.message;
        const opts = optionsMap[level.name] ?? [];
        const labelId = `${uid}${level.name}-label`;
        const controlId = `${uid}${level.name}-field`;
        const errorId = `${uid}${level.name}-error`;

        if (readOnly) {
          const selectedLabel = opts.find((o) => o.value === value)?.label ?? value ?? '—';
          return (
            <FormItem key={level.name} label={level.label}>
              <span className="text-body-14 text-fg-1 py-2">{selectedLabel}</span>
            </FormItem>
          );
        }

        return (
          <FormItem
            key={level.name}
            error={error}
            errorId={errorId}
            label={level.label}
            labelId={labelId}
          >
            <Dropdown
              aria-describedby={error ? errorId : undefined}
              aria-invalid={error ? true : undefined}
              aria-labelledby={labelId}
              disabled={disabled || (idx > 0 && !watch(levels[idx - 1].name))}
              id={controlId}
              options={opts}
              placeholder={loadingMap[level.name] ? 'Đang tải...' : 'Chọn'}
              size={size}
              value={value}
              onValueChange={(val) => handleChange(idx, val)}
            />
          </FormItem>
        );
      })}
    </div>
  );
}

export default CascadeSelectField;
