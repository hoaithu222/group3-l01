/**
 * Drawer — kit2 slide-in side panel.
 *
 * Radix Dialog primitive in disguise: full-screen overlay + side-anchored
 * content with slide animations from `globals.css`.
 *
 *   <Drawer open={open} onOpenChange={setOpen} title="Comments" side="right" size="md">
 *     <CommentList />
 *   </Drawer>
 *
 * Accepts the same accessibility contracts as Modal — title/description are
 * surfaced as `Dialog.Title`/`Dialog.Description` automatically.
 */

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useRef } from 'react';
import { cn } from '@/shared/utils/style/cn';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { drawerStyles, type DrawerSide, type DrawerSize } from './drawer.theme';
import { useOpenAutoFocus } from './modal.utils';

export type { DrawerSide, DrawerSize };

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** Anchor edge. Defaults to `right`. */
  side?: DrawerSide;
  /** Logical size — width for left/right; height for top/bottom. */
  size?: DrawerSize;
  /** Show the close (X) button in the header. Defaults to `true`. */
  showClose?: boolean;
  /** Optional trigger element for uncontrolled scenarios. */
  trigger?: React.ReactNode;
  className?: string;
  /**
   * Ghi đè hoàn toàn hành vi auto-focus của Radix. Nhận Event, gọi
   * `event.preventDefault()` nếu muốn tự chọn phần tử focus. Ưu tiên hơn
   * `autoFocusFirst`. Ví dụ: focus ô soạn tin nhắn ở footer sau khi mở.
   */
  onOpenAutoFocus?: (event: Event) => void;
  /**
   * Tự focus phần tử input đầu tiên trong body drawer khi mở. Mặc định `false`
   * (Radix focus vào X đóng). Bật `true` cho drawer có ô nhập liệu / composer.
   * Element có `data-autofocus="true"` được ưu tiên → khuyến nghị dùng attribute
   * này khi input KHÔNG phải là focusable đầu tiên (vd composer nằm ở footer,
   * bên trên có thanh action).
   */
  autoFocusFirst?: boolean;
}

function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  side = 'right',
  size = 'md',
  showClose = true,
  trigger,
  className,
  onOpenAutoFocus,
  autoFocusFirst = false,
}: DrawerProps) {
  const slots = drawerStyles({ side, size });
  // `Boolean(title) || showClose` chứ KHÔNG `title ?? showClose`: `??` chỉ rơi sang `showClose` khi `title` là
  // null/undefined, nên `title=""` (đang tải, chưa có tên) làm mất CẢ phần đầu — không tiêu đề, không nút đóng.
  const hasHeader = Boolean(title) || showClose;
  const contentRef = useRef<HTMLDivElement>(null);

  const handleOpenAutoFocus = useOpenAutoFocus(contentRef, {
    enabled: autoFocusFirst,
    onOpenAutoFocus,
  });

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>}

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={slots.overlay()} />

        <DialogPrimitive.Content
          ref={contentRef}
          className={cn(slots.content(), className)}
          onOpenAutoFocus={handleOpenAutoFocus}
        >
          {hasHeader && (
            <div className={slots.header()}>
              <div className="flex-1 min-w-0">
                {title && (
                  <DialogPrimitive.Title className={slots.title()}>{title}</DialogPrimitive.Title>
                )}
                {description && (
                  <DialogPrimitive.Description className={slots.description()}>
                    {description}
                  </DialogPrimitive.Description>
                )}
              </div>
              {showClose && (
                <DialogPrimitive.Close aria-label="Đóng" className={slots.close()}>
                  <SystemIcon name="xmark-outline" size={16} />
                </DialogPrimitive.Close>
              )}
            </div>
          )}

          {children &&
            (hasHeader ? (
              <div className={slots.body()}>{children}</div>
            ) : (
              <DialogPrimitive.Description asChild>
                <div className={slots.body()}>{children}</div>
              </DialogPrimitive.Description>
            ))}

          {footer && <div className={slots.footer()}>{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default Drawer;
