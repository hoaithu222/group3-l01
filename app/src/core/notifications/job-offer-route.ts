import type { Href } from 'expo-router';

import type { NotificationTarget } from './notification-target.types';

/**
 * Recruiter board (p6-08): thông báo `job-offer.*` của BE (`be/src/modules/recruiter/notifications/recruiter.notification-types.ts`) → đích. Tách khỏi
 * `notification-route.ts` để file đó giữ trong trần độ dài (cùng vai `mentor-route.ts`). Push/hộp thư chỉ mang id (`offerId`) — KHÔNG tiêu đề/nội dung
 * lời mời (CR-47); màn đích tự tải lại và nói "Lời mời không còn" khi BE trả 404. ⛔ Không kiểm quyền ở đây.
 *
 *  · `job-offer.received` (sinh viên có lời mời mới) → CHI TIẾT lời mời (`offers/[offerId]`).
 *  · `job-offer.message` (tin mới trong lời mời) → THREAD trao đổi (`offers/[offerId]/thread`).
 *  · thiếu `offerId` → hộp thư lời mời.
 *  · `job-offer.responded` là thông báo cho HR (làm việc trên admin web) — app không có màn đích ⇒ `null` (push rơi về hộp thư Hoạt động).
 *
 * ⚠️ Chuỗi đường dẫn khai lại (không import `features/career`: `core` không import feature). Đổi thì sửa CẢ `features/career/utils/recruiter-routes.ts`.
 * Ép `as Href` vì route mới chưa chắc có trong `.expo/types/router.d.ts`. ⛔ Mỗi nhánh là `if`/`return` tường minh, không `cond ? a : b` trên `Href` (TS2590).
 */
export function isJobOfferType(type: string): boolean {
  return type.startsWith('job-offer.');
}

const OFFERS = '/me/career/offers' as Href;

function detailHref(offerId: string): Href {
  return `/me/career/offers/${encodeURIComponent(offerId)}` as Href;
}

function threadHref(offerId: string): Href {
  return `/me/career/offers/${encodeURIComponent(offerId)}/thread` as Href;
}

export function jobOfferHref({ offerId, type }: NotificationTarget): Href | null {
  if (type === 'job-offer.received') {
    if (!offerId) return OFFERS;
    return detailHref(offerId);
  }
  if (type === 'job-offer.message') {
    if (!offerId) return OFFERS;
    return threadHref(offerId);
  }
  return null;
}
