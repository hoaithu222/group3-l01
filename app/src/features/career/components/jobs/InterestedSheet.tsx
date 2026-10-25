import { useState } from 'react';

import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Toggle } from '@/shared/ui/toggle';
import { useAuthStore } from '@/shell/store/slices/auth';

export interface InterestedSheetProps {
  /** Lỗi từ server (`RECR_009` đã đổi trạng thái, `RECR_002` công ty tạm ngưng) — hiện TRONG tấm, giữ nguyên lựa chọn của người dùng. */
  errorMessage?: string | null;
  submitting: boolean;
  visible: boolean;
  onClose: () => void;
  onConfirm: (shareEmail: boolean) => void;
}

/**
 * Xác nhận Quan tâm (app.md §2 `InterestedSheet`): mở kênh trao đổi với doanh nghiệp. "Chia sẻ email" MẶC ĐỊNH TẮT (app.md §7) và mô tả rõ email nào sẽ
 * được thấy — bật là chụp email gửi doanh nghiệp NGAY lúc bấm, đổi sau đó không thu hồi được nên phải là lựa chọn chủ động. Đóng tấm là đặt lại về tắt:
 * mở lại tấm cho lời mời khác không được thừa hưởng cái đã bật trước đó.
 */
export function InterestedSheet({
  errorMessage,
  onClose,
  onConfirm,
  submitting,
  visible,
}: InterestedSheetProps) {
  const email = useAuthStore((state) => state.user?.email);
  const [shareEmail, setShareEmail] = useState(false);

  const close = () => {
    setShareEmail(false);
    onClose();
  };

  return (
    <BottomSheet
      // ✅ Câu giải thích ở `description` (ghim dưới tiêu đề), lỗi máy chủ ở khe `alert` — thân tấm chỉ còn đúng MỘT lựa chọn.
      alert={errorMessage ? <Alert description={errorMessage} tone="error" /> : undefined}
      description="Doanh nghiệp sẽ biết bạn quan tâm và có thể nhắn tin trao đổi với bạn ngay trong lời mời này. Bạn vẫn có thể ngừng trao đổi bằng cách chặn doanh nghiệp."
      footer={
        <Button
          fullWidth
          label="Bày tỏ quan tâm"
          loading={submitting}
          onPress={() => onConfirm(shareEmail)}
        />
      }
      scrollable
      title="Bày tỏ quan tâm"
      visible={visible}
      onClose={close}
    >
      <Toggle
        description={
          email
            ? `Doanh nghiệp này sẽ thấy email ${email}. Không thể thu hồi sau khi gửi.`
            : 'Doanh nghiệp này sẽ thấy email tài khoản của bạn. Không thể thu hồi sau khi gửi.'
        }
        label="Chia sẻ email của tôi với doanh nghiệp này"
        value={shareEmail}
        onChange={setShareEmail}
      />
    </BottomSheet>
  );
}
