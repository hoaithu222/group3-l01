import { AppError, UnauthorizedError } from "../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../core/utils/error.codes";

/** Mã lỗi `MEDIA_*` (p0-08 be.md §8) — factory để mọi adapter/service dùng chung một thông điệp/HTTP. */
export const mediaErrors = {
  /** 503 — thiếu `LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` (hoặc S3 egress khi ghi hình). */
  notConfigured: (reason?: "egress-s3" | "public-url") =>
    new AppError(ErrorMessages[ErrorCode.MEDIA_001], 503, ErrorCode.MEDIA_001, reason ? { reason } : undefined),
  /** 401 — webhook thiếu/sai chữ ký hoặc body bị sửa. */
  invalidSignature: () => new UnauthorizedError(ErrorMessages[ErrorCode.MEDIA_002], ErrorCode.MEDIA_002),
  /** 502 — không kết nối được / quá hạn khi gọi API LiveKit. `op` là tên thao tác cổng (an toàn để lộ). */
  unreachable: (op?: string) =>
    new AppError(ErrorMessages[ErrorCode.MEDIA_003], 502, ErrorCode.MEDIA_003, op ? { op } : undefined),
  /** 409 — phòng/participant không tồn tại hoặc đã đóng. */
  roomNotFound: () => new AppError(ErrorMessages[ErrorCode.MEDIA_004], 409, ErrorCode.MEDIA_004),
} as const;
