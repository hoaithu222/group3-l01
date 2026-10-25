import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';

import { Badge, Button, Callout, ConfirmDialog, EmptyState, Table, Text } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatDate, formatRelativeTime } from '@/shared/utils/format';

import { sessionAuthMethodLabel } from '../constants/biometric.constants';
import { useRevokeSession, useUserSessions } from '../service/user.queries';
import type { UserSession } from '../types/user.types';
import { sessionDeviceLabel } from '../utils/session-device';
import UserBiometricSection from './UserBiometricSection';

export interface UserSessionsTabProps {
  userId: string;
}

/**
 * Tab "Phiên" — danh sách phiên đăng nhập còn hiệu lực + thu hồi từng phiên,
 * rồi mục "Đăng nhập sinh trắc học" (máy nào đang bật Face ID / vân tay) bên dưới.
 *
 * Mục sinh trắc học hiện KỂ CẢ khi không còn phiên nào: khoá tài khoản thu hồi
 * hết phiên nhưng chưa chắc đã thu hồi credential (và ngược lại).
 *
 * Mã thiết bị chỉ hiện dạng đã che ("••••" + 6 ký tự cuối, `sessionDeviceLabel`): quản trị viên xem
 * hộ người khác nhận `deviceIdMasked` từ BE; chỉ khi xem phiên của CHÍNH MÌNH BE mới trả `deviceId`
 * đầy đủ — và cũng bị che lại ở đây. Phiên đang dùng (`isCurrent`) không có nút thu hồi: BE từ chối
 * (400) — hãy đăng xuất thay vì thu hồi.
 */
const UserSessionsTab = memo(function UserSessionsTab({ userId }: UserSessionsTabProps) {
  const { data, isLoading, isError, refetch } = useUserSessions(userId);
  const revokeSession = useRevokeSession(userId);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const sessions = data?.data ?? [];

  const handleConfirmRevoke = useCallback(() => {
    if (!pendingId) return;
    revokeSession.mutate(pendingId, { onSettled: () => setPendingId(null) });
  }, [pendingId, revokeSession]);

  const columns = useMemo<TableColumn<UserSession>[]>(
    () => [
      {
        key: 'userAgent',
        header: 'Thiết bị',
        cell: (row) => {
          const device = sessionDeviceLabel(row);
          return (
            <div className="flex min-w-0 flex-col">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-fg-1">{row.userAgent ?? 'Không rõ'}</span>
                {row.isOriginDevice && (
                  <Badge color="neutral" variant="tinted">
                    Thiết bị gốc
                  </Badge>
                )}
                {row.isNewDevice && (
                  <Badge color="warning" variant="tinted">
                    Mới
                  </Badge>
                )}
              </span>
              {device && (
                <span className="truncate text-caption-12 tabular-nums text-fg-4">
                  Mã thiết bị {device}
                </span>
              )}
            </div>
          );
        },
      },
      {
        key: 'authMethod',
        header: 'Cách đăng nhập',
        width: 120,
        cell: (row) => sessionAuthMethodLabel(row.authMethod),
      },
      { key: 'ipAddress', header: 'IP', width: 120, cell: (row) => row.ipAddress ?? '—' },
      {
        key: 'lastUsedAt',
        header: 'Hoạt động gần nhất',
        width: 140,
        cell: (row) => formatRelativeTime(row.lastUsedAt),
      },
      {
        key: 'expiresAt',
        header: 'Hết hạn',
        width: 132,
        cell: (row) => (row.expiresAt ? formatDate(row.expiresAt, 'HH:mm DD/MM/YYYY') : '—'),
      },
      {
        key: 'actions',
        header: '',
        width: 96,
        cell: (row) => {
          if (row.revokedAt || row.isCurrent) {
            return (
              <Text size="tiny" skin="muted">
                {row.revokedAt ? 'Đã thu hồi' : 'Phiên hiện tại'}
              </Text>
            );
          }
          return (
            <Button size="sm" skin="danger" variant="ghost" onClick={() => setPendingId(row.id)}>
              Thu hồi
            </Button>
          );
        },
      },
    ],
    [],
  );

  const rowKey = useCallback((row: UserSession) => row.id, []);

  let body: ReactNode;
  if (isError) {
    body = (
      <Callout
        action={
          <Button size="sm" variant="stroke" onClick={() => void refetch()}>
            Thử lại
          </Button>
        }
        description="Kiểm tra kết nối rồi thử lại."
        intent="error"
        title="Không tải được danh sách phiên đăng nhập"
      />
    );
  } else if (!isLoading && sessions.length === 0) {
    body = (
      <EmptyState
        description="Người dùng chưa đăng nhập trên thiết bị nào."
        icon="clock-bold"
        size="sm"
        title="Không có phiên nào"
      />
    );
  } else {
    body = (
      <Table
        columns={columns}
        data={sessions}
        loading={isLoading}
        pagination={false}
        rowKey={rowKey}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {body}
      <UserBiometricSection userId={userId} />
      <ConfirmDialog
        actionLabel="Thu hồi"
        cancelLabel="Huỷ"
        description="Người dùng sẽ bị đăng xuất khỏi thiết bị này ngay lập tức."
        loading={revokeSession.isPending}
        open={pendingId !== null}
        title="Thu hồi phiên đăng nhập?"
        variant="delete"
        onCancel={() => setPendingId(null)}
        onConfirm={handleConfirmRevoke}
        onOpenChange={(next) => !next && setPendingId(null)}
      />
    </div>
  );
});

export default UserSessionsTab;
