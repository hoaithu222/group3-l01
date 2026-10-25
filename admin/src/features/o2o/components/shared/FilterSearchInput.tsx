import { memo } from 'react';

import { useImeSafeSearchInput } from '@/shared/hooks';
import { Input } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

export interface FilterSearchInputProps {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  maxLength: number;
}

/** Ô tìm IME-safe (`docs/rules/ime-safe-input.md`) — uncontrolled + đồng bộ ngược từ URL khi bộ lọc bị xoá. */
const FilterSearchInput = memo(function FilterSearchInput({
  value,
  onChange,
  placeholder,
  maxLength,
}: FilterSearchInputProps) {
  const { inputProps } = useImeSafeSearchInput(value, onChange);
  return (
    <Input
      {...inputProps}
      aria-label={placeholder}
      clearable
      maxLength={maxLength}
      placeholder={placeholder}
      size="sm"
      startIcon={<SystemIcon name="magnifying-glass-outline" size={16} />}
      wrapperClassName="w-64"
    />
  );
});

export default FilterSearchInput;
