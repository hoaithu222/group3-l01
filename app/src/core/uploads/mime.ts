import type { Capabilities } from '@/core/capabilities';

import type { AssetKind } from './upload.types';

/**
 * Suy `kind`/validate MIME trước khi tạo asset — app.md §2 "validate theo
 * `capabilities.upload.kinds`".
 *
 * ⚠️ `Capabilities['upload']` hiện tại (`core/capabilities/capabilities.types.ts`,
 * BE p0-07) CHƯA có trường `kinds` — be.md §7 khai nó nhưng lượt p0-05 BE không
 * sửa `capabilities.service.ts`. Vì vậy: đọc `kinds` nếu BE có trả (tương lai
 * không phải sửa app), ⛔ KHÔNG throw nếu thiếu — rơi về bảng mặc định chép từ
 * `be.md` §7 `LIMITS.upload.kinds` bên dưới. Đổi số đo bên BE thì đổi Ở ĐÂY
 * theo, đây là bản SAO chứ không phải nguồn.
 */
export interface UploadKindLimit {
  maxBytes: number;
  mime: readonly string[];
  /** Chỉ có ý nghĩa với `VOICE`. */
  maxSeconds?: number;
}

const MB = 1024 * 1024;

const DEFAULT_UPLOAD_KINDS: Record<AssetKind, UploadKindLimit> = {
  IMAGE: {
    maxBytes: 20 * MB,
    mime: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif'],
  },
  VIDEO: { maxBytes: 100 * MB, mime: ['video/mp4', 'video/quicktime'] },
  AUDIO: {
    maxBytes: 25 * MB,
    mime: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav'],
  },
  VOICE: {
    maxBytes: 10 * MB,
    mime: ['audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/ogg'],
    maxSeconds: 300,
  },
  FILE: {
    maxBytes: 25 * MB,
    mime: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'application/zip',
      'text/csv',
    ],
  },
};

/** Hình dạng MỞ RỘNG chưa có trong `Capabilities` thật — đọc an toàn bằng ép kiểu cục bộ, không sửa type dùng chung. */
interface CapabilitiesWithUploadKinds {
  upload?: { kinds?: Partial<Record<AssetKind, UploadKindLimit>> };
}

export function resolveKindLimit(kind: AssetKind, capabilities?: Capabilities): UploadKindLimit {
  const fromServer = (capabilities as unknown as CapabilitiesWithUploadKinds | undefined)?.upload
    ?.kinds?.[kind];
  return fromServer ?? DEFAULT_UPLOAD_KINDS[kind];
}

export interface ValidateFileInput {
  kind: AssetKind;
  mime: string;
  size: number;
  durationMs?: number;
}

export type ValidateFileResult =
  | { ok: true }
  | { ok: false; code: 'ASSET_001' | 'ASSET_002' | 'ASSET_006' | 'ASSET_007'; message: string };

/** Validate PHÍA CLIENT trước khi gọi `POST /assets` — BE vẫn là nguồn sự thật cuối (đọc lại magic bytes). */
export function validateFile(
  input: ValidateFileInput,
  capabilities?: Capabilities,
): ValidateFileResult {
  const limit = resolveKindLimit(input.kind, capabilities);

  // BE bắt `size` là số nguyên DƯƠNG (`createAssetSchema`) — `0` nghĩa là không đo được tệp, chứ không phải tệp rỗng hợp lệ.
  if (!(input.size > 0)) {
    return { ok: false, code: 'ASSET_007', message: 'Không đọc được tệp này' };
  }
  if (!limit.mime.includes(input.mime)) {
    return { ok: false, code: 'ASSET_001', message: 'Định dạng không hỗ trợ' };
  }
  if (input.size > limit.maxBytes) {
    const maxMb = Math.floor(limit.maxBytes / MB);
    return { ok: false, code: 'ASSET_002', message: `Tệp quá lớn (tối đa ${maxMb} MB)` };
  }
  if (
    input.kind === 'VOICE' &&
    limit.maxSeconds !== undefined &&
    input.durationMs !== undefined &&
    input.durationMs > limit.maxSeconds * 1000
  ) {
    return { ok: false, code: 'ASSET_006', message: 'Ghi âm vượt quá thời lượng cho phép' };
  }
  return { ok: true };
}

/** Suy `AssetKind` từ MIME — dùng cho tệp chọn qua `expo-document-picker` (không tự khai kind). */
export function guessKindFromMime(mime: string): AssetKind {
  if (mime.startsWith('image/')) return 'IMAGE';
  if (mime.startsWith('video/')) return 'VIDEO';
  if (mime.startsWith('audio/')) return 'AUDIO';
  return 'FILE';
}

/** Câu lỗi tiếng Việt theo mã `ASSET_00x` — khớp `be/src/core/utils/error.codes.ts`. */
const ASSET_ERROR_MESSAGES: Record<string, string> = {
  ASSET_001: 'Định dạng không hỗ trợ',
  ASSET_002: 'Tệp quá lớn',
  ASSET_003: 'Tệp chưa sẵn sàng để sử dụng',
  ASSET_004: 'Bạn không thể thao tác với tệp này ở trạng thái hiện tại',
  ASSET_005: 'Tệp không thuộc quyền sử dụng của bạn',
  ASSET_006: 'Ghi âm vượt quá thời lượng cho phép',
  ASSET_007: 'Chưa nhận được nội dung tệp, hãy tải lên lại',
  ASSET_008: 'Không có bản xem trước cho tệp này',
  ASSET_009: 'Liên kết tải tệp đã hết hạn',
  // `POST /assets` sai định dạng/dung lượng khai báo bị `validateBody` bọc thành `VAL_001` (không có mã ASSET_00x riêng).
  VAL_001: 'Tệp không hợp lệ (định dạng hoặc dung lượng)',
};

export function assetErrorMessage(code?: string): string {
  if (!code) return 'Đã có lỗi xảy ra, thử lại';
  return ASSET_ERROR_MESSAGES[code] ?? 'Đã có lỗi xảy ra, thử lại';
}
