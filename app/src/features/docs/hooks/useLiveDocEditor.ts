import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { SocketEvent, useSocketEvent } from '@/core/socket';
import type { CollabGrant } from '@/shared/collab';
import { useResolvedTheme } from '@/shared/theme';
import { showToast } from '@/shared/utils/toast.utils';

import type { DocumentDetail } from '../api/docs.types';
import { useDocEditorStore } from '../store/doc-editor.store';
import { hostMessage } from '../webview/doc-editor-bridge';
import type { InitLivePayload, NoticeCode } from '../webview/doc-editor-bridge.types';
import { resolveAssetUrlReply } from '../webview/resolve-asset-url';
import { type EditorRoute, routeEditorMessage } from '../webview/route-editor-message';
import { COMMAND_REJECT_TEXT, NOTICE_TEXT } from './doc-editor-notices';
import { useEditorBridge, useEditorHost } from './useEditorHost';
import { useEditorImages } from './useEditorImages';
import { useEditorLinks } from './useEditorLinks';
import { useEditorToken } from './useEditorToken';

export interface UseLiveDocEditorOptions {
  doc: DocumentDetail;
  wsId: string;
}

/** Quyền sửa hiệu lực từ phía app: token cho ghi + BE nói được sửa + tài liệu còn hoạt động (server vẫn là người quyết định cuối). */
const canEditNow = (grant: CollabGrant, doc: DocumentDetail): boolean =>
  grant.mode === 'edit' && doc.myPermissions.edit && doc.status === 'ACTIVE';

/**
 * Phiên soạn thảo trực tiếp của MỘT tài liệu: nối WebView ↔ token (`useEditorToken`) ↔ store ↔ ảnh ↔ liên kết. Mỗi lần trang báo `ready` → token MỚI rồi
 * `init`; tin `resolveAssetUrl`/`openLink`/`requestImage`/`notice`… đi qua `routeEditorMessage`; `permission:revoked` của chính tài liệu → mất quyền
 * (thu hồi ở mức NHÓM do layout `[wsId]` lo); đổi giao diện sáng/tối và quyền sửa khi đang mở → `setTheme`/`setMode`, khỏi dựng lại WebView.
 */
export function useLiveDocEditor({ doc, wsId }: UseLiveDocEditorOptions) {
  const docId = doc.id;
  const queryClient = useQueryClient();
  const patch = useDocEditorStore((state) => state.patch);
  const theme = useResolvedTheme();
  const latest = useRef({ doc, theme });
  useEffect(() => {
    latest.current = { doc, theme };
  });

  const { bridge, webViewRef } = useEditorBridge();
  const token = useEditorToken(docId, bridge);
  const images = useEditorImages({ bridge, docId, wsId });
  const links = useEditorLinks();

  const route: EditorRoute = {
    onCommandRejected: (reason) => {
      const text = COMMAND_REJECT_TEXT[reason];
      if (text) showToast('info', text);
    },
    onNotice: (code: NoticeCode) => {
      const notice = NOTICE_TEXT[code];
      if (notice) showToast(notice.type, notice.text);
    },
    onOpenLink: links.request,
    onRequestImage: () => void images.pick(),
    onRequestToken: (_reason, attempt) => token.onRequestToken(attempt),
    onResolveAsset: (assetId) =>
      void resolveAssetUrlReply(queryClient, assetId).then((reply) =>
        bridge.send(hostMessage('assetUrl', reply)),
      ),
    patch,
  };

  const host = useEditorHost({
    bridge,
    buildInit: async (): Promise<InitLivePayload> => {
      const grant = await token.begin();
      const { doc: current, theme: currentTheme } = latest.current;
      return {
        documentName: grant.documentName,
        expiresAt: grant.expiresAt,
        locale: 'vi',
        mode: canEditNow(grant, current) ? 'edit' : 'view',
        theme: currentTheme,
        token: grant.token,
        url: grant.url,
        user: grant.user,
        ...(grant.stateMaxBytes ? { stateMaxBytes: grant.stateMaxBytes } : {}),
      };
    },
    onIncompatible: () => patch({ failure: { code: 'UNSUPPORTED', fatal: true } }),
    onInitError: token.fail,
    onMessage: (message) => routeEditorMessage(message, route),
    onReady: () => patch({ ready: true, selection: null, status: null, users: [] }),
  });

  useSocketEvent<{ scopeId?: string; scopeType?: string }>(
    SocketEvent.PERMISSION_REVOKED,
    (event) => {
      if (event.scopeType === 'DOCUMENT' && event.scopeId === docId) {
        patch({ failure: { code: 'FORBIDDEN', fatal: true } });
      }
    },
  );

  useEffect(() => {
    bridge.send(hostMessage('setTheme', { theme }));
  }, [bridge, theme]);
  const editable = doc.myPermissions.edit && doc.status === 'ACTIVE';
  const firstMode = useRef(true);
  useEffect(() => {
    if (firstMode.current) {
      firstMode.current = false;
      return;
    }
    bridge.send(hostMessage('setMode', { mode: editable ? 'edit' : 'view' }));
  }, [bridge, editable]);

  return { bridge, host, images, links, reconnect: token.reconnect, webViewRef };
}
