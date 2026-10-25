/**
 * Mặt tiền "tin đã lưu" DÙNG CHUNG (p1-09). Nằm ở `shared/` chứ không trong `discovery`: menu tin của `chat` cần
 * lưu/bỏ lưu mà `chat` không được import `discovery` (`docs/rules/feature-structure.md`) — app.md p1-09 §2 đã dự liệu
 * "hook `useToggleSave` đặt ở `src/shared/…` nếu feature chat cần". `discovery` (trang "Đã lưu") dùng lại cùng khoá cache.
 */
export { savedKeys } from './saved.keys';
export type { SavedListFilter, SavedScopeFilter } from './saved.keys';
export { savedMessagesService } from './saved.service';
export { resetSavedStore, useIsSavedMessage, useSavedMessagesStore } from './saved.store';
export { useSaveActions } from './useSaveActions';
export type { UseSaveActionsResult } from './useSaveActions';
export { useSavedSync } from './useSavedSync';
export type { SavedUpdatedEvent } from './useSavedSync';
