import { toErrorMessage } from '@/core/api/client.helpers';

import { readErrorInfo } from './error-info';

/**
 * Câu lỗi cho màn "Thêm thành viên bằng SĐT/email" — viết RIÊNG thay vì dùng `toErrorMessage` vì bảng mã chung gán nghĩa khác cho
 * vài mã: `INV_004` ở đó là "Bạn không thể tham gia nhóm này" (nói với NGƯỜI VÀO NHÓM), còn ở đây nó nghĩa là "người được thêm
 * đang bị chặn khỏi nhóm"; `WS_006` ở đó nói "BẠN đã tham gia số nhóm tối đa" trong khi ở đây là người được thêm.
 */
const ADD_ERROR_MESSAGES: Record<string, string> = {
  INV_004: 'Người này đang bị chặn khỏi nhóm. Hãy bỏ chặn trước khi thêm.',
  // Trung tính có chủ đích: không nói ai chặn ai.
  BLOCK_003: 'Không thể thêm người này.',
  WS_006: 'Người này đã tham gia số nhóm tối đa.',
  WS_002: 'Nhóm đã được lưu trữ, không thể thêm thành viên.',
};

const RATE_LIMITED = 'Bạn thao tác quá nhanh. Hãy thử lại sau ít phút.';
const NO_PERMISSION = 'Chỉ chủ nhóm và quản trị viên mới thêm được thành viên.';

export function addMemberErrorMessage(error: unknown): string {
  const info = readErrorInfo(error);
  const byCode = info.code ? ADD_ERROR_MESSAGES[info.code] : undefined;
  if (byCode) return byCode;
  if (info.status === 429) return RATE_LIMITED;
  if (info.status === 403) return NO_PERMISSION;
  if (info.status === 404) return 'Không tìm thấy người dùng này.';
  return toErrorMessage(error);
}

export function lookupErrorMessage(error: unknown): string {
  const info = readErrorInfo(error);
  if (info.status === 429) return 'Bạn tra cứu quá nhiều lần. Hãy thử lại sau ít phút.';
  if (info.status === 403) return NO_PERMISSION;
  // 404 ở đường tra cứu = người dùng không còn thuộc nhóm này (route kiểm vai trò trước).
  if (info.status === 404) return 'Bạn không còn quyền trong nhóm này.';
  return toErrorMessage(error);
}
