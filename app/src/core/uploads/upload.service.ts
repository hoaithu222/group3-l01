import { apiClient, unwrapData } from '@/core/api';

import {
  ASSET_ENDPOINTS,
  assetAbortPath,
  assetCompletePath,
  assetPath,
  assetUploadUrlPath,
  assetUrlPath,
} from './upload.api';
import type {
  AssetDto,
  AssetVariant,
  CompleteAssetPayload,
  CreateAssetPayload,
  UploadInstruction,
} from './upload.types';

interface CreateAssetResponse {
  asset: AssetDto;
  upload: UploadInstruction;
}

interface AssetUrlResponse {
  url: string;
  expiresAt: string;
}

/**
 * Tầng gọi API asset — CHỈ giao tiếp HTTP với `/assets/*`.
 *
 * ⚠️ Việc TẢI NỘI DUNG thật (PUT presigned lên S3, multipart lên
 * `/assets/:id/content`) tách sang `upload.transport.ts` — file này chỉ còn
 * gọi JSON đơn thuần, giữ dưới trần 150 dòng (mẫu tách theo `core/api/auth/*`,
 * xem `auth.service.ts`).
 */
export const uploadService = {
  /** `POST /assets` — `idempotencyKey` PHẢI ổn định cho cùng một item (dùng `localId`). */
  async createAsset(
    payload: CreateAssetPayload,
    idempotencyKey: string,
  ): Promise<CreateAssetResponse> {
    const response = await apiClient.post<CreateAssetResponse>(ASSET_ENDPOINTS.CREATE, payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    return unwrapData<CreateAssetResponse>(response);
  },

  /** `POST /assets/:id/upload-url` — URL mới cho asset `UPLOADING` đã có, KHÔNG tạo asset mới. */
  async reissueUploadUrl(assetId: string): Promise<UploadInstruction> {
    const response = await apiClient.post<UploadInstruction>(assetUploadUrlPath(assetId));
    return unwrapData<UploadInstruction>(response);
  },

  async completeAsset(assetId: string, payload: CompleteAssetPayload): Promise<AssetDto> {
    const response = await apiClient.post<AssetDto>(assetCompletePath(assetId), payload);
    return unwrapData<AssetDto>(response);
  },

  /** Huỷ upload đang chờ — nơi gọi (`upload.runner.ts`) tự bỏ qua lỗi, xem app.md §4. */
  async abortAsset(assetId: string): Promise<void> {
    await apiClient.post(assetAbortPath(assetId), undefined, { skipErrorToast: true });
  },

  /** Dùng cho `pollReady()` — trạng thái mới nhất trong lúc `PROCESSING`. */
  async getAssetById(assetId: string): Promise<AssetDto> {
    const response = await apiClient.get<AssetDto>(assetPath(assetId));
    return unwrapData<AssetDto>(response);
  },

  async getAssetUrl(assetId: string, variant: AssetVariant = 'ORIGINAL'): Promise<AssetUrlResponse> {
    const response = await apiClient.get<AssetUrlResponse>(assetUrlPath(assetId), {
      params: { variant },
    });
    return unwrapData<AssetUrlResponse>(response);
  },
};
