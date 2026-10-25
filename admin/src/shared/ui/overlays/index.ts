/**
 * Lớp nổi — popover, tooltip, hộp thoại, thông báo
 *
 * Thêm component mới vào nhóm này thì thêm dòng export ở đây.
 */

export { default as Modal } from './Modal';
export type { ModalProps, ModalSize } from './Modal';
export { default as ConfirmDialog } from './ConfirmDialog';
export type { ConfirmDialogProps, ConfirmDialogVariant } from './ConfirmDialog';
export { default as ConfirmWithReasonModal } from './ConfirmWithReasonModal';
export type { ConfirmWithReasonModalProps } from './ConfirmWithReasonModal';
export { default as FormModal } from './FormModal';
export type { FormModalProps, FormModalSize } from './FormModal';
export { default as Drawer } from './Drawer';
export type { DrawerProps, DrawerSide, DrawerSize } from './Drawer';
export { default as CustomModalLayout } from './CustomModalLayout';
export type { CustomModalLayoutProps } from './CustomModalLayout';
export { default as Popover } from './Popover';
export type { PopoverProps } from './Popover';
export { default as Toast, ToastProvider } from './Toast';
export type { ToastProps, ToastType } from './Toast';
export { default as ToastViewport } from './ToastViewport';
export { ToastContainer } from './ToastContainer';
export { default as Tooltip } from './Tooltip';
export type { TooltipProps, TooltipVariant } from './Tooltip';

/*
 * Hai trong ba NGUỒN DÙNG CHUNG của bề mặt nổi (`kit2-architecture.md §5b`). Ngoài kit2 chỉ WIDGET dựng
 * lớp nổi riêng mới cần — hiện là `shared/widgets/command-palette`, mượn đúng "chữ ký" của Modal/Menu
 * thay vì chép lại chuỗi Tailwind (bản chép tay là thứ đã từng trôi khỏi chuẩn). Trước đây nó import sâu
 * `@/shared/ui/overlays/*.theme` — phá luật "chỉ import qua barrel". Component thường KHÔNG dùng chúng:
 * cần hộp thoại thì dùng `Modal`, cần menu thì dùng `Menu`.
 */
export { MODAL_OVERLAY_CLASS, modalStyles } from './modal.theme';
export { POPUP_ITEM_CLASS, POPUP_ITEM_ICON_CLASS } from './popup-surface.theme';
