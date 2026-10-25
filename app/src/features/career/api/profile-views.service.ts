import { cursorList } from './offers.service';
import { PROFILE_VIEWS_PATH } from './recruiter.api';
import type { CursorPage, ProfileView } from './recruiter.types';

/** Số dòng một trang — dưới trần của BE (`LIMITS.offer.listPageMax` = 50); mỗi dòng là một doanh nghiệp-ngày nên 30 đủ phủ vài tuần. */
const PROFILE_VIEWS_PAGE_SIZE = 30;

/**
 * "Ai đã xem hồ sơ của tôi" (BE `GET /me/profile-views`): doanh nghiệp nào xem hồ sơ tôi, theo NGÀY, mới nhất trước.
 * `skipErrorToast`: màn tự hiện lỗi đúng chỗ (404 `CFG_005` ⇒ "Chưa khả dụng", mất mạng ⇒ "Thử lại") — toast thêm là hai lần.
 */
export const profileViewsService = {
  list(cursor?: string): Promise<CursorPage<ProfileView>> {
    return cursorList<ProfileView>(PROFILE_VIEWS_PATH, { cursor, limit: PROFILE_VIEWS_PAGE_SIZE });
  },
};
