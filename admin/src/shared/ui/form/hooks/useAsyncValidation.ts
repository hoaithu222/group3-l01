import { useState, useCallback, useRef } from 'react';
import { debounce } from '@/shared/utils/browser/debounce.utils';

interface UseAsyncValidationOptions {
  /** Function that returns true when value is VALID, false when invalid. */
  fn: (value: string) => Promise<boolean>;
  debounceMs?: number;
  errorMessage: string;
}

/**
 * Debounced async field validation — useful for checking email/username availability.
 *
 * Usage:
 *   const { validate, isValidating, asyncError } = useAsyncValidation({
 *     fn: (v) => userApi.checkEmail(v).then(r => !r.exists),
 *     errorMessage: 'Email đã tồn tại',
 *   });
 *   <TextField name="email" onBlur={(e) => validate(e.target.value)} />
 */
export function useAsyncValidation({
  fn,
  debounceMs = 500,
  errorMessage,
}: UseAsyncValidationOptions) {
  const [isValidating, setIsValidating] = useState(false);
  const [asyncError, setAsyncError] = useState<string | undefined>();

  const debouncedRef = useRef(
    debounce(async (value: string) => {
      setIsValidating(true);
      try {
        const isValid = await fn(value);
        setAsyncError(isValid ? undefined : errorMessage);
      } catch {
        setAsyncError(undefined);
      } finally {
        setIsValidating(false);
      }
    }, debounceMs),
  );

  const validate = useCallback((value: string) => {
    if (!value) {
      setAsyncError(undefined);
      return;
    }
    debouncedRef.current(value);
  }, []);

  const reset = useCallback(() => {
    debouncedRef.current.cancel();
    setAsyncError(undefined);
    setIsValidating(false);
  }, []);

  return { validate, isValidating, asyncError, reset };
}
