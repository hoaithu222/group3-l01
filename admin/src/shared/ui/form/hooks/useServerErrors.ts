import type { UseFormReturn, FieldValues, Path } from 'react-hook-form';

interface ServerErrorPayload {
  [field: string]: string | string[] | undefined;
}

function extractPayload(error: unknown): ServerErrorPayload {
  if (!error || typeof error !== 'object') return {};
  const axiosErr = error as { response?: { data?: ServerErrorPayload } };
  return axiosErr.response?.data ?? {};
}

/**
 * Maps HTTP 422 / server validation errors to form field errors.
 *
 * Usage:
 *   const { applyServerErrors } = useServerErrors(form);
 *   try { await save(data); } catch (err) { applyServerErrors(err); }
 */
export function useServerErrors<T extends FieldValues>(form: UseFormReturn<T>) {
  const applyServerErrors = (error: unknown) => {
    const payload = extractPayload(error);
    let hasRoot = false;

    for (const [field, raw] of Object.entries(payload)) {
      const message = Array.isArray(raw) ? raw[0] : raw;
      if (!message) continue;

      if (field === '__all__' || field === 'non_field_errors' || field === 'detail') {
        form.setError('root', { type: 'server', message });
        hasRoot = true;
      } else {
        form.setError(field as Path<T>, { type: 'server', message });
      }
    }

    if (!hasRoot && Object.keys(payload).length === 0) {
      const err = error as { message?: string };
      form.setError('root', { type: 'server', message: err?.message ?? 'Có lỗi xảy ra' });
    }
  };

  const rootError = form.formState.errors.root?.message;

  return { applyServerErrors, rootError };
}
