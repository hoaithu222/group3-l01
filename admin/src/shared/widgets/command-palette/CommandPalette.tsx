/**
 * CommandPalette — hộp thoại tìm nhanh toàn cục (⌘K / Ctrl+K).
 *
 * GENERIC — giống `Header`, widget này KHÔNG đọc `MODULE_REGISTRY`/`PATHS`/store
 * nào. Danh sách điều hướng đi vào qua prop `groups`; tầng `app/shell/` (xem
 * `AppCommandPalette.tsx`) nối với module registry + store theme. Nhờ vậy
 * widget dùng lại được ở showcase/test mà không kéo theo cả cây route.
 *
 * Mở/đóng qua `command-palette-store.ts` (không phải `useDisclosure()` cục bộ)
 * vì nút bấm mở (trong Header) và hộp thoại này là hai cây component riêng —
 * xem chú thích trong store.
 *
 * Dựng trên `@radix-ui/react-dialog` (giống `Modal.tsx`) để có sẵn: bẫy focus,
 * đóng bằng Escape, khoá scroll nền, và animation ra/vào theo `data-state` mà
 * KHÔNG phải tự quản lý thời điểm unmount.
 *
 * Trang trí panel (lưới nền + 4 ngoặc góc + ray sáng mép trên) MƯỢN THẲNG
 * `modalStyles()` của `overlays/modal.theme` — KHÔNG tự vẽ lại — để có đúng
 * "chữ ký" thị giác của mọi lớp nổi toàn màn khác trong hệ (Modal/FormModal/
 * ConfirmDialog/Drawer). Panel/kích thước/vị trí vẫn là recipe RIÊNG
 * (`command-palette.theme.ts`) vì palette neo GẦN ĐỈNH, không canh giữa.
 */
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useMemo, useState } from 'react';

import { useImeSafeSearchInput } from '@/shared/hooks';
import type { SystemIconName } from '@/shared/ui';
import {
  Badge,
  Input,
  MODAL_OVERLAY_CLASS,
  modalStyles,
  POPUP_ITEM_CLASS,
  POPUP_ITEM_ICON_CLASS,
  Text,
} from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { matchesSearch } from '@/shared/utils/format/string.utils';
import { cn } from '@/shared/utils/style/cn';

import { useCommandPaletteStore } from './command-palette-store';
import { commandPaletteStyles } from './command-palette.theme';

export interface CommandPaletteItem {
  id: string;
  label: string;
  description?: string;
  iconName: SystemIconName;
  /** Từ khoá phụ để tìm ra mục này (vd alias, mã phân hệ) — KHÔNG hiện ra UI. */
  keywords?: string[];
  onSelect: () => void;
}

export interface CommandPaletteGroup {
  label: string;
  items: CommandPaletteItem[];
}

export interface CommandPaletteProps {
  groups: CommandPaletteGroup[];
  placeholder?: string;
}

/** Một dòng kết quả đã gắn sẵn vị trí phẳng — dùng để tô sáng theo `activeIndex`. */
interface CommandPaletteEntry {
  item: CommandPaletteItem;
  flatIndex: number;
}

const s = commandPaletteStyles();
/** Chỉ mượn slot TRANG TRÍ (`texture`/`corner`/`topRail`) — KHÔNG dùng `.panel()`. */
const decor = modalStyles({ frame: 'default' });

function CommandPalette({
  groups,
  placeholder = 'Tìm phân hệ, trang, hành động…',
}: CommandPaletteProps) {
  const isOpen = useCommandPaletteStore((state) => state.isOpen);
  const close = useCommandPaletteStore((state) => state.close);

  const [query, setQuery] = useState('');
  const [rawActiveIndex, setRawActiveIndex] = useState(0);
  const { inputProps } = useImeSafeSearchInput(query, setQuery);

  // Lọc + đánh số vị trí PHẲNG trong MỘT lượt tính — tránh biến `let` bị sửa
  // giữa lúc render JSX (không thuần, vỡ dưới React Compiler).
  const { displayGroups, flatItems } = useMemo(() => {
    const flat: CommandPaletteItem[] = [];
    const display: { label: string; entries: CommandPaletteEntry[] }[] = [];

    for (const group of groups) {
      const entries: CommandPaletteEntry[] = [];
      for (const item of group.items) {
        if (!matchesSearch([item.label, item.description, ...(item.keywords ?? [])], query))
          continue;
        entries.push({ item, flatIndex: flat.length });
        flat.push(item);
      }
      if (entries.length > 0) display.push({ label: group.label, entries });
    }

    return { displayGroups: display, flatItems: flat };
  }, [groups, query]);

  // Kẹp về khoảng hợp lệ NGAY TRONG RENDER thay vì effect riêng: từ khoá đổi
  // làm danh sách ngắn lại, `rawActiveIndex` cũ có thể trỏ ra ngoài mảng mới.
  const activeIndex = flatItems.length === 0 ? 0 : Math.min(rawActiveIndex, flatItems.length - 1);

  // Reset ô tìm kiếm + vị trí trỏ mỗi lần MỞ LẠI — theo mẫu "adjust state while
  // rendering" của React (so sánh với state trước đó, KHÔNG dùng `useEffect`):
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setQuery('');
      setRawActiveIndex(0);
    }
  }

  function runItem(item: CommandPaletteItem) {
    item.onSelect();
    close();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setRawActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setRawActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flatItems[activeIndex];
      if (item) runItem(item);
    }
  }

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(next) => !next && close()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={MODAL_OVERLAY_CLASS} />
        <DialogPrimitive.Content
          className={s.panel()}
          onOpenAutoFocus={(e) => {
            // Radix mặc định focus phần tử ĐẦU TIÊN focus-able trong Content —
            // đúng ý ta (ô tìm kiếm) nên không cần can thiệp, chỉ chặn hành vi
            // scroll-into-view giật cục trên panel đã neo cố định.
            e.preventDefault();
            (e.target as HTMLElement)?.querySelector('input')?.focus();
          }}
        >
          <DialogPrimitive.Title className="sr-only">Tìm nhanh</DialogPrimitive.Title>

          {/* Trang trí — cùng lớp với Modal/FormModal/ConfirmDialog/Drawer.
              Vẽ TRƯỚC nội dung; các slot nội dung bên dưới đều `relative` để
              nằm trên lưới nền + ngoặc góc. */}
          <span aria-hidden="true" className={decor.texture({ frame: 'default' })} />
          <span aria-hidden="true" className={decor.topRail({ frame: 'default' })} />
          <span aria-hidden="true" className={decor.corner({ at: 'tl', frame: 'default' })} />
          <span aria-hidden="true" className={decor.corner({ at: 'tr', frame: 'default' })} />
          <span aria-hidden="true" className={decor.corner({ at: 'bl', frame: 'default' })} />
          <span aria-hidden="true" className={decor.corner({ at: 'br', frame: 'default' })} />

          <div className={s.searchRow()}>
            <Input
              {...inputProps}
              border="none"
              placeholder={placeholder}
              size="lg"
              startIcon={<SystemIcon name="magnifying-glass-outline" size={16} />}
              onKeyDown={handleKeyDown}
            />
            <Badge className="mr-1 shrink-0" color="neutral" size="sm" variant="tinted">
              Esc
            </Badge>
          </div>

          <div className={s.list()}>
            {flatItems.length === 0 && (
              <p className={s.empty()}>Không tìm thấy kết quả cho "{query}".</p>
            )}
            {displayGroups.map((group) => (
              <div key={group.label}>
                <p className={s.groupLabel()}>{group.label}</p>
                {group.entries.map(({ item, flatIndex }) => {
                  const isActive = flatIndex === activeIndex;
                  return (
                    <button
                      key={item.id}
                      className={cn(POPUP_ITEM_CLASS, 'w-full text-left')}
                      data-highlighted={isActive ? '' : undefined}
                      type="button"
                      onClick={() => runItem(item)}
                      onMouseEnter={() => setRawActiveIndex(flatIndex)}
                    >
                      <SystemIcon
                        className={POPUP_ITEM_ICON_CLASS}
                        name={item.iconName}
                        size={18}
                      />
                      <span className="min-w-0 flex-1">
                        <Text className="block truncate" size="small" weight="medium">
                          {item.label}
                        </Text>
                        {item.description && (
                          <Text className="block truncate" size="tiny" skin="muted">
                            {item.description}
                          </Text>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className={s.footer()}>
            <span className="flex items-center gap-1.5 text-caption-12 text-fg-4">
              <Badge color="neutral" size="sm" variant="tinted">
                ↑
              </Badge>
              <Badge color="neutral" size="sm" variant="tinted">
                ↓
              </Badge>
              di chuyển
            </span>
            <span className="flex items-center gap-1.5 text-caption-12 text-fg-4">
              <Badge color="neutral" size="sm" variant="tinted">
                Enter
              </Badge>
              chọn
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default CommandPalette;
