import * as TabsPrimitive from '@radix-ui/react-tabs';

/**
 * TabsPanel — content panel for a `Tabs` value.
 *
 * Must be rendered inside a `Tabs` root. Radix Tabs.Content handles the
 * show/hide based on the active value.
 *
 * Usage:
 *   <Tabs options={...} value={v} onValueChange={setV}>
 *     <TabsPanel value="key">...</TabsPanel>
 *   </Tabs>
 */
export interface TabsPanelProps {
  value: string;
  children?: React.ReactNode;
  className?: string;
}

function TabsPanel({ value, children, className }: TabsPanelProps) {
  return (
    <TabsPrimitive.Content className={className} value={value}>
      {children}
    </TabsPrimitive.Content>
  );
}

export default TabsPanel;
