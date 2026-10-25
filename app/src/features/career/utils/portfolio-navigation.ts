import { router } from 'expo-router';

import { showToast } from '@/shared/utils/toast.utils';

import { PORTFOLIO_HREF } from './portfolio-routes';

/**
 * Dự án đã KHÔNG còn (xoá ở thiết bị khác, BE trả 404) ⇒ toast "Dự án không còn" rồi rời màn (app.md p6-07 §3 "Sửa dự án": "404 → quay lại + toast"). Có màn phía trước thì lùi; mở thẳng bằng liên kết
 * (không có gì để lùi về) thì đưa về Tổng quan portfolio — `router.back()` khi không có lịch sử là im lặng không làm gì, người dùng kẹt trên màn đã hỏng.
 */
export function leaveGoneProject(): void {
  showToast('error', 'Dự án không còn');
  if (router.canGoBack()) router.back();
  else router.replace(PORTFOLIO_HREF);
}
