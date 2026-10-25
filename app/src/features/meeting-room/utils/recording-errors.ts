import { isAxiosError } from 'axios';

import { toErrorMessage } from '@/core/api/client.helpers';

interface ErrorBody {
  error?: { code?: string; details?: { declinedCount?: number; pendingCount?: number } };
}

export interface RecordingFailure {
  code: string | null;
  message: string;
}

/**
 * Lỗi ghi hình trong phòng (BE `REC_*` — p2-06 be.md §8) → câu cho người dùng. `REC_001` nói SỐ người chưa đồng ý (không tên); `REC_003` là lỗi
 * tạm của hạ tầng ("thử lại"); `REC_008` = yêu cầu đồng ý hết hạn. Nhãn đặt trong feature (`shared/constants/error-codes.ts` đã chạm trần —
 * cùng cách p2-05 `BLOCKED_COPY`).
 */
export function recordingFailure(error: unknown): RecordingFailure {
  if (!isAxiosError(error) || !error.response) return { code: null, message: toErrorMessage(error) };
  const body = error.response.data as ErrorBody | undefined;
  const code = body?.error?.code ?? null;
  const details = body?.error?.details;
  switch (code) {
    case 'REC_001': {
      const pending = details?.pendingCount ?? 0;
      const declined = details?.declinedCount ?? 0;
      const parts = [pending > 0 ? `${String(pending)} người chưa trả lời` : null, declined > 0 ? `${String(declined)} người từ chối` : null].filter(Boolean);
      return { code, message: `Chưa bắt đầu ghi được: ${parts.join(', ') || 'còn người chưa đồng ý'}.` };
    }
    case 'REC_002':
      return { code, message: 'Cuộc họp đang được ghi hình.' };
    case 'REC_003':
      return { code, message: 'Không thể bắt đầu ghi hình lúc này. Hãy thử lại sau ít phút.' };
    case 'REC_006':
      return { code, message: 'Cuộc họp này không cho phép ghi hình.' };
    case 'REC_007':
      return { code, message: 'Chỉ ghi hình được khi cuộc họp đang diễn ra.' };
    case 'REC_008':
      return { code, message: 'Yêu cầu đồng ý đã hết hạn — hãy gửi lại yêu cầu.' };
    case 'REC_009':
      return { code, message: 'Hệ thống lưu trữ hiện tại không hỗ trợ ghi hình.' };
    default:
      return { code, message: toErrorMessage(error) };
  }
}
