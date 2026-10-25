import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { PATHS } from '@/shell/config';
import { useLogout } from '@/shell/session/useLogout';
import { useAuthStore } from '@/shell/store/slices/auth';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';
import { hapticSuccess } from '@/shared/utils/haptics';
import { VerifyEmailSheet } from '@/shared/verify-email';

import { AcceptInvitationCard } from '../components/AcceptInvitationCard';
import { AcceptInvitationProblem } from '../components/AcceptInvitationProblem';
import { useAcceptInvitation, useInvitationPreview } from '../queries/invitations.queries';
import { pendingInviteStore } from '../store/pending-invite';
import { classifyAcceptError, type AcceptFailure } from '../utils/invitation-errors';

/**
 * Đích của `https://…/invite/e/{token}` / `superapp://invite/e/{token}` — lời mời
 * ĐÍCH DANH theo email (p3-04). Route NẰM NGOÀI `(app)` để mở được cả khi CHƯA đăng
 * nhập, cùng lý do `invite/[code]`.
 *
 * ⛔ Token chỉ nằm trong tham số route + kho khoá `pendingInvite` (kind `EMAIL`,
 * TTL 1 giờ, xoá khi đăng xuất/chấp nhận) — KHÔNG log, KHÔNG analytics, KHÔNG
 * AsyncStorage (app.md §4).
 *
 * Chưa đăng nhập → lưu token rồi sang Đăng nhập/Đăng ký; `completeSignIn` đưa họ về
 * đúng màn này (`redirectToPendingInvite`). Đã đăng nhập → "Tham gia"; BE kiểm
 * email khớp + đã xác minh, lỗi hiện thành NỘI DUNG màn (không toast) vì mỗi loại
 * cần một hành động khác nhau.
 */
export function AcceptInvitationScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const isAuthenticated = useAuthStore((state) => state.status === 'authenticated');
  const isOffline = useConnectionState() === 'offline';
  const preview = useInvitationPreview(token);
  const acceptInvitation = useAcceptInvitation();
  const { isPending: loggingOut, logout } = useLogout();
  const [failure, setFailure] = useState<AcceptFailure | null>(null);
  const [verifying, setVerifying] = useState(false);

  async function saveAndGo(destination: typeof PATHS.LOGIN | typeof PATHS.REGISTER): Promise<void> {
    if (token) await pendingInviteStore.save(token, 'EMAIL');
    router.push(destination);
  }

  function handleAccept(): void {
    if (!token) return;
    setFailure(null);
    acceptInvitation.mutate(token, {
      onSuccess: (result) => {
        hapticSuccess(); // đã vào nhóm (hoặc đã gửi yêu cầu) — rung báo xong trước lượt chuyển màn
        const pending = result.membership.status === 'PENDING';
        router.replace(
          pending
            ? { pathname: '/workspaces/pending', params: { wsId: result.workspaceId } }
            : { pathname: '/workspaces/[wsId]', params: { wsId: result.workspaceId } },
        );
      },
      onError: (error) => setFailure(classifyAcceptError(error)),
    });
  }

  /** Xác minh xong (hoặc đã xác minh sẵn) → đóng tấm và chấp nhận lại lời mời luôn, người dùng không phải bấm "Thử lại". */
  function handleVerified(): void {
    setVerifying(false);
    handleAccept();
  }

  function handleLogout(): void {
    // `useLogout` xoá `pendingInvite` ngay khi đăng xuất — lưu LẠI sau đó để người dùng đăng
    // nhập đúng tài khoản xong quay về lại đúng lời mời này (không phải xin link mới).
    logout(undefined, { onSettled: () => void (token ? pendingInviteStore.save(token, 'EMAIL') : undefined) });
  }

  const previewFailure = preview.isError ? classifyAcceptError(preview.error) : null;
  const shown = failure ?? previewFailure;
  // Lời mời đã dùng/thu hồi/hết hạn nhưng bản xem trước vẫn trả 200 kèm `status` khác PENDING.
  const inactive = preview.data !== undefined && preview.data.status !== 'PENDING';

  return (
    <Screen header={<AppBar title="Lời mời tham gia" />}>
      <View className="gap-md py-xs">
        {!token ? (
          <EmptyState
            description="Liên kết mời thiếu mã — thử mở lại từ email gốc."
            icon="alert-warning"
            title="Liên kết không hợp lệ"
            tone="danger"
          />
        ) : preview.isLoading ? (
          <Skeleton className="h-48 rounded-md" />
        ) : shown ? (
          <AcceptInvitationProblem
            emailHint={preview.data?.emailHint}
            failure={shown}
            loggingOut={loggingOut}
            onGoHome={() => router.replace(PATHS.HOME)}
            onLogout={handleLogout}
            onRetry={handleAccept}
            onVerifyEmail={() => setVerifying(true)}
          />
        ) : inactive ? (
          <AcceptInvitationProblem
            failure={{ kind: 'EXPIRED' }}
            onGoHome={() => router.replace(PATHS.HOME)}
            onLogout={handleLogout}
            onRetry={handleAccept}
          />
        ) : preview.data ? (
          <>
            <AcceptInvitationCard minimal={!isAuthenticated} preview={preview.data} />
            {!isAuthenticated ? (
              <View className="gap-sm">
                <Button fullWidth label="Đăng nhập để tham gia" onPress={() => void saveAndGo(PATHS.LOGIN)} />
                <Button
                  fullWidth
                  label="Tạo tài khoản"
                  variant="secondary"
                  onPress={() => void saveAndGo(PATHS.REGISTER)}
                />
              </View>
            ) : isOffline ? (
              <EmptyState
                description="Kết nối lại để tham gia."
                icon="unlink"
                title="Bạn đang ngoại tuyến"
                tone="neutral"
              />
            ) : (
              <Button fullWidth label="Tham gia" loading={acceptInvitation.isPending} onPress={handleAccept} />
            )}
          </>
        ) : null}
      </View>
      <VerifyEmailSheet
        emailHint={preview.data?.emailHint}
        intro="Lời mời chỉ mở được khi email của tài khoản đã được xác minh. Mã có hiệu lực 15 phút."
        visible={verifying}
        onClose={() => setVerifying(false)}
        onVerified={handleVerified}
      />
    </Screen>
  );
}
