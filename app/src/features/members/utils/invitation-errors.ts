import { toErrorMessage } from '@/core/api/client.helpers';

import { INVITATION_ERROR } from '../api';
import { readErrorInfo } from './error-info';

/**
 * Phân loại lỗi CHẤP NHẬN/XEM lời mời email (be.md p3-04 §4). Màn hiện NỘI DUNG
 * theo loại (không toast): `EMAIL_MISMATCH` cần nút Đăng xuất, `EXPIRED` cần
 * hướng dẫn xin lời mời mới — toast chung không nói được những điều đó.
 */
export type AcceptFailure =
  /** Tài khoản đang đăng nhập KHÁC email được mời. */
  | { kind: 'EMAIL_MISMATCH' }
  /** Đúng email nhưng CHƯA xác minh — cần xác minh rồi thử lại. */
  | { kind: 'EMAIL_NOT_VERIFIED' }
  /** 410 — hết hạn/đã thu hồi/đã dùng. */
  | { kind: 'EXPIRED' }
  | { kind: 'NOT_FOUND' }
  | { kind: 'BLOCKED' }
  | { kind: 'OTHER'; message: string };

export function classifyAcceptError(error: unknown): AcceptFailure {
  const { code, details, status } = readErrorInfo(error);

  if (code === INVITATION_ERROR.EMAIL_MISMATCH) {
    // `details.reason` phân biệt hai ca cùng mã (be.md §4). Thiếu/lạ → coi là KHÔNG KHỚP
    // (ca phổ biến hơn, và hướng dẫn "đăng nhập đúng tài khoản" vẫn đúng với cả hai).
    return details?.reason === 'EMAIL_NOT_VERIFIED' ? { kind: 'EMAIL_NOT_VERIFIED' } : { kind: 'EMAIL_MISMATCH' };
  }
  if (code === INVITATION_ERROR.EXPIRED || status === 410) return { kind: 'EXPIRED' };
  if (code === INVITATION_ERROR.BLOCKED) return { kind: 'BLOCKED' };
  if (status === 404) return { kind: 'NOT_FOUND' };
  return { kind: 'OTHER', message: toErrorMessage(error) };
}

/** Lỗi khi GỬI lời mời khách — quyết định lỗi hiện ở trường nào/banner nào. */
export type GuestInviteFailure =
  | 'GUEST_DISABLED'
  | 'CHANNEL_NOT_MANAGED'
  | 'ALREADY_MEMBER'
  | 'NO_PERMISSION'
  | 'OTHER';

export function classifyGuestInviteError(error: unknown): GuestInviteFailure {
  const { code, status } = readErrorInfo(error);
  if (code === INVITATION_ERROR.GUEST_DISABLED) return 'GUEST_DISABLED';
  if (code === INVITATION_ERROR.CHANNEL_NOT_MANAGED) return 'CHANNEL_NOT_MANAGED';
  if (code === INVITATION_ERROR.ALREADY_MEMBER) return 'ALREADY_MEMBER';
  if (status === 404) return 'NO_PERMISSION';
  return 'OTHER';
}
