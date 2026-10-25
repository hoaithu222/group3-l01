import { memo, useCallback, useState, type ReactNode } from 'react';

import { useAuthStore } from '@/app/store';
import { useDisclosure, useQueryParams } from '@/shared/hooks';
import {
  Callout,
  ConfirmWithReasonModal,
  EmptyState,
  SectionHeader,
  SegmentToggle,
} from '@/shared/ui';

import { BIOMETRIC_STATUS_OPTIONS, BIOMETRIC_STATUS_PARAM } from '../constants/biometric.constants';
import { useRevokeBiometricCredential, useUserBiometricCredentials } from '../service/user.queries';
import type { BiometricStatusFilter, UserBiometricCredential } from '../types/user.types';
import UserBiometricTable from './UserBiometricTable';

export interface UserBiometricSectionProps {
  userId: string;
}

/**
 * Mục "Đăng nhập sinh trắc học" của tab Phiên — máy nào người dùng đang bật
 * Face ID / vân tay để vào app, và thu hồi khi máy bị mất / nghi lộ.
 *
 * Bộ lọc sống trên URL (`?bioStatus=REVOKED`, mặc định ACTIVE thì bỏ hẳn khoá)
 * và đi qua `updateParams` chứ KHÔNG `setParam`: `setParam` tự reset `?page=` về
 * 1, mà `?page=` ở đây là của bảng người dùng nằm PHÍA SAU drawer. Giá trị đọc
 * từ URL luôn bị ép về hai giá trị hợp lệ (`test-viewpoint.md §1`).
 */
const UserBiometricSection = memo(function UserBiometricSection({
  userId,
}: UserBiometricSectionProps) {
  const { getParam, updateParams } = useQueryParams();
  const status: BiometricStatusFilter =
    getParam(BIOMETRIC_STATUS_PARAM) === 'REVOKED' ? 'REVOKED' : 'ACTIVE';
  const canRevoke = useAuthStore((s) => s.hasPermission('user', 'update'));

  const { data, isLoading, isError } = useUserBiometricCredentials(userId, status);
  const revoke = useRevokeBiometricCredential(userId);
  const rows = data?.data ?? [];

  // Giữ `target` sau khi đóng modal để nội dung không nháy trống lúc đang trượt ra.
  const [target, setTarget] = useState<UserBiometricCredential | null>(null);
  const { isOpen, open, close } = useDisclosure();

  const handleStatusChange = useCallback(
    (next: string) =>
      updateParams({ [BIOMETRIC_STATUS_PARAM]: next === 'REVOKED' ? 'REVOKED' : null }),
    [updateParams],
  );

  const handleRevoke = useCallback(
    (row: UserBiometricCredential) => {
      setTarget(row);
      open();
    },
    [open],
  );

  let body: ReactNode;
  if (isError) {
    body = (
      <Callout
        description="Vui lòng thử lại sau ít phút."
        intent="error"
        title="Không tải được danh sách đăng nhập sinh trắc học"
      />
    );
  } else if (!isLoading && rows.length === 0) {
    body = (
      <EmptyState
        icon="shield-check-bold"
        size="sm"
        title={
          status === 'ACTIVE'
            ? 'Người dùng chưa bật đăng nhập sinh trắc học trên thiết bị nào'
            : 'Chưa có đăng nhập sinh trắc học nào bị thu hồi'
        }
      />
    );
  } else {
    body = (
      <UserBiometricTable
        canRevoke={canRevoke}
        loading={isLoading}
        rows={rows}
        onRevoke={handleRevoke}
      />
    );
  }

  return (
    <section aria-label="Đăng nhập sinh trắc học" className="flex flex-col gap-2">
      <SectionHeader
        right={
          <SegmentToggle
            aria-label="Lọc theo trạng thái đăng nhập sinh trắc học"
            fitContent
            options={BIOMETRIC_STATUS_OPTIONS}
            size="sm"
            value={status}
            variant="subtle"
            onValueChange={handleStatusChange}
          />
        }
        title="Đăng nhập sinh trắc học"
      />
      {body}
      <ConfirmWithReasonModal
        confirmLabel="Thu hồi"
        confirmTone="danger"
        impact={`Thiết bị ${target?.deviceName?.trim() || 'Không rõ'} sẽ phải đăng nhập lại bằng mật khẩu. Phiên đang mở trên thiết bị đó không bị ngắt — dùng tab Phiên để thu hồi phiên nếu cần.`}
        open={isOpen}
        title="Thu hồi đăng nhập sinh trắc học"
        onConfirm={async (reason) => {
          if (!target) return;
          await revoke.mutateAsync({ credentialId: target.id, reason });
        }}
        onOpenChange={(next) => !next && close()}
      />
    </section>
  );
});

export default UserBiometricSection;
