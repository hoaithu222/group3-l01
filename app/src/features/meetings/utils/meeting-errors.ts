import { isAxiosError } from 'axios';

import { toErrorMessage } from '@/core/api/client.helpers';

import type { MeetingFormValues } from '../schemas/meeting-form.schema';

/**
 * Phân loại lỗi module họp (BE `MEET_*`, `RES_003`…). Mỗi loại một hướng xử lý: lỗi TRƯỜNG hiện tại ô nhập (giữ dữ liệu), lệch
 * version → banner "Tải lại" giữ bản nhập, không còn quyền/không thấy → màn "không còn khả dụng", còn lại → thông điệp chung.
 */
export type MeetingFailureKind =
  'FIELD' | 'FORBIDDEN' | 'INVALID_STATE' | 'NOT_FOUND' | 'OFFLINE' | 'OTHER' | 'VERSION_CONFLICT';

export interface MeetingFailure {
  code?: string;
  /** Trường form gắn lỗi (khi `kind = 'FIELD'`). */
  field?: keyof MeetingFormValues;
  kind: MeetingFailureKind;
  message: string;
}

const FIELD_BY_CODE: Record<string, keyof MeetingFormValues> = {
  MEET_003: 'endTime',
  MEET_004: 'startTime',
  MEET_005: 'attendeeIds',
  MEET_014: 'attendeeIds',
  MEET_015: 'externalUrl',
};

const MESSAGE_BY_CODE: Record<string, string> = {
  MEET_001: 'Cuộc họp không còn khả dụng.',
  MEET_002: 'Chỉ chủ trì hoặc đồng chủ trì được thực hiện thao tác này.',
  MEET_003: 'Giờ kết thúc phải sau giờ bắt đầu và cuộc họp dài tối đa 24 giờ.',
  MEET_004: 'Không thể đặt lịch họp trong quá khứ.',
  MEET_005: 'Cuộc họp đã đạt số người tham dự tối đa.',
  MEET_009: 'Thao tác không hợp lệ với trạng thái hiện tại của cuộc họp.',
  MEET_014: 'Người được mời phải là thành viên đang hoạt động của nhóm.',
  MEET_015: 'Liên kết họp không hợp lệ với nền tảng đã chọn.',
  MEET_016: 'Không thể xoá hoặc rút chủ trì — hãy chuyển quyền chủ trì trước.',
  RES_003: 'Cuộc họp đã được cập nhật bởi người khác.',
};

export function classifyMeetingError(error: unknown): MeetingFailure {
  if (!isAxiosError(error)) return { kind: 'OTHER', message: toErrorMessage(error) };
  if (!error.response) return { kind: 'OFFLINE', message: 'Cần kết nối mạng để thực hiện.' };

  const body = error.response.data as { error?: { code?: string; message?: string } } | undefined;
  const code = body?.error?.code ?? '';
  const status = error.response.status;
  const known = MESSAGE_BY_CODE[code];

  const field = FIELD_BY_CODE[code];
  if (field) return { code, field, kind: 'FIELD', message: known ?? '' };
  if (code === 'RES_003')
    return { code, kind: 'VERSION_CONFLICT', message: MESSAGE_BY_CODE.RES_003 ?? '' };
  if (code === 'MEET_001' || status === 404)
    return { code, kind: 'NOT_FOUND', message: MESSAGE_BY_CODE.MEET_001 ?? '' };
  if (code === 'MEET_002' || status === 403)
    return {
      code,
      kind: 'FORBIDDEN',
      message: known ?? 'Bạn không có quyền thực hiện thao tác này.',
    };
  if (code === 'MEET_009') return { code, kind: 'INVALID_STATE', message: known ?? '' };
  return { code, kind: 'OTHER', message: known ?? body?.error?.message ?? toErrorMessage(error) };
}
