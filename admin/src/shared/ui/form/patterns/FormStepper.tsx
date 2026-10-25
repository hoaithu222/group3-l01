import { useState, useCallback, useMemo } from 'react';
import type { UseFormReturn, FieldValues, FieldPath } from 'react-hook-form';
import Button from '@/shared/ui/actions/Button';
import Stepper, {
  type StepItem,
  type StepperLayout,
  type StepperSize,
} from '@/shared/ui/navigation/Stepper';
import { cn } from '@/shared/utils/style/cn';

export interface FormStep<T extends FieldValues> {
  title: string;
  /** Field names in this step — only these are validated on Next. */
  fields: FieldPath<T>[];
  component: React.ReactNode;
  /** Optional stable key for Stepper (defaults to title). */
  key?: string;
}

export interface FormStepperProps<T extends FieldValues> {
  form: UseFormReturn<T>;
  onSubmit: (data: T) => void | Promise<void>;
  steps: FormStep<T>[];
  className?: string;
  /** Stepper header layout. Default: "horizontal-center". */
  stepperLayout?: StepperLayout;
  /** Stepper header size. Default: "md". */
  stepperSize?: StepperSize;
  /** className applied to the Stepper header. */
  stepperClassName?: string;
  /** Hide the stepper header entirely. */
  hideHeader?: boolean;
  /** Override Next / Back / Finish button labels. */
  nextLabel?: string;
  backLabel?: string;
  finishLabel?: string;
}

/**
 * Multi-step wizard with per-step validation.
 * Header uses the shared <Stepper> component — pass `stepperLayout`/`stepperSize`
 * to switch between centered, inline, or vertical step indicators.
 */
function FormStepper<T extends FieldValues>({
  form,
  onSubmit,
  steps,
  className,
  stepperLayout = 'horizontal-center',
  stepperSize = 'md',
  stepperClassName,
  hideHeader = false,
  nextLabel = 'Tiếp theo',
  backLabel = 'Quay lại',
  finishLabel = 'Hoàn tất',
}: FormStepperProps<T>) {
  const [current, setCurrent] = useState(0);
  const isLast = current === steps.length - 1;

  // Map FormStep -> Stepper StepItem (Stepper derives status from activeStep).
  const stepItems = useMemo<StepItem[]>(
    () => steps.map((s, i) => ({ key: s.key ?? `${i}-${s.title}`, label: s.title })),
    [steps],
  );

  const handleNext = useCallback(async () => {
    const stepFields = steps[current].fields;
    const valid = stepFields.length ? await form.trigger(stepFields) : true;
    if (valid) setCurrent((c) => Math.min(c + 1, steps.length - 1));
  }, [current, form, steps]);

  const handleBack = useCallback(() => setCurrent((c) => Math.max(c - 1, 0)), []);

  const handleSubmit = form.handleSubmit(onSubmit);

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {!hideHeader && (
        <Stepper
          activeStep={current}
          className={stepperClassName}
          layout={stepperLayout}
          size={stepperSize}
          steps={stepItems}
        />
      )}

      {/* Current step content */}
      <div className="flex flex-col gap-4">{steps[current].component}</div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-divider-1">
        <Button
          disabled={current === 0}
          size="lg"
          type="button"
          variant="stroke"
          onClick={handleBack}
        >
          {backLabel}
        </Button>

        {isLast ? (
          <Button
            loading={form.formState.isSubmitting}
            size="lg"
            type="button"
            onClick={() => void handleSubmit()}
          >
            {finishLabel}
          </Button>
        ) : (
          <Button size="lg" type="button" onClick={() => void handleNext()}>
            {nextLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

export default FormStepper;
