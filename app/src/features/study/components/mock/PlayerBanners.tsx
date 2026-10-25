import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';

export type MockEndedReason = 'expired' | 'submitted';

export interface PlayerBannersProps {
  /** Lượt đã hết giờ/đã nộp (từ đồng hồ hoặc `MOCK_003/004`): khoá nhập, chờ chuyển sang kết quả. */
  ended: MockEndedReason | null;
  offline: boolean;
  /** Số câu đã trả lời mà CHƯA lên server — nói rõ khi offline để người làm bài biết còn bao nhiêu đáp án chờ gửi. */
  pendingCount?: number;
  onRetry: () => void;
  /** Nộp/lấy kết quả thất bại (mất mạng…) — hiện nút thử lại tại chỗ. */
  submitFailed: boolean;
}

/** Ba thông báo nằm trong trang của màn thi (app.md p4-02 §3): offline, hết giờ/đã nộp, nộp lỗi. */
export function PlayerBanners({
  ended,
  offline,
  onRetry,
  pendingCount = 0,
  submitFailed,
}: PlayerBannersProps) {
  return (
    <View className="gap-xs">
      {offline ? (
        <Alert
          description={`Đang offline — đáp án sẽ gửi khi có mạng. Đồng hồ vẫn chạy.${pendingCount > 0 ? ` Đang chờ gửi: ${pendingCount} câu.` : ''}`}
          tone="warning"
        />
      ) : null}
      {ended ? (
        <Alert
          actions={
            submitFailed ? (
              <Button label="Thử lại" size="sm" variant="secondary" onPress={onRetry} />
            ) : undefined
          }
          description={
            submitFailed
              ? 'Chưa lấy được kết quả — kiểm tra kết nối rồi thử lại. Bài thi vẫn được nộp tự động.'
              : ended === 'expired'
                ? 'Đã hết giờ — đang lấy kết quả'
                : 'Bài thi đã được nộp — đang lấy kết quả'
          }
          tone={submitFailed ? 'error' : 'info'}
        />
      ) : null}
    </View>
  );
}
