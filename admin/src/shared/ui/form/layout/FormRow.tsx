import { cn } from '@/shared/utils/style/cn';

export interface FormRowProps {
  children: React.ReactNode;
  /** Horizontal gap between items. */
  gap?: 2 | 3 | 4 | 6;
  /** Align items along the cross axis. */
  align?: 'start' | 'center' | 'end';
  className?: string;
}

const GAP_MAP: Record<number, string> = { 2: 'gap-2', 3: 'gap-3', 4: 'gap-4', 6: 'gap-6' };
const ALIGN_MAP: Record<string, string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
};

/** Horizontal row of fields — wraps on small screens. */
function FormRow({ children, gap = 3, align = 'start', className }: FormRowProps) {
  return (
    <div className={cn('flex flex-wrap', GAP_MAP[gap], ALIGN_MAP[align], className)}>
      {children}
    </div>
  );
}

export default FormRow;
