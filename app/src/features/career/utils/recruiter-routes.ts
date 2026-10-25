import type { Href } from 'expo-router';

/**
 * Đường dẫn các màn Tìm việc / Lời mời (app.md p6-08 §1) — nằm trong ngăn xếp `me/career` (`app/(app)/me/career/*`), KHÔNG mở thư mục mới cấp
 * `(app)/` (Expo Router sẽ sinh thành TAB — xem `career-routes.ts`).
 *
 * ⚠️ Ép `as Href` vì route mới chưa chắc có trong `.expo/types/router.d.ts` (sinh lúc `expo start`); chuỗi thật luôn đúng. Đổi đường dẫn thì
 * sửa CẢ `core/notifications/job-offer-route.ts` (đích chạm thông báo lời mời — `core` không import feature nên khai lại chuỗi ở đó).
 */
export const JOB_SETTINGS_HREF = '/me/career/job-settings' as Href;
export const OFFERS_HREF = '/me/career/offers' as Href;
export const BLOCKED_COMPANIES_HREF = '/me/career/blocked-companies' as Href;
export const PROFILE_VIEWS_HREF = '/me/career/profile-views' as Href;

export const offerHref = (offerId: string): Href =>
  `/me/career/offers/${encodeURIComponent(offerId)}` as Href;

export const offerThreadHref = (offerId: string): Href =>
  `/me/career/offers/${encodeURIComponent(offerId)}/thread` as Href;
