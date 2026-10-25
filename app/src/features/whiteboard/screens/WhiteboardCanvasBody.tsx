import { router } from 'expo-router';
import { View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import type { WhiteboardDetail } from '../api/whiteboard.types';
import { useWhiteboardSession } from '../collab/useWhiteboardSession';
import { CanvasFailureView } from '../components/CanvasFailureView';
import { useLeaveOnRevoke } from '../hooks/useLeaveOnRevoke';
import { useSkiaModule } from '../hooks/useSkiaModule';
import { useWhiteboardSessionStore } from '../store/whiteboard-session.store';
import { WhiteboardStage } from './WhiteboardStage';

export interface WhiteboardCanvasBodyProps {
  board: WhiteboardDetail;
  wsId: string;
}

/**
 * Thân màn vẽ: mở phiên collab (`useWhiteboardSession`) rồi nạp LƯỜI Skia (`useSkiaModule` — bản dev client chưa build lại thì "chưa hỗ trợ bảng trắng"
 * chứ không đỏ cả app lúc khởi động). Trạng thái: chưa có Skia → khung xương · thiếu Skia → EmptyState · phiên lỗi nghiêm trọng → `CanvasFailureView`
 * (mất quyền thì `useLeaveOnRevoke` thoát màn) · còn lại → `WhiteboardStage`. Phiên collab chạy NGAY cả lúc đang nạp Skia — nạp Skia không kéo dài thời gian
 * chờ đồng bộ.
 */
export function WhiteboardCanvasBody({ board, wsId }: WhiteboardCanvasBodyProps) {
  const { canEdit, runtime } = useWhiteboardSession(board);
  const skia = useSkiaModule();
  const failure = useWhiteboardSessionStore((state) => state.failure);
  // Chọn ra MỘT boolean (không cả `snapshot`): thân màn chỉ vẽ lại khi cờ này lật, không phải mỗi lần trạng thái kết nối nhúc nhích.
  const everSynced = useWhiteboardSessionStore((state) => state.snapshot.everSynced);
  useLeaveOnRevoke(router.back);

  const header = <AppBar title={board.name} onBack={router.back} />;

  // Mất quyền (FORBIDDEN/NOT_FOUND) KHÔNG vẽ khối lỗi "Thử lại": `useLeaveOnRevoke` đang thoát màn, thử lại vẫn 403/404.
  const revoked = failure?.code === 'FORBIDDEN' || failure?.code === 'NOT_FOUND';
  if (
    failure &&
    !revoked &&
    (failure.fatal || failure.code === 'LOAD_FAILED' || failure.code === 'AUTH_EXPIRED')
  ) {
    return (
      <Screen header={header} scrollable={false}>
        <CanvasFailureView
          failure={failure}
          hasLocalWork={everSynced || runtime.hasLocalContent()}
          onLeave={router.back}
          onRetry={() => runtime.retry()}
        />
      </Screen>
    );
  }
  if (skia.status === 'unavailable') {
    return (
      <Screen header={header} scrollable={false}>
        <EmptyState
          actions={[{ label: 'Quay lại', onPress: router.back }]}
          description="Bản cài đặt này chưa có thành phần vẽ. Hãy cập nhật ứng dụng lên bản mới nhất rồi mở lại bảng."
          fullscreen
          icon="alert-warning"
          title="Chưa hỗ trợ bảng trắng"
          tone="warning"
        />
      </Screen>
    );
  }
  if (skia.status === 'loading') {
    return (
      <Screen header={header} scrollable={false}>
        <View className="flex-1 p-md">
          <Skeleton className="h-full w-full rounded-md" />
        </View>
      </Screen>
    );
  }
  return (
    <WhiteboardStage
      board={board}
      canEdit={canEdit}
      runtime={runtime}
      skia={skia.module}
      wsId={wsId}
    />
  );
}
