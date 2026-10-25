import { Section } from '@/shared/ui/section';
import { useAuthStore } from '@/shell/store/slices/auth';

import { useUpdatePrivacy } from '../hooks/usePrivacySettings';
import { MeNavGroup } from './MeNavGroup';
import { MeNavRow } from './MeNavRow';
import { MeToggleRow } from './MeToggleRow';

/**
 * Card "Quyền riêng tư" trong `MeSettingsScreen` (p0-01 mục 10, phần còn lại).
 *
 * Hai công tắc ĐỔI-TỨC-THÌ — chạm là gọi `PATCH /me/privacy` ngay, KHÔNG có
 * nút "Lưu" riêng (mẫu cài đặt phổ biến, giống `BiometricSettingRow`).
 * `undefined`/`null` ở `user.privacy` (BE chưa từng ghi field này cho tài
 * khoản cũ) coi như CẢ HAI `true`, đúng hợp đồng "null = mặc định".
 *
 * `onOpenBlocked` (tuỳ chọn): thêm hàng "Người đã chặn" dưới hai công tắc — chặn người là chuyện ai thấy/nhắn được mình,
 * cùng nhóm với hai công tắc này chứ không phải "Bảo mật" (mật khẩu, phiên đăng nhập). Điều hướng do nơi gọi truyền vào để
 * thẻ không phụ thuộc expo-router (test dựng thẻ này không cần mock định tuyến).
 */
export function PrivacySettingsCard({ onOpenBlocked }: { onOpenBlocked?: () => void }) {
  const privacy = useAuthStore((state) => state.user?.privacy);
  const { isPending, updatePrivacy } = useUpdatePrivacy();

  const readReceipts = privacy?.readReceipts ?? true;
  const showPresence = privacy?.showPresence ?? true;

  return (
    <Section icon="hide" title="Quyền riêng tư">
      {/* Cùng khuôn `MeNavGroup`/`MeToggleRow` với các thẻ khác của Cài đặt: ô icon có tông, chữ thẳng cột, kẻ chia cắt ở hàng cuối. */}
      <MeNavGroup>
        <MeToggleRow
          description="Cho người khác biết bạn đã xem tin nhắn của họ"
          disabled={isPending}
          icon="tick-double-01"
          label="Đã xem tin nhắn"
          tone="info"
          value={readReceipts}
          onChange={(value) => updatePrivacy({ readReceipts: value })}
        />
        <MeToggleRow
          description="Cho người khác thấy khi bạn đang hoạt động trên ứng dụng"
          disabled={isPending}
          icon="user-circle"
          label="Trạng thái hoạt động"
          tone="success"
          value={showPresence}
          onChange={(value) => updatePrivacy({ showPresence: value })}
        />
        {onOpenBlocked ? (
          <MeNavRow
            description="Xem và bỏ chặn những người bạn đã chặn"
            icon="cancel-2"
            label="Người đã chặn"
            tone="accent"
            onPress={onOpenBlocked}
          />
        ) : null}
      </MeNavGroup>
    </Section>
  );
}
