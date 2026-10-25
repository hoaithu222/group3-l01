import { memo, useCallback, useMemo } from 'react';

import { Badge, Button, Table, Text } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatDate, formatRelativeTime } from '@/shared/utils/format';

import {
  biometricPlatformLabel,
  biometricRevokeReasonLabel,
  biometryKindLabel,
} from '../constants/biometric.constants';
import type { UserBiometricCredential } from '../types/user.types';

export interface UserBiometricTableProps {
  rows: UserBiometricCredential[];
  loading?: boolean;
  /** Có quyền `user:update` — chỉ khi đó mới hiện nút "Thu hồi" (chỉ ở hàng ACTIVE). */
  canRevoke: boolean;
  onRevoke: (row: UserBiometricCredential) => void;
}

/**
 * Bảng đăng nhập sinh trắc học của một người dùng.
 *
 * ⛔ KHÔNG bao giờ render `secretHash` hay `deviceId` đầy đủ: BE không trả hai
 * trường đó (chỉ có `deviceIdMasked`), và component này chỉ đọc đúng những
 * trường được khai ở `UserBiometricCredential` — kể cả khi một BE lỡ tay trả
 * thừa, chúng cũng không lên được DOM (xem `tests/features/user/no-secret-leak`).
 */
const UserBiometricTable = memo(function UserBiometricTable({
  rows,
  loading,
  canRevoke,
  onRevoke,
}: UserBiometricTableProps) {
  const columns = useMemo<TableColumn<UserBiometricCredential>[]>(
    () => [
      {
        key: 'device',
        header: 'Thiết bị',
        cell: (row) => (
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-fg-1">{row.deviceName?.trim() || 'Không rõ'}</span>
            {row.deviceIdMasked && (
              <span className="truncate text-caption-12 tabular-nums text-fg-4">
                {row.deviceIdMasked}
              </span>
            )}
          </div>
        ),
      },
      {
        key: 'platform',
        header: 'Nền tảng',
        width: 84,
        cell: (row) => biometricPlatformLabel(row.platform),
      },
      {
        key: 'biometryKind',
        header: 'Loại',
        width: 96,
        cell: (row) => biometryKindLabel(row.biometryKind, row.platform),
      },
      {
        key: 'createdAt',
        header: 'Bật lúc',
        width: 100,
        cell: (row) => <span className="tabular-nums">{formatDate(row.createdAt)}</span>,
      },
      {
        key: 'lastUsedAt',
        header: 'Dùng gần nhất',
        width: 116,
        cell: (row) => (row.lastUsedAt ? formatRelativeTime(row.lastUsedAt) : 'Chưa dùng'),
      },
      {
        key: 'expiresAt',
        header: 'Hết hạn',
        width: 100,
        cell: (row) => <span className="tabular-nums">{formatDate(row.expiresAt)}</span>,
      },
      {
        key: 'actions',
        header: 'Hành động',
        width: 176,
        cell: (row) => {
          if (row.status === 'REVOKED') {
            return (
              <div className="flex flex-col items-start gap-0.5">
                <Badge color="neutral" variant="tinted">
                  Đã thu hồi
                </Badge>
                <div className="flex flex-wrap items-baseline gap-x-1">
                  <Text size="tiny" skin="muted">
                    {biometricRevokeReasonLabel(row.revokeReason)}
                  </Text>
                  {row.revokedAt && (
                    <Text className="tabular-nums" size="tiny" skin="muted">
                      · {formatDate(row.revokedAt)}
                    </Text>
                  )}
                </div>
              </div>
            );
          }
          return canRevoke ? (
            <Button size="sm" skin="danger" variant="ghost" onClick={() => onRevoke(row)}>
              Thu hồi
            </Button>
          ) : null;
        },
      },
    ],
    [canRevoke, onRevoke],
  );

  const rowKey = useCallback((row: UserBiometricCredential) => row.id, []);

  return (
    <Table columns={columns} data={rows} loading={loading} pagination={false} rowKey={rowKey} />
  );
});

export default UserBiometricTable;
