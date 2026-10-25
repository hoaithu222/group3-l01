import { cn } from '@/shared/utils/style/cn';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import {
  DEFAULT_PASSWORD_CONDITIONS,
  getPasswordLevel,
  type PasswordCondition,
  type PasswordStrengthLevel,
} from './password-strength.helpers';

const LEVEL_LABEL: Record<PasswordStrengthLevel, string> = {
  empty: 'Mật khẩu phải chứa tối thiểu:',
  weak: 'Mật khẩu yếu. Cần bổ sung:',
  moderate: 'Mật khẩu trung bình. Cần bổ sung:',
  strong: 'Mật khẩu mạnh. An toàn để sử dụng.',
};

// Bar colors per level — matches Figma 187:24299
// empty=neutral-7, weak=error, moderate=warning, strong=success
const BAR_FILLED_CLASS: Record<Exclude<PasswordStrengthLevel, 'empty'>, string> = {
  weak: 'bg-error',
  moderate: 'bg-warning',
  strong: 'bg-success',
};

const BAR_EMPTY_CLASS = 'bg-neutral-7';

export interface PasswordStrengthProps {
  value: string;
  conditions?: PasswordCondition[];
  className?: string;
}

/**
 * Password strength indicator — Figma 187:24299.
 *
 * Layout:
 *   - 3 level bars (gray → red → orange → green based on # of conditions met)
 *   - Strength label
 *   - Checklist of conditions (check icon: gray when failed, green when passed)
 */
function PasswordStrength({
  value,
  conditions = DEFAULT_PASSWORD_CONDITIONS,
  className,
}: PasswordStrengthProps) {
  const results = conditions.map((c) => c.test(value));
  const passed = results.filter(Boolean).length;
  const level = getPasswordLevel(passed);

  const filledClass = level === 'empty' ? BAR_EMPTY_CLASS : BAR_FILLED_CLASS[level];
  // Bars 1..3 filled based on level (weak=1, moderate=2, strong=3, empty=0)
  const filledCount = level === 'empty' ? 0 : level === 'weak' ? 1 : level === 'moderate' ? 2 : 3;

  return (
    <div className={cn('flex flex-col gap-2 pt-1.5', className)}>
      {/* Level bars */}
      <div
        aria-label="Độ mạnh mật khẩu"
        aria-valuemax={3}
        aria-valuemin={0}
        aria-valuenow={passed}
        className="flex gap-2"
        role="meter"
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              'h-1 flex-1 transition-colors',
              i < filledCount ? filledClass : BAR_EMPTY_CLASS,
            )}
          />
        ))}
      </div>

      {/* Strength label */}
      <p className="text-caption-12 text-fg-4">{LEVEL_LABEL[level]}</p>

      {/* Conditions checklist */}
      <ul className="flex flex-col gap-1">
        {conditions.map((c, i) => {
          const ok = results[i];
          return (
            <li key={c.label} className="flex items-center gap-1">
              <SystemIcon
                className={ok ? 'text-success' : 'text-fg-4'}
                name="circle-check-outline"
                size={16}
              />
              <span className="text-caption-12 text-fg-4">{c.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default PasswordStrength;
