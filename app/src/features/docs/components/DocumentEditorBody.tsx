import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Dialog } from '@/shared/ui/modal';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { showToast } from '@/shared/utils/toast.utils';

import type { DocumentDetail } from '../api/docs.types';
import {
  useEditorLoadTimeout,
  useLeaveOnRevoke,
  useResetEditorStore,
} from '../hooks/useEditorGuards';
import { useEditorHtml } from '../hooks/useEditorHtml';
import { useKeyboardCover } from '../hooks/useKeyboardCover';
import { useLiveDocEditor } from '../hooks/useLiveDocEditor';
import { useDisclosure } from '../hooks/useSheetTarget';
import { useWebViewModule } from '../hooks/useWebViewModule';
import { useArchiveDocument, useUnarchiveDocument } from '../queries/docs.mutations';
import { useDocEditorStore } from '../store/doc-editor.store';
import { docsErrorMessage } from '../utils/docs-errors';
import { docHistoryHref, docShareHref } from '../utils/docs-routes';
import { isEditable } from '../utils/editor-status';
import { EditorHeaderActions } from './EditorHeaderActions';
import { EditorStatusRow } from './EditorStatusRow';
import { EditorSurface } from './EditorSurface';
import { EditorToolbar } from './EditorToolbar';
import { LinkSheet } from './LinkSheet';
import { RenameDocumentSheet } from './RenameDocumentSheet';
import { SaveSnapshotSheet } from './SaveSnapshotSheet';

export interface DocumentEditorBodyProps {
  doc: DocumentDetail;
  wsId: string;
}

/**
 * Thân màn soạn thảo (app.md §3 dòng "Editor"): `AppBar` (tiêu đề, người đang mở, menu) · dải trạng thái · WebView toàn màn · toolbar native.
 *
 * ── Bàn phím (Android + WebView) ──────────────────────────────────────────────────────────────────────────────────
 * Vùng WebView + toolbar nằm trong một `View` thường `flex: 1` có `paddingBottom` = phần bàn phím phủ lên (`useKeyboardCover`): khung co lại nên dòng
 * đang gõ không bị che và toolbar luôn NẰM TRÊN bàn phím. ⛔ KHÔNG dùng `KeyboardAvoidingView` của keyboard-controller ở đây — `style={{ flex: 1 }}` bị
 * Reanimated làm rơi, khung sập về 0dp và vùng soạn trắng trơn (lỗi đã gặp trên máy thật, xem `useKeyboardCover`). Cũng không thêm
 * `KeyboardStickyView` cho toolbar và không dùng `Screen keyboardAware` — nâng bàn phím HAI lần (khe trống giữa toolbar và bàn phím).
 * ⚠️ Chưa kiểm trên máy thật (Android Gboard/Laban Key, iOS): việc cuộn dòng-đang-gõ vào tầm nhìn do trang lo.
 *
 * Toolbar chỉ hiện khi ĐANG sửa được (`isEditable`): người xem/tài liệu lưu trữ/chưa đồng bộ lần đầu thì không có (banner "Chỉ xem" thay vào).
 */
export function DocumentEditorBody({ doc, wsId }: DocumentEditorBodyProps) {
  useResetEditorStore();
  const editor = useLiveDocEditor({ doc, wsId });
  const webView = useWebViewModule();
  const [htmlAttempt, setHtmlAttempt] = useState(0);
  const html = useEditorHtml(htmlAttempt);

  const { failure, ready, selection, status, tokenProblem, users } = useDocEditorStore();
  const { bridge, host, images, links } = editor;
  const editable = isEditable(status, selection?.canEdit);
  const keyboardCover = useKeyboardCover();
  useEditorLoadTimeout(
    webView.status === 'ready' && html.status === 'ready' && !failure,
    host.instance,
  );
  useLeaveOnRevoke(router.back);

  const rename = useDisclosure();
  const version = useDisclosure();
  const link = useDisclosure();
  const archiveDialog = useDisclosure();
  const archive = useArchiveDocument();
  const unarchive = useUnarchiveDocument();

  const confirmArchive = () =>
    archive.mutate(doc.id, {
      onError: (error) => showToast('error', docsErrorMessage(error)),
      onSettled: archiveDialog.close,
      onSuccess: () => showToast('success', 'Đã lưu trữ tài liệu'),
    });
  const restore = () =>
    unarchive.mutate(doc.id, {
      onError: (error) => showToast('error', docsErrorMessage(error)),
      onSuccess: () => showToast('success', 'Đã khôi phục tài liệu'),
    });
  /** "Sửa": đưa con trỏ về CUỐI tài liệu (mở tài liệu không tự bật bàn phím). `requestFocus` để Android chịu hiện bàn phím. */
  const focusEnd = () => {
    editor.webViewRef.current?.requestFocus();
    bridge.command({ attrs: { position: 'end' }, name: 'focus' });
  };
  const reload = () => {
    useDocEditorStore.getState().patch({ failure: null, ready: false });
    host.remount();
  };

  return (
    <Screen
      header={
        <AppBar
          actions={
            <EditorHeaderActions
              doc={doc}
              users={users}
              onArchive={archiveDialog.open}
              onHistory={() => router.push(docHistoryHref(wsId, doc.id))}
              onRename={rename.open}
              onRestore={restore}
              onSaveVersion={version.open}
              onShare={() => router.push(docShareHref(wsId, doc.id))}
            />
          }
          title={doc.title}
          onBack={router.back}
        />
      }
      padded={false}
      scrollable={false}
    >
      <EditorStatusRow
        editable={editable}
        status={status}
        tokenProblem={tokenProblem}
        uploading={images.uploading}
        onEdit={focusEnd}
      />
      <View style={{ flex: 1, paddingBottom: keyboardCover }}>
        <EditorSurface
          failure={failure}
          host={host}
          html={html}
          ready={ready}
          webView={webView}
          webViewRef={editor.webViewRef}
          onLeave={router.back}
          onReconnect={editor.reconnect}
          onReload={reload}
          onReloadHtml={() => setHtmlAttempt((value) => value + 1)}
        />
        {editable ? (
          <EditorToolbar
            imageBusy={images.uploading}
            selection={selection}
            onCommand={(command) => bridge.command(command)}
            onImage={() => void images.pick()}
            onLink={link.open}
          />
        ) : null}
      </View>

      <LinkSheet
        currentHref={selection?.link ?? null}
        visible={link.visible}
        onApply={(href) => bridge.command({ attrs: { href }, name: 'link' })}
        onClose={link.close}
        onRemove={() => bridge.command({ attrs: { href: null }, name: 'link' })}
      />
      <RenameDocumentSheet doc={doc} visible={rename.visible} onClose={rename.close} />
      <SaveSnapshotSheet docId={doc.id} visible={version.visible} onClose={version.close} />
      <Dialog
        description={`"${doc.title}" sẽ chuyển sang chế độ chỉ xem cho mọi người. Bạn có thể khôi phục lại sau.`}
        primaryAction={{ label: 'Lưu trữ', loading: archive.isPending, onPress: confirmArchive }}
        secondaryAction={{
          disabled: archive.isPending,
          label: 'Huỷ',
          onPress: archiveDialog.close,
        }}
        title="Lưu trữ tài liệu?"
        visible={archiveDialog.visible}
        onClose={archiveDialog.close}
      />
      <Dialog
        description={links.pending ?? ''}
        primaryAction={{ label: 'Mở liên kết', onPress: links.confirm }}
        secondaryAction={{ label: 'Huỷ', onPress: links.dismiss }}
        title="Mở liên kết bên ngoài?"
        visible={links.pending !== null}
        onClose={links.dismiss}
      />
    </Screen>
  );
}
