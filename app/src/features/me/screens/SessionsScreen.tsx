import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import type { SessionSummary } from '@/core/api/auth';
import { toErrorMessage } from '@/core/api/client.helpers';
import { Card } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { Dialog } from '@/shared/ui/modal';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';

import { LogoutAllDevicesCard } from '../components/LogoutAllDevicesCard';
import { SessionRow } from '../components/SessionRow';
import {
  SESSION_REVOKE_DIALOG_TITLE,
  sessionRevokeDialogDescription,
} from '../constants/session.messages';
import { useRevokeSession, useSessions } from '../hooks/useSessions';

/**
 * "Phiên đăng nhập" (p0-01 mục 10, phần đã làm — KHÔNG bao gồm xoá tài
 * khoản/quyền riêng tư, việc đó nằm ngoài phạm vi màn này) — mở từ
 * `MeSettingsScreen` (`router.push(PATHS.ME_SESSIONS)`), nên có `onBack`.
 *
 * Liệt kê phiên đăng nhập ĐANG HOẠT ĐỘNG, cho thu hồi từng phiên, và (cuối màn) "Đăng xuất tất cả thiết bị" —
 * `LogoutAllDevicesCard`, cũng đăng xuất chính máy này nên có hộp xác nhận riêng.
 * ⛔ KHÔNG hiện "Thiết bị tin cậy" (danh sách biometric credential) ở đây —
 * đó là phạm vi P1 riêng của p0-13, chưa tới lượt.
 */
export function SessionsScreen() {
  const { data, error, isError, isLoading, isRefetching, refetch } = useSessions();
  const revokeSession = useRevokeSession();
  /** Phiên đang chờ NGƯỜI DÙNG xác nhận trong `Dialog` — `null` = hộp thoại đóng. */
  const [pendingRevoke, setPendingRevoke] = useState<SessionSummary | null>(null);

  function closeDialog(): void {
    setPendingRevoke(null);
  }

  function confirmRevoke(): void {
    if (!pendingRevoke) return;
    revokeSession.mutate(pendingRevoke.id, { onSuccess: closeDialog });
  }

  return (
    <Screen
      header={<AppBar title="Phiên đăng nhập" onBack={router.back} />}
      refreshing={isRefetching}
      onRefresh={() => void refetch()}
    >
      <View className="gap-md py-xs">
        {isLoading ? (
          <Card>
            <SkeletonParagraphWithIcon />
            <SkeletonParagraphWithIcon />
            <SkeletonParagraphWithIcon />
          </Card>
        ) : isError ? (
          <EmptyState
            actions={[{ label: 'Thử lại', onPress: () => void refetch() }]}
            description={toErrorMessage(error)}
            icon="alert-warning"
            title="Không tải được danh sách phiên đăng nhập"
            tone="danger"
          />
        ) : !data || data.length === 0 ? (
          <EmptyState
            description="Không có phiên đăng nhập nào đang hoạt động."
            icon="shield-user"
            title="Trống"
            tone="accent"
          />
        ) : (
          // `gap-0` + `padded={false}`: lề chuyển vào từng `SessionRow`, để kẻ
          // chia (`divider`) chạy hết bề rộng thẻ — cùng mẫu danh sách `ListItem` trong `Card`.
          <Card className="gap-0" padded={false}>
            {data.map((session, index) => (
              <SessionRow
                key={session.id}
                divider={index < data.length - 1}
                isRevoking={revokeSession.isPending && revokeSession.variables === session.id}
                session={session}
                onRevoke={setPendingRevoke}
              />
            ))}
          </Card>
        )}

        {/* Luôn hiện (kể cả khi danh sách lỗi/rỗng): đăng xuất mọi máy không phụ thuộc việc tải được danh sách phiên. */}
        <LogoutAllDevicesCard />
      </View>

      <Dialog
        description={pendingRevoke ? sessionRevokeDialogDescription(pendingRevoke) : undefined}
        primaryAction={{
          // ⚠️ CỐ Ý khác nhãn "Thu hồi" của nút mở hộp thoại: hai nút cùng chữ
          // trên cùng một màn hình (một ở hàng, một trong hộp thoại) không sai
          // về UX, nhưng `accessibilityLabel` trùng nhau thì trình đọc màn hình
          // không phân biệt được đang ở đâu khi hộp thoại vừa mở lên.
          label: 'Xác nhận',
          loading: revokeSession.isPending,
          onPress: confirmRevoke,
        }}
        secondaryAction={{ label: 'Huỷ', onPress: closeDialog }}
        title={SESSION_REVOKE_DIALOG_TITLE}
        variant="warning"
        visible={pendingRevoke !== null}
        onClose={closeDialog}
      />
    </Screen>
  );
}
