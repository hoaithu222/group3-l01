import { useState, useMemo } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { UseFormReturn, FieldValues } from 'react-hook-form';
import Badge from '@/shared/ui/primitives/Badge';
import { cn } from '@/shared/utils/style/cn';

interface FormTabsPanel {
  value: string;
  label: string;
  /** Field names that belong to this tab — used for error badge detection. */
  fields?: string[];
  children: React.ReactNode;
}

export interface FormTabsProps<T extends FieldValues> {
  form: UseFormReturn<T>;
  children: React.ReactElement<FormTabsPanel> | React.ReactElement<FormTabsPanel>[];
  className?: string;
}

/** Sub-component — declare tab panels as children. */
function Panel({ children }: FormTabsPanel) {
  return <>{children}</>;
}
Panel.displayName = 'FormTabs.Panel';

const TRIGGER_CN = [
  'relative inline-flex items-center gap-1.5 shrink-0 px-3 py-2.5 cursor-pointer',
  'text-body-14 whitespace-nowrap text-fg-3 outline-none transition-colors',
  'border-t-2 border-transparent',
  'data-[state=active]:text-primary-7 data-[state=active]:border-primary-7',
  'data-[state=active]:bg-gradient-to-b data-[state=active]:from-primary-1 data-[state=active]:to-transparent',
  'hover:text-fg-1 data-[state=active]:hover:text-primary-7',
  'focus-visible:ring-1 focus-visible:ring-ring-focus',
].join(' ');

/**
 * Tab-based form layout with automatic error badges per tab.
 * When submit fails, the first tab with errors is auto-switched to.
 */
function FormTabsBase<T extends FieldValues>({ form, children, className }: FormTabsProps<T>) {
  const panels = useMemo(
    () => (Array.isArray(children) ? children : [children]) as React.ReactElement<FormTabsPanel>[],
    [children],
  );
  const [active, setActive] = useState(panels[0]?.props.value ?? '');

  const errors = form.formState.errors;

  const errorCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    panels.forEach((panel) => {
      const fields = panel.props.fields ?? [];
      counts[panel.props.value] = fields.filter((f) =>
        Object.prototype.hasOwnProperty.call(errors, f),
      ).length;
    });
    return counts;
  }, [errors, panels]);

  return (
    <TabsPrimitive.Root
      className={cn('flex flex-col gap-4', className)}
      value={active}
      onValueChange={setActive}
    >
      <TabsPrimitive.List className="flex items-start gap-2">
        {panels.map((panel) => {
          const count = errorCounts[panel.props.value] ?? 0;
          return (
            <TabsPrimitive.Trigger
              key={panel.props.value}
              className={TRIGGER_CN}
              value={panel.props.value}
            >
              {panel.props.label}
              {count > 0 && (
                <Badge
                  className="ml-1 text-caption-10 px-1 py-0 h-4 min-w-4"
                  color="error"
                  variant="solid"
                >
                  {count}
                </Badge>
              )}
            </TabsPrimitive.Trigger>
          );
        })}
      </TabsPrimitive.List>

      {panels.map((panel) => (
        <TabsPrimitive.Content
          key={panel.props.value}
          className="flex flex-col gap-4"
          value={panel.props.value}
        >
          {panel.props.children}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}

const FormTabs = Object.assign(FormTabsBase, { Panel });

export default FormTabs;
