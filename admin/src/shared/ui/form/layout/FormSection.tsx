import { useState } from 'react';
import { cn } from '@/shared/utils/style/cn';
import { SystemIcon } from '@/shared/ui/icons/Icons';

export interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  className?: string;
}

/** Groups related fields under a titled section with optional collapse. */
function FormSection({
  title,
  description,
  children,
  collapsible = false,
  defaultOpen = true,
  className,
}: FormSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div
        className={cn(
          'flex items-center justify-between pb-3',
          'border-b border-divider-1',
          collapsible && 'cursor-pointer select-none',
        )}
        onClick={collapsible ? () => setOpen((v) => !v) : undefined}
      >
        <div className="flex flex-col gap-0.5">
          <h3 className="text-body-14-medium text-fg-1">{title}</h3>
          {description && <p className="text-caption-12 text-fg-4">{description}</p>}
        </div>
        {collapsible && (
          <SystemIcon
            className="text-fg-4"
            name={open ? 'angle-up-outline' : 'angle-down-outline'}
            size={16}
          />
        )}
      </div>

      {(!collapsible || open) && <div className="flex flex-col gap-4">{children}</div>}
    </div>
  );
}

export default FormSection;
