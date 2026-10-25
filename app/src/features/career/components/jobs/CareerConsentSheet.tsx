import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button, LinkButton } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Icon } from '@/shared/ui/icon';

import { CAREER_POLICY_URL } from '../../constants/recruiter.constants';

export interface CareerConsentSheetProps {
  /** Đã từng đồng ý một phiên bản CŨ ⇒ chính sách vừa đổi, hỏi lại (app.md §3 "bật lại khi `consentVersion` đổi → hỏi lại"). */
  policyUpdated: boolean;
  submitting: boolean;
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/** Bốn ý bắt buộc phải nói TRƯỚC khi bật (app.md §3): ai thấy, thấy gì, tắt là biến mất ngay, lời mời cũ vẫn giữ. */
const POINTS = [
  {
    key: 'who',
    text: 'Ai thấy: chỉ doanh nghiệp đã được duyệt mới tìm thấy và xem được hồ sơ Tìm việc của bạn.',
  },
  {
    key: 'what',
    text: 'Thấy gì: tên hiển thị, ảnh đại diện, tiêu đề, vị trí/khu vực mong muốn và huy hiệu kỹ năng bạn cho phép. Điểm đóng góp và portfolio chỉ hiện khi bạn bật. Không có email, số điện thoại, tên nhóm hay tên đồng đội.',
  },
  {
    key: 'off',
    text: 'Tắt là biến mất ngay: bạn tắt Tìm việc lúc nào cũng được, hồ sơ khỏi tìm kiếm tức thì.',
  },
  {
    key: 'keep',
    text: 'Lời mời cũ vẫn giữ: lời mời đã nhận vẫn đọc và trả lời được sau khi tắt. Bạn chặn được từng doanh nghiệp.',
  },
] as const;

/**
 * Đồng ý chia sẻ dữ liệu để bật Open to work (app.md §2 `CareerConsentSheet`): tóm tắt 4 ý + checkbox BẮT BUỘC + nút chỉ sáng khi đã tick — không tick thì
 * không gửi gì lên server (BE cũng từ chối bật thiếu/lệch `consentVersion`). Đóng tấm là bỏ tick: lần mở sau phải đồng ý lại, không thừa hưởng tick cũ.
 * ⚠️ Link văn bản đầy đủ chỉ hiện khi có `CAREER_POLICY_URL` (văn bản chờ chủ dự án duyệt — README p6-08 §9 #9).
 */
export function CareerConsentSheet({
  onClose,
  onConfirm,
  policyUpdated,
  submitting,
  visible,
}: CareerConsentSheetProps) {
  const [agreed, setAgreed] = useState(false);
  // Gán ra `const` để TS giữ nhánh "không null" bên trong closure `onPress` (hằng module kiểu `string | null` bị nới lại trong hàm lồng).
  const policyUrl = CAREER_POLICY_URL;

  const close = () => {
    setAgreed(false);
    onClose();
  };

  return (
    <BottomSheet
      // Thông báo về CẢ tấm ⇒ khe `alert` (ghim dưới tiêu đề, không cuộn mất) thay vì dòng đầu vùng cuộn.
      alert={
        policyUpdated ? (
          <Alert
            description="Chính sách dữ liệu đã được cập nhật. Vui lòng đọc và đồng ý lại để tiếp tục bật."
            tone="info"
          />
        ) : undefined
      }
      footer={
        <Button
          disabled={!agreed}
          fullWidth
          label="Đồng ý và bật"
          loading={submitting}
          onPress={onConfirm}
        />
      }
      scrollable
      title="Cho doanh nghiệp tìm thấy bạn"
      visible={visible}
      onClose={close}
    >
      {/* ⛔ Không `py-*`: vùng `footer` tự cách nội dung 12dp — đệm thêm là ô đồng ý (ngay trên nút) tụt xa nút nó mở khoá. */}
      <View className="gap-md">
        {POINTS.map((point) => (
          <View key={point.key} className="flex-row items-start gap-xs">
            <Icon color="success" name="checkmark-circle" size="sm" />
            <Text className="flex-1 text-body-md text-fg-1">{point.text}</Text>
          </View>
        ))}
        {policyUrl ? (
          <LinkButton
            label="Đọc văn bản đầy đủ"
            onPress={() => void WebBrowser.openBrowserAsync(policyUrl)}
          />
        ) : null}
        <Checkbox
          checked={agreed}
          label="Tôi đã đọc và đồng ý cho doanh nghiệp đã được duyệt xem hồ sơ Tìm việc của tôi"
          onChange={setAgreed}
        />
      </View>
    </BottomSheet>
  );
}
