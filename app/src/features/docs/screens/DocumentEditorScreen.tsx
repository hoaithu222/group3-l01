import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { isNetworkError } from '@/shared/utils/errors/to-error-message';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Skeleton } from '@/shared/ui/skeleton';

import { DocumentEditorBody } from '../components/DocumentEditorBody';
import { useDocumentsSocket } from '../hooks/useDocumentsSocket';
import { useDocument } from '../queries/docs.queries';
import { docsErrorMessage, isNotAvailable } from '../utils/docs-errors';

/**
 * Màn soạn thảo (app.md §1, §3): nạp metadata + `myPermissions` (`GET /documents/:id` — KHÔNG có nội dung), rồi giao cho `DocumentEditorBody`
 * (WebView + bridge + collab). Nội dung tài liệu nằm trong Y.Doc của WebView, không qua React Query.
 *
 * Trạng thái: tải (khung xương) · không còn/không có quyền (404 trung tính, cờ `collab` tắt → `CFG_005`) → "Tài liệu không còn khả dụng",
 * KHÔNG nút Thử lại (vẫn 404) · lỗi mạng/BE → Thử lại. `useDocumentsSocket` giữ chi tiết đồng bộ (đổi tên/lưu trữ từ máy khác).
 * Mất quyền lúc ĐANG mở do `useLeaveOnRevoke` (trong thân) + `useWorkspaceSocket` của layout `[wsId]` (rời nhóm).
 */
export function DocumentEditorScreen() {
  const { docId, wsId } = useLocalSearchParams<{ docId: string; wsId: string }>();
  const query = useDocument(docId);
  useDocumentsSocket(wsId);

  if (query.data) return <DocumentEditorBody doc={query.data} wsId={wsId} />;

  const header = <AppBar title="Tài liệu" onBack={router.back} />;

  if (query.isLoading) {
    return (
      <Screen header={header} scrollable={false}>
        <View className="gap-sm py-md">
          <Skeleton className="h-8 w-2/3 rounded-md" />
          <Skeleton className="h-4 rounded-md" />
          <Skeleton className="h-4 rounded-md" />
          <Skeleton className="h-4 w-4/5 rounded-md" />
        </View>
      </Screen>
    );
  }

  if (isNotAvailable(query.error)) {
    return (
      <Screen header={header} scrollable={false}>
        <ScreenState
          action={{ label: 'Quay lại', onPress: router.back }}
          description="Tài liệu đã bị xoá, hoặc bạn không còn quyền xem."
          state="forbidden"
          title="Tài liệu không còn khả dụng"
        />
      </Screen>
    );
  }

  return (
    <Screen header={header} scrollable={false}>
      <ScreenState
        action={{ label: 'Thử lại', onPress: () => void query.refetch() }}
        description={docsErrorMessage(query.error)}
        state={isNetworkError(query.error) ? 'offline' : 'error'}
        title="Không mở được tài liệu"
      />
    </Screen>
  );
}
