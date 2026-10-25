/**
 * DockSettingsButton — nút bánh răng cuối thanh Dock + panel cấu hình.
 *
 * Panel (dùng `Popover` của kit2, mặt kính đồng bộ với tooltip của Dock):
 *   1. Chế độ hiển thị — bốn hàng chọn kiểu radio.
 *   2. Vạch ngăn.
 *   3. Hiệu ứng — công tắc phóng lân cận.
 *
 * `OptionTile` tách thành component cục bộ (`widget-composition.md §3`) vì cùng
 * một bố cục "ô icon + chữ + phần đuôi" dùng ở HAI chỗ với gốc ngữ nghĩa khác
 * nhau: hàng chọn chế độ là `<button>` (bấm để chọn), hàng công tắc là
 * `<label>` (nhãn của công tắc bên trong — bọc `<button>` quanh một `<button>`
 * khác là HTML không hợp lệ và trình đọc màn hình đọc sai).
 *
 * ⛔ KHÔNG export `OptionTile` / `RadioIndicator` — chúng là chi tiết của panel
 *    này. Cần ở nơi khác thì nâng lên `@/shared/ui` theo `kit2-architecture.md §9`.
 */
import { memo } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { Divider, Popover, Text, Toggle, type BoldSystemIconName } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import { DOCK_ENTER_CLASS, dockSettingsStyles } from './dock.theme';
import { DOCK_MODE_OPTIONS } from './dock-settings';
import type { DockDisplayMode, DockSettings } from './dock-settings';


interface DockSettingsButtonProps {
  settings: DockSettings;
  open: boolean;
  /**
   * Khoá phần chọn chế độ (máy chạm bị ép `pinned` — xem `Dock.tsx`). Các lựa
   * chọn vẫn hiện, chỉ mờ đi kèm một dòng giải thích: ẩn hẳn thì người dùng
   * tưởng phần mềm thiếu chức năng.
   */
  modeLocked?: boolean;
  /**
   * Độ trễ (ms) của hiệu ứng bay vào — `Dock` truyền xuống để nút bánh răng vào
   * SAU CÙNG, sau tất cả icon và vạch ngăn.
   */
  enterDelayMs?: number;
  onModeChange: (mode: DockDisplayMode) => void;
  onMagnifyChange: (magnify: boolean) => void;
  onOpenChange: (open: boolean) => void;
}

interface OptionTileProps {
  icon: BoldSystemIconName;
  title: string;
  description: string;
  /** Đang được chọn — nhuộm cả hàng, ô icon và chấm tròn. */
  selected?: boolean;
  /** Chỉ nhuộm ô icon, KHÔNG nhuộm nền hàng — dùng cho công tắc đang bật. */
  accent?: boolean;
  /** Còn nhìn thấy nhưng không bấm được. */
  locked?: boolean;
  trailing?: ReactNode;
  /** Gốc ngữ nghĩa: `button` cho hàng chọn chế độ, `label` cho hàng công tắc. */
  as?: 'button' | 'label';
  onClick?: () => void;
}

const OptionTile = memo(function OptionTile({
  icon,
  title,
  description,
  selected = false,
  accent = false,
  locked = false,
  trailing,
  as = 'button',
  onClick,
}: OptionTileProps) {
  const s = dockSettingsStyles({ selected, accent, locked });

  const body = (
    <>
      <span className={s.optionIcon()}>
        <SystemIcon name={icon} />
      </span>
      <span className={s.optionBody()}>
        {/* `truncate` cần cha `min-w-0` — đã có sẵn ở slot `optionBody`.
            Màu chữ dùng cặp `fg-on-popup*` chứ KHÔNG dùng `skin` mặc định của
            `Text` (`fg-1` / `fg-4` là màu chữ trên NỀN TRANG): panel này nằm
            trên mặt kính của popover, hai thang màu đó không cùng một nền
            (`text-contrast.md`). */}
        <Text className="truncate text-fg-on-popup" size="tiny" weight="medium">
          {title}
        </Text>
        <Text className="truncate text-fg-on-popup-muted" size="extraTiny">
          {description}
        </Text>
      </span>
      {trailing}
    </>
  );

  if (as === 'label') {
    return <label className={s.option()}>{body}</label>;
  }

  return (
    <button
      aria-disabled={locked || undefined}
      className={s.option()}
      disabled={locked}
      type="button"
      onClick={onClick}
    >
      {body}
    </button>
  );
});

const RadioIndicator = memo(function RadioIndicator({ selected }: { selected: boolean }) {
  const s = dockSettingsStyles({ selected });

  return (
    <span aria-hidden className={s.optionState()}>
      {selected && <SystemIcon name="check-bold" size={10} />}
    </span>
  );
});

const DockSettingsButton = memo(function DockSettingsButton({
  settings,
  open,
  modeLocked = false,
  enterDelayMs = 0,
  onModeChange,
  onMagnifyChange,
  onOpenChange,
}: DockSettingsButtonProps) {
  const s = dockSettingsStyles({ triggerOpen: open });

  return (
    <Popover
      align="end"
      arrow
      content={
        <div className={s.panel()}>
          <div className={s.panelHeader()}>
            <span className={s.panelHeaderIcon()}>
              <SystemIcon name="sliders-simple-bold" />
            </span>
            <Text as="span" className={s.panelTitle()}>
              Tuỳ chỉnh Dock
            </Text>
          </div>

          <Divider className="mb-1" />

          <Text as="span" className={s.sectionLabel()}>
            Chế độ hiển thị
          </Text>

          {modeLocked && (
            /* Vì sao phải nói ra: các chế độ ẩn Dock chỉ mở lại được bằng con
               trỏ, nên trên máy chạm chúng bị khoá. Không giải thích thì người
               dùng bấm mà không thấy gì xảy ra và tưởng là lỗi. */
            <Text as="span" className="block px-2 pb-1 text-fg-on-popup-muted" size="extraTiny">
              Trên máy tính bảng, Dock luôn hiện để không bị mất khi chạm.
            </Text>
          )}

          <div className={s.optionList()}>
            {DOCK_MODE_OPTIONS.map((opt) => {
              const isSelected = settings.mode === opt.value;
              return (
                <OptionTile
                  key={opt.value}
                  description={opt.desc}
                  icon={opt.icon}
                  locked={modeLocked && !isSelected}
                  selected={isSelected}
                  title={opt.label}
                  trailing={<RadioIndicator selected={isSelected} />}
                  onClick={() => onModeChange(opt.value)}
                />
              );
            })}
          </div>

          <Divider className="my-2" />

          <Text as="span" className={s.sectionLabel()}>
            Hiệu ứng
          </Text>
          <OptionTile
            accent={settings.magnify}
            as="label"
            description="Icon nở to dần khi rê chuột"
            icon="magnifying-glass-bold"
            title="Phóng to icon"
            trailing={
              <Toggle checked={settings.magnify} size="sm" onCheckedChange={onMagnifyChange} />
            }
          />
        </div>
      }
      open={open}
      side="top"
      sideOffset={12}
      onOpenChange={onOpenChange}
    >
      <button aria-label="Tuỳ chỉnh Dock" className={s.trigger()} type="button">
        {/* Bọc riêng một lớp cho hiệu ứng bay vào — xem `DOCK_ENTER_CLASS`. */}
        <span
          className={DOCK_ENTER_CLASS}
          style={{ ['--dock-icon-delay' as string]: `${enterDelayMs}ms` } as CSSProperties}
        >
          <SystemIcon name="sliders-simple-bold" size={22} />
        </span>
      </button>
    </Popover>
  );
});

export default DockSettingsButton;
