/**
 * Đường dẫn endpoint asset — nối sau `appConfig.apiBaseUrl`.
 *
 * ⚠️ Đã đối chiếu TRỰC TIẾP `be/src/modules/assets/assets.routes.ts` (không
 * suy từ `be.md`/`app.md`): cấp lại URL upload là `POST /assets/:id/upload-url`
 * (đúng như `app.md` gọi, be.md từng ghi `reissueUploadUrl` — TÊN HÀM, không
 * phải path).
 */
export const ASSET_ENDPOINTS = {
  /** `POST /assets` — tạo asset + chỉ dẫn upload (nhận header `Idempotency-Key`). */
  CREATE: '/assets',
} as const;

export function assetPath(id: string): string {
  return `/assets/${id}`;
}

export function assetCompletePath(id: string): string {
  return `/assets/${id}/complete`;
}

export function assetAbortPath(id: string): string {
  return `/assets/${id}/abort`;
}

/** URL upload MỚI khi cái cũ hết hạn hoặc cần thử lại — không tạo asset mới. */
export function assetUploadUrlPath(id: string): string {
  return `/assets/${id}/upload-url`;
}

export function assetUrlPath(id: string): string {
  return `/assets/${id}/url`;
}

/** Fallback Local/Cloudinary (`uploadMethod: 'API_PUT'`). */
export function assetContentPath(id: string): string {
  return `/assets/${id}/content`;
}
