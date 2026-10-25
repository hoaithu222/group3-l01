import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { LOCATIONS_NEAR_PATH, locationPath, locationReviewsPath, myReviewPath } from './o2o.api';
import type {
  CursorMeta,
  LocationDetail,
  NearLocation,
  NearQuery,
  ReviewPayload,
  ReviewSaved,
  ReviewsPage,
  ReviewView,
} from './o2o.types';

/** Số kết quả mỗi trang đánh giá — BE `cursorQuerySchema` mặc định, chọn nhỏ vì mỗi dòng có bình luận dài. */
export const REVIEWS_PAGE_SIZE = 10;

export const locationsService = {
  /**
   * `GET /locations/near`. Toạ độ chỉ đi trong query (BE không lưu, không log — README p6-05 §2).
   * `amenities` là CSV ("wifi_fast,quiet_zone") chứ KHÔNG phải mảng lặp `key=a&key=b`: `nearQuerySchema` tách chuỗi.
   * BE cắt ≤ 50 và đã sắp theo khoảng cách nên app không sắp lại.
   */
  async near(query: NearQuery): Promise<NearLocation[]> {
    const response = await apiClient.get(LOCATIONS_NEAR_PATH, {
      params: {
        lat: query.lat,
        lng: query.lng,
        radiusM: query.radiusM,
        type: query.type,
        amenities: query.amenities?.length ? query.amenities.join(',') : undefined,
        openNow: query.openNow ? true : undefined,
      },
    });
    return unwrapData<NearLocation[]>(response);
  },

  /** 404 `O2O_010` = địa điểm bị ẩn/không còn — màn chi tiết tự đọc mã, nên tắt toast. */
  async detail(locationId: string): Promise<LocationDetail> {
    const response = await apiClient.get(locationPath(locationId), { skipErrorToast: true });
    return unwrapData<LocationDetail>(response);
  },

  /** Đọc THẲNG `response.data` (không `unwrapData`) để giữ `meta` cursor — cùng cách `resources.service`. */
  async reviews(locationId: string, cursor: string | undefined): Promise<ReviewsPage> {
    const response = await apiClient.get<{ data: ReviewView[]; meta: CursorMeta }>(
      locationReviewsPath(locationId),
      { params: { cursor, limit: REVIEWS_PAGE_SIZE } },
    );
    return { items: response.data.data, meta: response.data.meta };
  },

  /** Ghi đè đánh giá của tôi (mỗi người một đánh giá mỗi địa điểm). Lỗi hiện trong tờ nhập, nên tắt toast. */
  async saveMyReview(locationId: string, payload: ReviewPayload): Promise<ReviewSaved> {
    const response = await apiClient.put(myReviewPath(locationId), payload, {
      skipErrorToast: true,
    });
    return unwrapData<ReviewSaved>(response);
  },

  async deleteMyReview(locationId: string): Promise<void> {
    await apiClient.delete(myReviewPath(locationId), { skipErrorToast: true });
  },
};
