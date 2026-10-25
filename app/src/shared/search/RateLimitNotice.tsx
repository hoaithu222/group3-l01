import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';

export interface RateLimitNoticeProps {
  /** Số giây BE báo (`details.retryAfterSeconds` của `RATE_002`). */
  seconds: number;
  /** Gọi ĐÚNG MỘT LẦN khi đếm ngược về 0, hoặc khi người dùng bấm "Thử lại" (nút chỉ bấm được lúc đã về 0). */
  onRetry: () => void;
}

/**
 * 429 (tìm quá 30 lần/phút): đếm ngược rồi tự thử lại (app.md p1-09 §3 "Lỗi: 429 đếm ngược retryAfterSeconds").
 *
 * Bộ đếm là state CỤC BỘ khởi tạo từ prop — nơi gọi đặt `key` theo lần lỗi (`errorUpdatedAt`) để mỗi lượt 429 mới
 * dựng lại bộ đếm với số giây mới, thay vì phải đồng bộ prop vào state trong effect. `remaining` bị kẹp ở 0 nên effect
 * `onRetry` chạy đúng một lần (giá trị không đổi ⇒ effect không chạy lại), không lặp mỗi giây trong lúc refetch.
 */
export function RateLimitNotice({ seconds, onRetry }: RateLimitNoticeProps) {
  const [remaining, setRemaining] = useState(seconds);
  const retryRef = useRef(onRetry);

  useEffect(() => {
    retryRef.current = onRetry;
  });

  useEffect(() => {
    const timer = setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (remaining === 0) retryRef.current();
  }, [remaining]);

  return (
    <View className="items-center gap-sm px-md py-xl">
      <Text className="text-center text-body-md text-fg-2">
        Bạn tìm quá nhanh. {remaining > 0 ? `Tự thử lại sau ${remaining} giây.` : 'Đang thử lại…'}
      </Text>
      <Button
        disabled={remaining > 0}
        label="Thử lại"
        size="sm"
        variant="secondary"
        onPress={onRetry}
      />
    </View>
  );
}
