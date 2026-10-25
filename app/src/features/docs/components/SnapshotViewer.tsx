import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/modal';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Skeleton } from '@/shared/ui/skeleton';

import type { SnapshotView } from '../api/docs.types';
import { useEditorHtml } from '../hooks/useEditorHtml';
import { useSnapshotViewer } from '../hooks/useSnapshotViewer';
import { useWebViewModule } from '../hooks/useWebViewModule';
import { snapshotTitle } from '../utils/docs-format';
import { EditorWebView } from './EditorWebView';

export interface SnapshotViewerProps {
  /** Có nút "Khôi phục phiên bản này" (`myPermissions.restore` và tài liệu còn hoạt động). */
  canRestore: boolean;
  docId: string;
  restoring: boolean;
  snapshot: SnapshotView;
  onClose: () => void;
  onRestore: (snapshot: SnapshotView) => void;
}

/**
 * Xem MỘT bản lưu chỉ đọc (app.md §3 dòng "Lịch sử"): thay danh sách trong cùng màn (nút Back của thanh tiêu đề quay về danh sách). Nội dung do WebView
 * dựng từ `yjsState` của bản lưu — không kết nối collab nên không ai thấy mình, và không có toolbar. "Khôi phục" hỏi xác nhận ở màn cha.
 */
export function SnapshotViewer({
  canRestore,
  docId,
  onClose,
  onRestore,
  restoring,
  snapshot,
}: SnapshotViewerProps) {
  const viewer = useSnapshotViewer(docId, snapshot.id);
  const webView = useWebViewModule();
  const html = useEditorHtml();
  const ready = webView.status === 'ready' && html.status === 'ready' && viewer.detail.isSuccess;

  let body;
  if (webView.status === 'unavailable') {
    body = (
      <ScreenState
        description="Bản cài đặt này chưa có thành phần soạn thảo."
        state="error"
        title="Chưa hỗ trợ xem phiên bản"
      />
    );
  } else if (viewer.failed || html.status === 'error') {
    body = (
      <ScreenState
        action={{ label: 'Thử lại', onPress: viewer.retry }}
        description="Không mở được phiên bản này. Kiểm tra kết nối rồi thử lại."
        state="error"
        title="Không xem được phiên bản"
      />
    );
  } else if (ready) {
    body = (
      <EditorWebView
        html={html.html}
        instance={viewer.host.instance}
        module={webView.module}
        webViewRef={viewer.webViewRef}
        onMessage={viewer.host.onMessage}
        onProcessGone={viewer.host.remount}
      />
    );
  } else {
    body = (
      <View className="gap-sm p-md">
        <Skeleton className="h-8 w-2/3 rounded-md" />
        <Skeleton className="h-4 rounded-md" />
        <Skeleton className="h-4 w-4/5 rounded-md" />
      </View>
    );
  }

  return (
    <Screen
      footer={
        canRestore ? (
          <BottomActionBar>
            <Button
              fullWidth
              label="Khôi phục phiên bản này"
              loading={restoring}
              onPress={() => onRestore(snapshot)}
            />
          </BottomActionBar>
        ) : undefined
      }
      header={<AppBar title={snapshotTitle(snapshot)} onBack={onClose} />}
      padded={false}
      scrollable={false}
    >
      <View className="px-md pb-xs pt-2xs">
        <Alert description="Bạn đang xem một phiên bản cũ — chỉ đọc." tone="info" />
      </View>
      <View className="flex-1">{body}</View>
      <Dialog
        description={viewer.links.pending ?? ''}
        primaryAction={{ label: 'Mở liên kết', onPress: viewer.links.confirm }}
        secondaryAction={{ label: 'Huỷ', onPress: viewer.links.dismiss }}
        title="Mở liên kết bên ngoài?"
        visible={viewer.links.pending !== null}
        onClose={viewer.links.dismiss}
      />
    </Screen>
  );
}
