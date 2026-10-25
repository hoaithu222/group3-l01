import type { ReactNode } from 'react';
import { View } from 'react-native';

import { ScreenState } from '@/shared/ui/screen-state';
import { Skeleton } from '@/shared/ui/skeleton';

import type { EditorHtmlState } from '../hooks/useEditorHtml';
import type { EditorWebViewRef } from '../hooks/useEditorHost';
import type { WebViewModuleState } from '../hooks/useWebViewModule';
import type { DocEditorFailure } from '../store/doc-editor.store';
import { EditorFailureView } from './EditorFailureView';
import { EditorWebView } from './EditorWebView';

export interface EditorSurfaceProps {
  failure: DocEditorFailure | null;
  host: { instance: number; onMessage: EditorWebViewMessage; remount: () => void };
  html: EditorHtmlState;
  /** Trang đã báo `ready` — chưa thì phủ khung xương lên trên WebView đang nạp. */
  ready: boolean;
  webView: WebViewModuleState;
  webViewRef: EditorWebViewRef;
  onLeave: () => void;
  onReconnect: () => void;
  /** Dựng lại WebView từ đầu (xoá lỗi + `remount`). */
  onReload: () => void;
  onReloadHtml: () => void;
}

type EditorWebViewMessage = (event: { nativeEvent: { data: string } }) => void;

/**
 * Vùng nội dung của màn soạn thảo, chọn MỘT trong: chưa hỗ trợ (dev client chưa build lại, thiếu `RNCWebViewModule`) · lỗi phiên (`EditorFailureView`) ·
 * không đọc được HTML bundle · WebView (kèm khung xương phủ tới khi trang báo `ready`). Tách khỏi `DocumentEditorBody` để mỗi file dưới 200 dòng.
 */
export function EditorSurface({
  failure,
  host,
  html,
  onLeave,
  onReconnect,
  onReload,
  onReloadHtml,
  ready,
  webView,
  webViewRef,
}: EditorSurfaceProps) {
  let content: ReactNode = null;
  if (webView.status === 'unavailable') {
    content = (
      <ScreenState
        description="Bản cài đặt này chưa có thành phần soạn thảo. Hãy cài lại/cập nhật ứng dụng."
        state="error"
        title="Chưa hỗ trợ soạn thảo"
      />
    );
  } else if (failure) {
    content = (
      <EditorFailureView
        failure={failure}
        onLeave={onLeave}
        onReconnect={onReconnect}
        onReload={onReload}
      />
    );
  } else if (html.status === 'error') {
    content = (
      <ScreenState
        action={{ label: 'Thử lại', onPress: onReloadHtml }}
        description="Không đọc được trình soạn thảo trong ứng dụng."
        state="error"
        title="Không mở được trình soạn thảo"
      />
    );
  } else if (webView.status === 'ready' && html.status === 'ready') {
    content = (
      <EditorWebView
        html={html.html}
        instance={host.instance}
        module={webView.module}
        webViewRef={webViewRef}
        onMessage={host.onMessage}
        onProcessGone={host.remount}
      />
    );
  }

  const loading = webView.status === 'ready' && html.status === 'ready' && !failure && !ready;
  return (
    <View className="flex-1">
      {content}
      {loading ? (
        <View className="absolute inset-0 gap-sm bg-bg-1 p-md" pointerEvents="none">
          <Skeleton className="h-8 w-2/3 rounded-md" />
          <Skeleton className="h-4 rounded-md" />
          <Skeleton className="h-4 rounded-md" />
          <Skeleton className="h-4 w-4/5 rounded-md" />
        </View>
      ) : null}
    </View>
  );
}
