import { Linking } from 'react-native';

import { showToast } from '@/shared/utils/toast.utils';

/**
 * Mở link họp ngoài (Zoom/Teams/Meet) từ màn `MEET_010`. Chỉ `https://` — BE đã kiểm, kiểm lại ở đây để không bao giờ `openURL` scheme lạ
 * (cùng luật với `openExternalMeeting` của p2-04; viết lại vì không import chéo feature).
 */
export async function openExternalMeetingLink(url: string): Promise<void> {
  if (!/^https:\/\//i.test(url)) {
    showToast('error', 'Liên kết họp không hợp lệ.');
    return;
  }
  try {
    await Linking.openURL(url);
  } catch {
    showToast('error', 'Không mở được liên kết họp.');
  }
}
