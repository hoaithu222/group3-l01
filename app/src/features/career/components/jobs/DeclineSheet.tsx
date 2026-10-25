import { useState } from 'react';
import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Radio, RadioGroup } from '@/shared/ui/radio';

import type { DeclineReason } from '../../api/recruiter.types';
import {
  DECLINE_REASON_HINT,
  DECLINE_REASON_LABEL,
  DECLINE_REASONS,
} from '../../constants/recruiter.constants';

export interface DeclineSheetProps {
  errorMessage?: string | null;
  submitting: boolean;
  visible: boolean;
  onClose: () => void;
  onConfirm: (reason: DeclineReason) => void;
}

/**
 * "Từ chối khéo" (app.md §2 `DeclineSheet`, §7): chọn một lý do để doanh nghiệp hiểu — KHÔNG bắt nhập chữ. BE chỉ nhận MÃ lý do
 * (`declineSchema`), doanh nghiệp không thấy câu nào khác, và tấm nói rõ điều đó. Mặc định "Lý do khác" (trung tính, không đoán thay người dùng).
 *
 * ✅ Câu giải thích là `description` của tấm (ghim dưới tiêu đề), lỗi máy chủ ở khe `alert` — thân tấm chỉ còn danh sách lý do.
 */
export function DeclineSheet({
  errorMessage,
  onClose,
  onConfirm,
  submitting,
  visible,
}: DeclineSheetProps) {
  const [reason, setReason] = useState<DeclineReason>('OTHER');

  return (
    <BottomSheet
      alert={errorMessage ? <Alert description={errorMessage} tone="error" /> : undefined}
      description="Chọn lý do để doanh nghiệp hiểu. Doanh nghiệp chỉ thấy lý do bạn chọn, không có lời nhắn nào khác."
      footer={
        <Button
          fullWidth
          label="Từ chối lời mời"
          loading={submitting}
          variant="danger"
          onPress={() => onConfirm(reason)}
        />
      }
      scrollable
      title="Từ chối lời mời"
      visible={visible}
      onClose={onClose}
    >
      <RadioGroup
        accessibilityLabel="Lý do từ chối"
        value={reason}
        onChange={(next) => setReason(next as DeclineReason)}
      >
        {DECLINE_REASONS.map((value) => (
          <View key={value} className="min-h-[44px] justify-center gap-3xs py-2xs">
            <Radio label={DECLINE_REASON_LABEL[value]} value={value} />
            {/* `pl-3xl` (32) = khung vòng chọn 24 + khe 8 của `Radio` ⇒ dòng gợi ý thẳng mép chữ của nhãn (`pl-xl` cũ lệch 8dp). */}
            <Text className="pl-3xl text-caption-lg text-fg-2">{DECLINE_REASON_HINT[value]}</Text>
          </View>
        ))}
      </RadioGroup>
    </BottomSheet>
  );
}
