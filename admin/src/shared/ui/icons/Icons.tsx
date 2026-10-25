import { memo } from 'react';
import type { SVGProps } from 'react';
import { cn } from '@/shared/utils/style/cn';
import { systemIcons } from './index';
import type { SystemIconName } from './index';

export interface SystemIconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  /** Icon name — kebab-case SVG filename without extension (e.g. "angle-down-bold") */
  name: SystemIconName;
  /**
   * Size in pixels applied to both width and height.
   * @default 16
   */
  size?: number;
}

/**
 * Renders a system SVG icon by name.
 *
 * Usage:
 *   <SystemIcon name="angle-down-bold" size={20} className="text-primary-5" />
 *
 * Color is controlled via Tailwind text-* classes (uses currentColor internally).
 * Run `npm run generate:icons` after adding new SVG files to src/assets/icons/systems/.
 */
export const SystemIcon = memo(function SystemIcon({
  name,
  size = 16,
  style,
  className,
  ...props
}: SystemIconProps) {
  const IconComponent = systemIcons[name];

  if (!IconComponent) {
    if (import.meta.env.DEV) {
      console.warn(
        `[SystemIcon] Icon "${String(name)}" not found. Run \`npm run generate:icons\`.`,
      );
    }
    return null;
  }

  return (
    <IconComponent
      className={cn('shrink-0 cursor-pointer', className)}
      style={{ width: size, height: size, display: 'block', ...style }}
      {...props}
    />
  );
});

SystemIcon.displayName = 'SystemIcon';

export type { SystemIconName };
