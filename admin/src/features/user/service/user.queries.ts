import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { auditLogKeys } from '@/features/audit-log';
import { formatDate } from '@/shared/utils/format';
import { showToast } from '@/shared/utils/toast.utils';

import type { BiometricStatusFilter, UserListParams } from '../types/user.types';
import { isConflictError, resolveUserActionError, type UserAction } from '../utils/user-errors';
import { userService } from './user.service';

export const userKeys = {
  all: ['user'] as const,
  /** Tiền tố — invalidate MỌI trang/bộ lọc của danh sách người dùng. */
  lists: ['user', 'list'] as const,
  list: (p: UserListParams) => ['user', 'list', p] as const,
  detail: (id: string) => ['user', 'detail', id] as const,
  sessions: (id: string) => ['user', 'sessions', id] as const,
  /** Tiền tố — invalidate MỌI bộ lọc trạng thái của một người dùng. */
  biometricCredentials: (id: string) => ['user', 'biometric-credentials', id] as const,
  biometricCredentialsBy: (id: string, status: BiometricStatusFilter) =>
    ['user', 'biometric-credentials', id, status] as const,
};

/** `placeholderData: keepPreviousData` — đổi trang/lọc không nháy trắng bảng. */
export const useUserList = (params: UserListParams) =>
  useQuery({
    queryKey: userKeys.list(params),
    queryFn: () => userService.list(params),
    placeholderData: keepPreviousData,
  });

export const useUser = (id: string | undefined) =>
  useQuery({
    queryKey: userKeys.detail(id ?? ''),
    queryFn: () => userService.detail(id as string),
    enabled: !!id,
  });

export const useUserSessions = (id: string | undefined) =>
  useQuery({
    queryKey: userKeys.sessions(id ?? ''),
    queryFn: () => userService.sessions(id as string),
    enabled: !!id,
  });

/** Đăng nhập sinh trắc học của người dùng, lọc theo trạng thái (`?status=` phía BE). */
export const useUserBiometricCredentials = (
  id: string | undefined,
  status: BiometricStatusFilter,
) =>
  useQuery({
    queryKey: userKeys.biometricCredentialsBy(id ?? '', status),
    queryFn: () => userService.listBiometricCredentials(id as string, status),
    enabled: !!id,
  });

/**
 * Toast câu lỗi ĐÚNG NGHĨA cho `action` (`utils/user-errors.ts`). Service của các thao tác này dùng
 * `skipErrorToast` nên interceptor không toast — lỗi nào cũng phải đi qua đây.
 */
function toastActionError(err: unknown, action: UserAction): void {
  const message = resolveUserActionError(err, action);
  if (message) showToast('error', message);
}

export const useCreateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: userService.create,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: userKeys.all });
      showToast('success', 'Đã tạo người dùng');
    },
    onError: (err) => toastActionError(err, 'create'),
  });
};

export const useLockUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: userService.lock,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: userKeys.all });
      showToast('success', 'Đã khoá tài khoản và ghi nhật ký');
    },
    onError: (err) => {
      toastActionError(err, 'lock');
      // 409 = trạng thái tài khoản đã đổi (chờ xoá/ẩn danh) so với lúc mở drawer — làm mới để nút khoá chuyển thành chú thích.
      if (isConflictError(err)) void qc.invalidateQueries({ queryKey: userKeys.all });
    },
  });
};

export const useUnlockUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: userService.unlock,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: userKeys.all });
      showToast('success', 'Đã mở khoá tài khoản và ghi nhật ký');
    },
    onError: (err) => {
      toastActionError(err, 'unlock');
      if (isConflictError(err)) void qc.invalidateQueries({ queryKey: userKeys.all });
    },
  });
};

export const useChangeRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: userService.changeRole,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: userKeys.all });
      showToast('success', 'Đã đổi vai trò và ghi nhật ký');
    },
    onError: (err) => toastActionError(err, 'change-role'),
  });
};

/** Thu hồi MỘT phiên của người dùng `userId` — gắn cứng `userId` để invalidate đúng key. */
export const useRevokeSession = (userId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => userService.revokeSession({ id: userId, sessionId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: userKeys.sessions(userId) });
      showToast('success', 'Đã thu hồi phiên đăng nhập');
    },
  });
};

/**
 * Thu hồi MỘT đăng nhập sinh trắc học của người dùng `userId` (kèm lý do ≥ 10 ký
 * tự, BE ghi audit `user.biometric-revoke`). Lỗi server (vd 404 `RES_001`) đã được
 * axios interceptor toast bằng tiếng Việt qua `ERROR_CODE_MESSAGES` và mutation
 * reject — `ConfirmWithReasonModal` nhờ đó giữ modal mở.
 */
export const useRevokeBiometricCredential = (userId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ credentialId, reason }: { credentialId: string; reason: string }) =>
      userService.revokeBiometricCredential({ id: userId, credentialId, reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: userKeys.biometricCredentials(userId) });
      // ⛔ KHÔNG dùng `auditLogKeys.byTarget('User', userId)` để invalidate: nó thêm phần
      // tử `limit = undefined` ở cuối, mà React Query so khớp tiền tố từng phần tử nên
      // `undefined ≠ 20` ⇒ KHÔNG khớp key thật của panel (`[..., userId, 20]`) và lệnh
      // invalidate im lặng không làm gì. Dùng tiền tố `auditLogKeys.all`.
      void qc.invalidateQueries({ queryKey: auditLogKeys.all });
      showToast('success', 'Đã thu hồi và ghi nhật ký');
    },
  });
};

/**
 * Gỡ ảnh đại diện VI PHẠM của `userId` (kèm lý do, BE ghi audit `user.avatar-remove`). Làm mới hồ sơ + danh sách (ảnh
 * cũ hết hiện) và nhật ký. `removed: false` = người dùng đã tự gỡ ảnh trước đó — báo đúng thay vì "Đã gỡ". Lỗi do
 * interceptor toast; mutation reject nên `ConfirmWithReasonModal` giữ mở.
 */
export const useRemoveUserAvatar = (userId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => userService.removeAvatar({ id: userId, reason }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: userKeys.detail(userId) });
      void qc.invalidateQueries({ queryKey: userKeys.lists });
      void qc.invalidateQueries({ queryKey: auditLogKeys.all });
      if (res.data.removed) showToast('success', 'Đã gỡ ảnh đại diện và ghi nhật ký');
      else showToast('info', 'Người dùng không còn ảnh đại diện — không có gì để gỡ');
    },
  });
};

/** Ẩn danh hoá (GRACE — đặt lịch, hoặc NOW — ngay lập tức). */
export const useAnonymizeUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: userService.anonymize,
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: userKeys.all });
      const { status, deletionGraceUntil } = res.data;
      showToast(
        'success',
        status === 'ANONYMIZED'
          ? 'Đã ẩn danh hoá tài khoản ngay lập tức'
          : deletionGraceUntil
            ? `Đã đặt lịch xoá — tự động ẩn danh hoá lúc ${formatDate(deletionGraceUntil, 'HH:mm DD/MM/YYYY')} nếu không huỷ`
            : 'Đã đặt lịch xoá — người dùng còn thời gian ân hạn để tự huỷ',
      );
    },
  });
};

/** Huỷ yêu cầu xoá đang trong thời gian ân hạn (`PENDING_DELETION` → `ACTIVE`). */
export const useCancelAnonymizeUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: userService.cancelAnonymize,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: userKeys.all });
      showToast('success', 'Đã huỷ yêu cầu xoá tài khoản');
    },
  });
};
