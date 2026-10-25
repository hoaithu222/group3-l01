import { useEffect, useRef } from 'react';
import { useWatch, useFormContext } from 'react-hook-form';

export interface DynamicSchemaFieldProps {
  /** Discriminant field name to watch (e.g. "customerType"). */
  watch: string;
  children: React.ReactNode;
}

/**
 * Re-triggers full form validation when the discriminant field changes.
 * Use together with `z.discriminatedUnion` schema and `ConditionalField` for
 * show/hide behavior.
 *
 * The discriminated union schema handles field-level validation automatically —
 * this component ensures the form re-evaluates when the union branch switches.
 *
 * Usage:
 *   const schema = z.discriminatedUnion('type', [
 *     z.object({ type: z.literal('individual'), idCard: z.string().min(9) }),
 *     z.object({ type: z.literal('business'),   taxCode: z.string().min(10) }),
 *   ]);
 *
 *   <DynamicSchemaField watch="type">
 *     <ConditionalField watch="type" condition={(v) => v === 'individual'}>
 *       <TextField name="idCard" label="CMND/CCCD" />
 *     </ConditionalField>
 *     <ConditionalField watch="type" condition={(v) => v === 'business'}>
 *       <TextField name="taxCode" label="Mã số thuế" />
 *     </ConditionalField>
 *   </DynamicSchemaField>
 */
function DynamicSchemaField({ watch: watchName, children }: DynamicSchemaFieldProps) {
  const { trigger } = useFormContext();
  const discriminant = useWatch({ name: watchName }) as string | undefined;

  // Skip first render — when defaultValues set the discriminant, validating on
  // mount would surface "required" errors before the user types anything.
  // Only re-trigger when the discriminant *actually changes* afterwards.
  const prevDiscriminantRef = useRef(discriminant);

  useEffect(() => {
    const prev = prevDiscriminantRef.current;
    prevDiscriminantRef.current = discriminant;
    if (prev !== undefined && prev !== discriminant) {
      void trigger();
    }
  }, [discriminant, trigger]);

  return <>{children}</>;
}

export default DynamicSchemaField;
