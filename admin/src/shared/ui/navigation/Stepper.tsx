import { Fragment, forwardRef, useMemo } from 'react';
import { cn } from '@/shared/utils/style/cn';
import { SystemIcon } from '@/shared/ui/icons/Icons';

// ─── Types ───────────────────────────────────────────────────────────────────

export type StepStatus = 'done' | 'active' | 'error' | 'pending';
export type StepperLayout = 'horizontal-center' | 'horizontal-inline' | 'vertical';
export type StepperSize = 'sm' | 'md'; // sm = 20 px icon, md = 24 px icon

export interface StepItem {
  key: string;
  label: string;
  /** Explicit state — takes priority over computed state from `activeStep`. */
  status?: StepStatus;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeStatus(i: number, s: StepItem, active?: number): StepStatus {
  if (s.status != null) return s.status;
  if (active == null) return 'pending';
  return i < active ? 'done' : i === active ? 'active' : 'pending';
}

// Figma tokens: primary/3 → text-primary-3, error/3 → text-red-3, neutral/5 → text-fg-4
const LABEL_CN: Record<StepStatus, string> = {
  done: 'text-primary-3',
  active: 'text-primary-3',
  error: 'text-red-3',
  pending: 'text-fg-4',
};

// ─── StepDot (internal) ───────────────────────────────────────────────────────

function StepDot({
  status,
  number,
  size,
}: {
  status: StepStatus;
  number: number;
  size: StepperSize;
}) {
  const outerCn = cn(
    'inline-flex items-center justify-center shrink-0',
    size === 'sm' ? 'size-5' : 'size-6',
  );

  if (status === 'done')
    return (
      <span className={cn(outerCn, 'text-primary-5')}>
        <SystemIcon className="size-full" name="circle-check-outline" />
      </span>
    );

  if (status === 'error')
    return (
      <span className={cn(outerCn, 'text-red-5')}>
        <SystemIcon className="size-full" name="circle-xmark-outline" />
      </span>
    );

  // active or pending — numbered circle
  const innerCn = cn(
    'flex items-center justify-center rounded-full',
    size === 'sm' ? 'size-4' : 'size-5',
    status === 'active' ? 'bg-sky-3' : 'bg-neutral-5',
  );
  // Use font tokens (encode size + weight + line-height) — see font-system.md.
  const numCn = cn(
    'text-fg-2 text-center',
    size === 'sm' ? 'text-caption-12-medium w-4' : 'text-body-14-medium w-5',
  );

  return (
    <span className={cn(outerCn, 'p-0.5')}>
      <span className={innerCn}>
        <span className={numCn}>{number}</span>
      </span>
    </span>
  );
}

// ─── Stepper ──────────────────────────────────────────────────────────────────

export interface StepperProps {
  steps: StepItem[];
  /** 0-indexed active step. Computes per-step status if step.status is not set. */
  activeStep?: number;
  layout?: StepperLayout;
  size?: StepperSize;
  className?: string;
}

const Stepper = forwardRef<HTMLDivElement, StepperProps>(
  ({ steps, activeStep, layout = 'horizontal-center', size = 'sm', className }, ref) => {
    const resolved = useMemo(
      () =>
        steps.map((s, i) => ({
          ...s,
          resolvedStatus: computeStatus(i, s, activeStep),
          number: i + 1,
        })),
      [steps, activeStep],
    );

    const isHoriz = layout !== 'vertical';
    // pt/pl = half icon height/width to center the connector line with the icon
    const halfPt = size === 'sm' ? 'pt-2.5' : 'pt-3';
    const halfPl = size === 'sm' ? 'pl-2.5' : 'pl-3';

    return (
      <div
        ref={ref}
        className={cn('flex', isHoriz ? 'flex-row items-start' : 'flex-col', className)}
      >
        {resolved.map((step, idx) => (
          <Fragment key={step.key}>
            {layout === 'horizontal-center' ? (
              <div className="flex flex-col items-center gap-1 shrink-0">
                <StepDot number={step.number} size={size} status={step.resolvedStatus} />
                <span
                  className={cn(
                    'text-body-14 text-center whitespace-nowrap',
                    LABEL_CN[step.resolvedStatus],
                  )}
                >
                  {step.label}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 shrink-0">
                <StepDot number={step.number} size={size} status={step.resolvedStatus} />
                <span
                  className={cn('text-body-14 whitespace-nowrap', LABEL_CN[step.resolvedStatus])}
                >
                  {step.label}
                </span>
              </div>
            )}

            {idx < resolved.length - 1 &&
              (isHoriz ? (
                <div
                  className={cn(
                    'flex-1 min-w-4',
                    layout === 'horizontal-center' ? halfPt : 'self-center',
                  )}
                >
                  <div className="border-t border-dashed border-neutral-7" />
                </div>
              ) : (
                <div className={halfPl}>
                  <div className="border-l border-dashed border-neutral-7 h-10" />
                </div>
              ))}
          </Fragment>
        ))}
      </div>
    );
  },
);

Stepper.displayName = 'Stepper';

export default Stepper;
