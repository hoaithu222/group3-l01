import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { useResolvedTheme } from '@/shared/theme';

import { useSnapshotDetail } from '../queries/docs.queries';
import { hostMessage } from '../webview/doc-editor-bridge';
import { resolveAssetUrlReply } from '../webview/resolve-asset-url';
import { useEditorBridge, useEditorHost } from './useEditorHost';
import { useEditorLinks } from './useEditorLinks';

/**
 * Xem một bản lưu CHỈ ĐỌC trong WebView (`init { source: 'snapshot', yjsState }` — không kết nối collab, không token, không awareness).
 * Dùng chung `useEditorHost`/bridge với editor thật nhưng KHÔNG ghi vào `useDocEditorStore` (WebView của editor thật vẫn đang mount dưới ngăn
 * xếp điều hướng). Chỉ nghe hai tin: `resolveAssetUrl` (ảnh trong bản lưu vẫn cần URL ký) và `openLink` (hỏi rồi mới mở). Lỗi nghiêm trọng của
 * trang (`snapshot-corrupt`) hoặc tải state thất bại → `failed`.
 */
export function useSnapshotViewer(docId: string, snapshotId: string) {
  const queryClient = useQueryClient();
  const theme = useResolvedTheme();
  const detail = useSnapshotDetail(docId, snapshotId);
  const { bridge, webViewRef } = useEditorBridge();
  const links = useEditorLinks();
  const [failed, setFailed] = useState(false);

  const latest = useRef({ theme, yjsState: detail.data?.yjsState });
  useEffect(() => {
    latest.current = { theme, yjsState: detail.data?.yjsState };
  });

  const host = useEditorHost({
    bridge,
    buildInit: async () => {
      const { theme: current, yjsState } = latest.current;
      if (!yjsState) throw new Error('snapshot-empty');
      return { locale: 'vi', source: 'snapshot', theme: current, yjsState };
    },
    onIncompatible: () => setFailed(true),
    onInitError: () => setFailed(true),
    onMessage: (message) => {
      if (message.type === 'openLink') links.request(message.payload.url);
      else if (message.type === 'error' && message.payload.fatal) setFailed(true);
      else if (message.type === 'resolveAssetUrl') {
        void resolveAssetUrlReply(queryClient, message.payload.assetId).then((reply) =>
          bridge.send(hostMessage('assetUrl', reply)),
        );
      }
    },
  });

  return {
    detail,
    failed: failed || detail.isError,
    host,
    links,
    retry: () => {
      setFailed(false);
      host.remount();
      void detail.refetch();
    },
    webViewRef,
  };
}
