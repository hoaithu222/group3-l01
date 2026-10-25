import { useEffect, useRef } from 'react';
import { debounce } from '@/shared/utils/browser/debounce.utils';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

interface UseFormDraftOptions<T extends FieldValues> {
  key: string;
  form: UseFormReturn<T>;
  debounceMs?: number;
  /** Set false to disable saving (still restores on mount if draft exists). */
  enabled?: boolean;
}

/**
 * Auto-saves form values to localStorage on change; restores on mount.
 *
 * Usage:
 *   const { clear, hasDraft } = useFormDraft({ key: 'create-project', form });
 */
export function useFormDraft<T extends FieldValues>({
  key,
  form,
  debounceMs = 3000,
  enabled = true,
}: UseFormDraftOptions<T>) {
  const storageKey = `form-draft:${key}`;

  // Restore draft on mount
  useEffect(() => {
    if (!enabled || !key) return;
    const saved = localStorage.getItem(storageKey);
    if (!saved) return;
    try {
      const data = JSON.parse(saved) as T;
      form.reset(data, { keepDirty: true });
    } catch {
      localStorage.removeItem(storageKey);
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save on value change (debounced)
  const debouncedSave = useRef(
    debounce((values: unknown) => {
      localStorage.setItem(storageKey, JSON.stringify(values));
    }, debounceMs),
  );

  useEffect(() => {
    if (!enabled || !key) return;
    const saveFn = debouncedSave.current;
    const { unsubscribe } = form.watch((values) => {
      if (form.formState.isDirty) saveFn(values);
    });
    return () => {
      saveFn.cancel();
      unsubscribe();
    };
  }, [enabled, form, key, storageKey]);

  const clear = () => localStorage.removeItem(storageKey);
  const hasDraft = Boolean(key && localStorage.getItem(storageKey));

  return { clear, hasDraft };
}
