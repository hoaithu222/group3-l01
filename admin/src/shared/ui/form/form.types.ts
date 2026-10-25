import type { FieldValues, UseFormReturn } from 'react-hook-form';

/**
 * Shared height preset for all form controls in kit2.
 *   - `sm` → 32px
 *   - `md` → 36px (default)
 *   - `lg` → 40px
 */
export type FieldSize = 'sm' | 'md' | 'lg';

export interface FormMeta {
  readOnly: boolean;
  autoSave: boolean;
}

export interface FieldWrapperBaseProps {
  label?: string;
  required?: boolean;
  description?: string;
  className?: string;
}

export interface AutoSaveOptions {
  key: string;
  debounceMs?: number;
}

export interface DirtyGuardOptions {
  message?: string;
}

export interface FormBaseProps<T extends FieldValues> {
  form: UseFormReturn<T>;
  onSubmit: (data: T) => void | Promise<void>;
  children: React.ReactNode;
  readOnly?: boolean;
  autoSave?: boolean | AutoSaveOptions;
  dirtyGuard?: boolean | DirtyGuardOptions;
  className?: string;
}
