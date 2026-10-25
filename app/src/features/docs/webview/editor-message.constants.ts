import type { EditorMode } from './doc-editor-bridge.types';

/**
 * Tập giá trị hợp lệ của tin WebView → app (`parseEditorMessage`) — khớp `bridge-validate.ts` của editor. Tách khỏi bộ kiểm để file logic ngắn;
 * `tests/bridge-contract.test.ts` đối chiếu với `bridge-protocol.ts` (NoticeCode/EditorErrorCode/ConnectionState).
 */
export const MODES: readonly EditorMode[] = ['edit', 'view', 'comment'];
export const CONNECTION_STATES = ['connecting', 'synced', 'offline', 'closed'] as const;
export const ERROR_CODES = [
  'AUTH_EXPIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'TOO_LARGE',
  'LOAD_FAILED',
  'INVALID_MESSAGE',
] as const;
export const NOTICE_CODES = [
  'SAVE_FAILED',
  'SAVE_RECOVERED',
  'TOO_LARGE',
  'ARCHIVED',
  'RESTORED',
  'READ_ONLY',
] as const;
export const BOOL_STATUS = [
  'unsynced',
  'saveFailed',
  'readOnly',
  'archived',
  'tooLarge',
  'nearLimit',
] as const;
export const BOOL_SELECTION = [
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'bulletList',
  'orderedList',
  'taskList',
  'blockquote',
  'codeBlock',
  'table',
  'canUndo',
  'canRedo',
  'canEdit',
] as const;
