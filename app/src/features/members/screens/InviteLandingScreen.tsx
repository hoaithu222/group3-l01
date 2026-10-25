import { isAxiosError } from 'axios';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useConnectionState } from '@/core/socket';
import { PATHS } from '@/shell/config';
import { useAuthStore } from '@/shell/store/slices/auth';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import { InviteJoinActions } from '../components/InviteJoinActions';
import { InvitePreviewCard } from '../components/InvitePreviewCard';
import { useAcceptInvite, useInvitePreview } from '../queries/invites.queries';
import { pendingInviteStore } from '../store/pending-invite';

/** 410/403/404 có câu riêng theo app.md §3 — 410 gộp CHUNG một câu bất kể INV_001/002/003. */
function previewErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 410) return 'Lời mời không còn hiệu lực — xin người gửi link mới.';
    if (status === 404) return 'Không tìm thấy lời mời.';
  }
  // 403 (INV_004) đã trung tính sẵn trong `ERROR_CODE_MESSAGES` — không nói "bị chặn".
  return toErrorMessage(error);
}

/**
 * Đích deep link `superapp://invite/{code}` / `https://…/invite/{code}` — route
 * NẰM NGOÀI `(app)` để mở được cả khi CHƯA đăng nhập (xem placeholder cũ đã
 * thay ở `app/invite/[code].tsx`).
 */
export function InviteLandingScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const status = useAuthStore((state) => state.status);
  const isAuthenticated = status === 'authenticated';
  const isOffline = useConnectionState() === 'offline';

  const { data: preview, error, isError, isLoading } = useInvitePreview(code);
  const acceptInvite = useAcceptInvite();

  async function saveAndGo(destination: 'LOGIN' | 'REGISTER'): Promise<void> {
    if (code) await pendingInviteStore.save(code);
    router.push(destination === 'LOGIN' ? PATHS.LOGIN : PATHS.REGISTER);
  }

  function handleAccept(requestMessage?: string): void {
    if (!code) return;
    acceptInvite.mutate({ requestMessage, token: code }, {
      onSuccess: (result) => {
        hapticSuccess(); // đã vào nhóm (hoặc đã gửi yêu cầu) — rung báo xong trước lượt chuyển màn
        // p3-04: nhóm duyệt thành viên → mới chỉ là YÊU CẦU, chưa đọc được gì.
        if (result.status === 'PENDING') {
          router.replace({ pathname: '/workspaces/pending', params: { wsId: result.workspaceId } });
          return;
        }
        router.replace({ pathname: '/workspaces/[wsId]', params: { wsId: result.workspaceId } });
      },
      onError: (mutationError) => showToast('error', toErrorMessage(mutationError)),
    });
  }

  return (
    <Screen header={<AppBar title="Lời mời" />} keyboardAware>
      <View className="gap-md py-xs">
        {!code ? (
          <EmptyState
            description="Liên kết mời thiếu mã — thử mở lại từ tin nhắn gốc."
            icon="alert-warning"
            title="Liên kết không hợp lệ"
            tone="danger"
          />
        ) : isLoading ? (
          <Skeleton className="h-48 rounded-md" />
        ) : isError ? (
          <EmptyState
            description={previewErrorMessage(error)}
            icon="alert-warning"
            title="Không thể mở lời mời"
            tone="danger"
          />
        ) : preview ? (
          <>
            <InvitePreviewCard preview={preview} />
            {isOffline && isAuthenticated && !preview.alreadyMember ? (
              <EmptyState
                description="Kết nối lại để tham gia."
                icon="unlink"
                title="Bạn đang ngoại tuyến"
                tone="neutral"
              />
            ) : (
              <InviteJoinActions
                accepting={acceptInvite.isPending}
                alreadyMember={Boolean(preview.alreadyMember)}
                isAuthenticated={isAuthenticated}
                workspaceId={preview.workspace.id}
                onAccept={handleAccept}
                onLogin={() => void saveAndGo('LOGIN')}
                onRegister={() => void saveAndGo('REGISTER')}
              />
            )}
          </>
        ) : null}
      </View>
    </Screen>
  );
}
