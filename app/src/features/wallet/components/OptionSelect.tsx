import { useState } from 'react';

import { Select, SelectSheet, type SelectOption } from '@/shared/ui/select';

export interface OptionSelectProps {
  disabled?: boolean;
  label: string;
  message?: string;
  options: readonly SelectOption[];
  placeholder?: string;
  searchable?: boolean;
  /** Chữ trong ô tìm của tấm chọn (chỉ có nghĩa khi `searchable`) — bỏ trống thì rơi về "Tìm kiếm" chung chung. */
  searchPlaceholder?: string;
  value: string | null;
  onChange: (value: string) => void;
}

/**
 * Ô chọn MỘT trong danh sách: `Select` (ô bấm) + `SelectSheet` (tấm chọn) đã ghép sẵn. Hiện NHÃN của
 * lựa chọn chứ không phải mã (vd "Thứ Sáu", không phải "5") — form giữ mã, ô hiện tên.
 * Dùng cho lịch nhắc (thứ/giờ/phút/múi giờ) và nơi đăng nhắc.
 */
export function OptionSelect({
  disabled,
  label,
  message,
  onChange,
  options,
  placeholder,
  searchable,
  searchPlaceholder,
  value,
}: OptionSelectProps) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);

  return (
    <>
      <Select
        disabled={disabled}
        label={label}
        message={message}
        messageTone="error"
        placeholder={placeholder}
        value={current?.label}
        onPress={() => setOpen(true)}
      />
      <SelectSheet
        options={options}
        searchable={searchable}
        searchPlaceholder={searchPlaceholder}
        title={label}
        value={value ?? undefined}
        visible={open}
        onChange={onChange}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
