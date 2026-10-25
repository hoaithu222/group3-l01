import { useController, type FieldPath, type FieldValues } from 'react-hook-form';
import { useFormMeta } from '../form.context';

/**
 * Core hook for building RHF-connected field components.
 * Must be called inside a `<Form>` (FormProvider) tree.
 *
 * Returns `{ field, fieldState, formState, readOnly }`.
 */
export function useFormField(name: string) {
  const { field, fieldState, formState } = useController({
    name: name as FieldPath<FieldValues>,
  });
  const { readOnly } = useFormMeta();
  return { field, fieldState, formState, readOnly };
}
