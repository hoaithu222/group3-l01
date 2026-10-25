import { memo, useId, type ReactNode } from 'react';

import { Avatar, Badge, Button, Text, type SystemIconName } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { formatDate, statusBadge } from '@/shared/utils/format';

import { USER_ROLE_LABEL } from '../constants/user.constants';
import type { AdminUser } from '../types/user.types';

interface InfoRowProps {
  icon: SystemIconName;
  label: string;
  children: ReactNode;
}

/** Hàng "icon · nhãn · giá trị" — nhãn bề rộng cố định để cột luôn thẳng hàng. */
const InfoRow = memo(function InfoRow({ icon, label, children }: InfoRowProps) {
  return (
    <div className="flex items-start gap-2 border-b border-divider-1 py-2.5 last:border-b-0">
      <SystemIcon className="mt-0.5 shrink-0 text-fg-4" name={icon} size={14} />
      <span className="w-32 shrink-0 pt-0.5 text-body-14 text-fg-3">{label}</span>
      <div className="min-w-0 flex-1 break-words text-fg-1">{children}</div>
    </div>
  );
});

export interface UserProfileTabProps {
  user: AdminUser;
  /** Có `user:update` — điều kiện tối thiểu để thấy nút khoá/mở/đổi vai trò. */
  canUpdate: boolean;
  /** `canUpdate` VÀ vai `admin` — BE chỉ cho `admin` gọi `PATCH /:id/role`. */
  canChangeRole: boolean;
  /**
   * Có `user:delete` VÀ KHÔNG PHẢI đang xem chính mình — BE chặn tự xoá
   * (400 `USER_014`), ẩn nút thẳng thay vì để người dùng gặp lỗi.
   */
  canDelete: boolean;
  /**
   * Vì sao KHÔNG khoá/mở khoá được (chờ xoá · đã ẩn danh · chính mình) — `null` = được. Có lý do thì nút
   * bị khoá và lý do hiện thành CHÚ THÍCH thường trực (không chỉ tooltip: cảm ứng không có hover).
   * BE trả 409/400 cho các ca này (`utils/user-guards.ts`).
   */
  lockBlockedReason: string | null;
  /** Vì sao KHÔNG đổi vai trò được (chính mình — BE 400) — `null` = được. */
  roleBlockedReason: string | null;
  onLock: () => void;
  onUnlock: () => void;
  onChangeRole: () => void;
  onDelete: () => void;
  /** Mở hộp thoại gỡ ảnh đại diện vi phạm — nút chỉ hiện khi `canUpdate` và người dùng đang có ảnh. */
  onRemoveAvatar: () => void;
}

/** Tab "Hồ sơ" của `UserDetailDrawer` — thông tin tĩnh + hành động quản trị. */
const UserProfileTab = memo(function UserProfileTab({
  user,
  canUpdate,
  canChangeRole,
  canDelete,
  lockBlockedReason,
  roleBlockedReason,
  onLock,
  onUnlock,
  onChangeRole,
  onDelete,
  onRemoveAvatar,
}: UserProfileTabProps) {
  const noteId = useId();
  const lockNoteId = `${noteId}-lock`;
  const roleNoteId = `${noteId}-role`;
  const status = statusBadge('user', user.status);
  const isLocked = user.status === 'LOCKED';
  // Chỉ khởi tạo xoá từ trạng thái ACTIVE — PENDING_DELETION đã có luồng riêng (banner + "Huỷ yêu
  // cầu xoá" ở `UserDetailDrawer`), ANONYMIZED đã xong. LOCKED: BE vẫn nhận `POST /:id/anonymize`
  // nhưng `cancelDeletionAdmin` đưa tài khoản về ACTIVE (mất trạng thái khoá) — giữ UI bắt mở khoá
  // (có lý do, có nhật ký) trước khi xoá.
  const canInitiateDelete = canDelete && user.status === 'ACTIVE';

  return (
    <div className="flex flex-col gap-3">
      {/* `avatarUrl` là URL ký sẵn (không cần Bearer); ảnh lỗi/hết hạn thì `Avatar` tự lùi về chữ cái đầu. */}
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={user.name} size="xl" src={user.avatarUrl ?? undefined} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-body-16-medium text-fg-1">{user.name}</span>
          <span className="truncate text-body-14 text-fg-3">{user.email}</span>
        </div>
        {canUpdate && user.avatarUrl && (
          <Button size="sm" skin="danger" variant="stroke" onClick={onRemoveAvatar}>
            Gỡ ảnh đại diện
          </Button>
        )}
      </div>
      <div className="border border-border-1 bg-bg-2/30 px-3">
        <InfoRow icon="envelope-bold" label="Email">
          {user.email}
        </InfoRow>
        <InfoRow icon="shield-bold" label="Vai trò">
          <Badge variant="tinted">{USER_ROLE_LABEL[user.role] ?? user.role}</Badge>
        </InfoRow>
        <InfoRow icon="circle-check-bold" label="Trạng thái">
          <Badge color={status.variant} variant="tinted">
            {status.label}
          </Badge>
        </InfoRow>
        <InfoRow icon="circle-check-bold" label="Email xác minh">
          {user.emailVerified ? 'Đã xác minh' : 'Chưa xác minh'}
        </InfoRow>
        <InfoRow icon="calendar-bold" label="Tạo lúc">
          {formatDate(user.createdAt, 'HH:mm DD/MM/YYYY')}
        </InfoRow>
      </div>

      {canUpdate && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {isLocked ? (
              <Button
                aria-describedby={lockBlockedReason ? lockNoteId : undefined}
                disabled={lockBlockedReason !== null}
                size="sm"
                variant="stroke"
                onClick={onUnlock}
              >
                Mở khoá tài khoản
              </Button>
            ) : (
              <Button
                aria-describedby={lockBlockedReason ? lockNoteId : undefined}
                disabled={lockBlockedReason !== null}
                size="sm"
                skin="danger"
                variant="stroke"
                onClick={onLock}
              >
                Khoá tài khoản
              </Button>
            )}
            {canChangeRole && (
              <Button
                aria-describedby={roleBlockedReason ? roleNoteId : undefined}
                disabled={roleBlockedReason !== null}
                size="sm"
                variant="stroke"
                onClick={onChangeRole}
              >
                Đổi vai trò
              </Button>
            )}
            {canInitiateDelete && (
              <Button size="sm" skin="danger" variant="stroke" onClick={onDelete}>
                Xoá tài khoản
              </Button>
            )}
          </div>
          {lockBlockedReason && (
            <Text id={lockNoteId} size="tiny" skin="muted">
              {lockBlockedReason}
            </Text>
          )}
          {canChangeRole && roleBlockedReason && (
            <Text id={roleNoteId} size="tiny" skin="muted">
              {roleBlockedReason}
            </Text>
          )}
        </div>
      )}
    </div>
  );
});

export default UserProfileTab;
