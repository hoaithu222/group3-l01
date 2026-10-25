import { router } from 'expo-router';

import { EmptyState } from '@/shared/ui/empty-state';
import { Screen } from '@/shared/ui/screen';

import { JOB_SETTINGS_HREF } from '../../utils/recruiter-routes';

/**
 * Khung PHẢI của bố cục hai cột khi chưa chọn lời mời nào (`offers/index` trên máy tính bảng). Không có dữ liệu giả — chỉ chỉ đường: chọn ở danh sách bên trái
 * hoặc mở Cài đặt Tìm việc (cách để có lời mời). Cùng khuôn `NoConversationSelected` của tab Tin nhắn.
 */
export function NoOfferSelected() {
  return (
    <Screen scrollable={false}>
      <EmptyState
        actions={[{ label: 'Cài đặt Tìm việc', onPress: () => router.push(JOB_SETTINGS_HREF) }]}
        description="Chọn một lời mời ở danh sách bên trái để xem và trả lời."
        fullscreen
        icon="email"
        title="Chưa chọn lời mời"
        tone="accent"
      />
    </Screen>
  );
}
