import { useEffect } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

import { countdownSpeech, shouldAnnounce } from '../utils/countdown-tone';

/**
 * Đọc số giây còn lại ở các mốc (10 · 5 · 3 · hết giờ) cho trình đọc màn hình iOS. Android đọc qua `accessibilityLiveRegion`
 * trên chữ số (xem `CountdownBar`) — ⛔ chỉ chạy ở iOS, không thì Android nghe HAI lần mỗi mốc. `liveRegion` không có tác dụng
 * trên iOS nên đây là đường duy nhất ở đó (app.md p5-01 §7). Không đọc mỗi giây: chen ngang lúc người dùng đang nghe đề.
 */
export function useCountdownAnnouncer(seconds: number, totalSeconds: number): void {
  useEffect(() => {
    if (Platform.OS !== 'ios' || !shouldAnnounce(seconds, totalSeconds)) return;
    AccessibilityInfo.announceForAccessibility(countdownSpeech(seconds));
  }, [seconds, totalSeconds]);
}
