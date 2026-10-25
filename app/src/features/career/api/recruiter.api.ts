import { MY_CAREER_PATH } from './career.api';

/**
 * Đường dẫn endpoint Recruiter board phía sinh viên (p6-08 be.md §4; `be/src/modules/recruiter/{me-career,offers}.routes.ts`) — nối sau
 * `appConfig.apiBaseUrl`. Mọi route sau `requireFeature(career)`; các route ngoài `PUT /me/career` + `GET …/job-settings` còn cần
 * `recruiter.enabled` ⇒ tắt thì 404 `CFG_005`. `PUT /me/career` dùng lại `MY_CAREER_PATH` (cùng đường dẫn với `GET` của p6-06).
 */
export const SAVE_JOB_SETTINGS_PATH = MY_CAREER_PATH;
export const JOB_SETTINGS_PATH = `${MY_CAREER_PATH}/job-settings`;

export const MY_OFFERS_PATH = '/me/offers';
export const offerPath = (offerId: string) => `${MY_OFFERS_PATH}/${encodeURIComponent(offerId)}`;
export const offerInterestedPath = (offerId: string) => `${offerPath(offerId)}/interested`;
export const offerDeclinePath = (offerId: string) => `${offerPath(offerId)}/decline`;
/** Thread dùng chung hai bên nên KHÔNG nằm dưới `/me`. */
export const offerMessagesPath = (offerId: string) =>
  `/offers/${encodeURIComponent(offerId)}/messages`;

export const COMPANY_BLOCKS_PATH = '/me/company-blocks';
export const companyBlockPath = (companyId: string) =>
  `${COMPANY_BLOCKS_PATH}/${encodeURIComponent(companyId)}`;

/**
 * "Ai đã xem hồ sơ của tôi" — `GET /me/profile-views` (cursor). ⚠️ Cùng cổng với `/me/company-blocks`: cờ `career` VÀ
 * `recruiter.enabled` (`recruiterGuard`) ⇒ tắt cái nào cũng 404 `CFG_005` (khác `PUT /me/career` chỉ cần cờ `career`).
 */
export const PROFILE_VIEWS_PATH = '/me/profile-views';

/** Báo cáo lời mời lạm dụng đi qua hộp báo cáo chung của p1-08 (`targetType: 'JOB_OFFER'`). */
export const REPORTS_PATH = '/reports';
