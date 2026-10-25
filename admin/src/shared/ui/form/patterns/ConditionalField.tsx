import { useEffect, useRef } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

export interface ConditionalFieldProps {
  /** Field name to watch. */
  watch: string;
  /** Return true to show (and register) children. */
  condition: (value: unknown) => boolean;
  children: React.ReactNode;
  /** Names to unregister when hidden — prevents ghost validation. */
  unregisterNames?: string[];
}

/**
 * Shows/hides children based on a watched field value.
 * When hidden, unregisters the specified fields so they don't block form submission.
 *
 * Usage:
 *   <ConditionalField watch="type" condition={(v) => v === 'other'}>
 *     <TextField name="otherReason" label="Lý do khác" />
 *   </ConditionalField>
 */
function ConditionalField({
  watch: watchName,
  condition,
  children,
  unregisterNames,
}: ConditionalFieldProps) {
  const { unregister } = useFormContext();
  const value = useWatch({ name: watchName });
  const isVisible = condition(value);

  // Track previous visibility so we only unregister on visible→hidden transition.
  // This avoids the infinite loop caused by array-literal unregisterNames creating a new
  // reference each render, which would previously trigger unregister() on every render.
  const prevVisibleRef = useRef<boolean | null>(null);

  useEffect(() => {
    const wasVisible = prevVisibleRef.current;
    prevVisibleRef.current = isVisible;

    if (wasVisible === true && !isVisible && unregisterNames?.length) {
      unregister(unregisterNames as Parameters<typeof unregister>[0]);
    }
  }, [isVisible, unregister, unregisterNames]);

  if (!isVisible) return null;

  return <>{children}</>;
}

export default ConditionalField;
