/**
 * Mặt tiền công khai của feature Real-time Docs (p6-01) — route trong `app/(app)/workspaces/[wsId]/docs/**` trỏ vào các màn này. Lối vào ở hub nhóm
 * (`features/workspaces/hooks/useWorkspaceHubEntries.ts`) đi bằng ĐƯỜNG DẪN (không import feature này — `feature-structure.md`).
 */
export { DocumentListScreen } from './screens/DocumentListScreen';
export { DocumentEditorScreen } from './screens/DocumentEditorScreen';
export { DocumentHistoryScreen } from './screens/DocumentHistoryScreen';
export { DocumentShareScreen } from './screens/DocumentShareScreen';
