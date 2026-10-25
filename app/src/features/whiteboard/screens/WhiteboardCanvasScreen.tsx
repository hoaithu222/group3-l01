import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Skeleton } from '@/shared/ui/skeleton';
import { isNetworkError } from '@/shared/utils/errors/to-error-message';

import { useWhiteboardsSocket } from '../hooks/useWhiteboardsSocket';
import { useWhiteboard } from '../queries/whiteboard.queries';
import { isNotAvailable, whiteboardErrorMessage } from '../utils/whiteboard-errors';
import { WhiteboardCanvasBody } from './WhiteboardCanvasBody';

/**
 * Màn bảng trắng (app.md §1, §3): nạp metadata + `myPermissions` (`GET /whiteboards/:id` — KHÔNG có nội dung), rồi giao cho `WhiteboardCanvasBody` (collab +
 * canvas). Nội dung nằm trong Y.Doc của phiên collab, không qua React Query. Trạng thái: tải (khung xương) · không còn/không có quyền (404 trung tính, cờ
 * `collab` tắt → `CFG_005`) → "Bảng trắng không còn khả dụng", KHÔNG nút Thử lại (vẫn 404) · lỗi mạng/BE → Thử lại. `useWhiteboardsSocket` giữ chi tiết đồng bộ
 * (đổi tên/lưu trữ từ máy khác). Mất quyền lúc ĐANG mở: `useLeaveOnRevoke` (trong thân) + `useWorkspaceSocket` của layout `[wsId]` (rời nhóm).
 */
export function WhiteboardCanvasScreen() {
  const { wbId, wsId } = useLocalSearchParams<{ wbId: string; wsId: string }>();
  const query = useWhiteboard(wbId);
  useWhiteboardsSocket(wsId);

  if (query.data) return <WhiteboardCanvasBody board={query.data} wsId={wsId} />;

  const header = <AppBar title="Bảng trắng" onBack={router.back} />;

  if (query.isLoading) {
    return (
      <Screen header={header} scrollable={false}>
        <View className="flex-1 p-md">
          <Skeleton className="h-full w-full rounded-md" />
        </View>
      </Screen>
    );
  }
  if (isNotAvailable(query.error)) {
    return (
      <Screen header={header} scrollable={false}>
        <ScreenState
          action={{ label: 'Quay lại', onPress: router.back }}
          description="Bảng trắng đã bị xoá, hoặc bạn không còn quyền xem."
          state="forbidden"
          title="Bảng trắng không còn khả dụng"
        />
      </Screen>
    );
  }
  return (
    <Screen header={header} scrollable={false}>
      <ScreenState
        action={{ label: 'Thử lại', onPress: () => void query.refetch() }}
        description={whiteboardErrorMessage(query.error)}
        state={isNetworkError(query.error) ? 'offline' : 'error'}
        title="Không mở được bảng"
      />
    </Screen>
  );
}
