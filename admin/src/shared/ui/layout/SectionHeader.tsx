import { cn } from '@/shared/utils/style/cn';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import type { SystemIconName } from '@/shared/ui/icons';
import type { TitleIconColor } from './TitleScreen';

export type SectionHeaderProps = {
  title: string;
  description?: string;
  /** Content rendered on the right side of the header bar. */
  right?: React.ReactNode;
  /**
   * Icon slot bên trái title — thay thế glow-dot mặc định. Mặc định `-outline`
   * (chrome UI); dùng `-bold` chỉ khi cần nhấn mạnh (theo `icon-conventions.md`).
   */
  icon?: SystemIconName;
  /**
   * Palette cho icon + left color bar (khi `accent=true`). Chưa set → icon dùng
   * `text-fg-2`, không có color bar.
   */
  iconColor?: TitleIconColor;
  /**
   * Bật thanh accent màu 3px sát mép trái (pattern Arco Design + BigDataView
   * — universal Chinese enterprise). Kết hợp với `iconColor` để đồng bộ tone.
   */
  accent?: boolean;
  className?: string;
};

/**
 * SectionHeader — panel/section header bar (KHÔNG underline, gọn 1 row).
 *
 * Layout (max-density theo `visual-hierarchy.md`):
 *  - `py-1.5 px-2` compact — 1 row duy nhất, không chiếm thêm chiều dọc
 *  - Background: gradient sky-8 → transparent (tách khỏi body panel)
 *  - Left: optional 3px color-bar accent (Arco pattern) + icon HOẶC glow-dot
 *  - Title + description (body-14-medium + caption-12)
 *  - Right slot (any ReactNode)
 *
 * Colors qua token (`--color-{tone}-5`). Không hex hardcode.
 */
function SectionHeader({
  title,
  description,
  right,
  icon,
  iconColor,
  accent = false,
  className,
}: SectionHeaderProps) {
  const tone = iconColor ?? 'teal';
  const showAccentBar = accent && iconColor != null;

  return (
    <div
      className={cn(
        'relative flex w-full flex-col',
        'after:pointer-events-none after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-[linear-gradient(to_right,transparent,var(--color-teal-5),transparent)] after:shadow-[0_0_6px_color-mix(in_srgb,var(--color-teal-5)_55%,transparent)]',
        className,
      )}
      style={{
        background:
          'linear-gradient(to left, transparent, color-mix(in srgb, var(--color-sky-8) 50%, transparent))',
      }}
    >
      {/* Left 3px color bar — Arco pattern. Chỉ hiện khi có iconColor + accent. */}
      {showAccentBar && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{
            background: `var(--color-${tone}-5)`,
            boxShadow: `0 0 6px color-mix(in srgb, var(--color-${tone}-5) 60%, transparent)`,
          }}
        />
      )}

      {/* Main row: icon/dot + title + right */}
      <div className="flex w-full items-center justify-between gap-2 px-2 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {icon ? (
            <SystemIcon
              className="shrink-0"
              name={icon}
              size={14}
              style={
                iconColor ? ({ color: `var(--color-${tone}-5)` } as React.CSSProperties) : undefined
              }
            />
          ) : (
            <span
              aria-hidden
              className="size-1 shrink-0 rounded-full"
              style={{
                background: `var(--color-${tone}-5)`,
                boxShadow: `0 0 6px var(--color-${tone}-5)`,
              }}
            />
          )}

          <div className="flex min-w-0 flex-col justify-center">
            <p
              className="text-body-14-medium text-fg-1 truncate whitespace-nowrap"
              style={{
                textShadow: '0 0 8px color-mix(in_srgb,var(--color-teal-5)_15%,transparent)',
              }}
            >
              {title}
            </p>
            {description && <p className="text-caption-12 text-fg-4 truncate">{description}</p>}
          </div>
        </div>

        {right && <div className="flex shrink-0 items-center">{right}</div>}
      </div>
    </div>
  );
}

export default SectionHeader;
