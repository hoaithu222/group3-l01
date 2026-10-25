import { useState } from 'react';
import { View } from 'react-native';

import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

import { WALLET_LIMITS } from '../constants/wallet.constants';

export interface RejectSettlementSheetProps {
  busy?: boolean;
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}

/**
 * Lý do từ chối (3–200 ký tự, `rejectSettlementSchema` của BE). Người gửi sẽ đọc
 * lý do này nên bắt buộc — từ chối im lặng là nguồn của tranh chấp "đã chuyển mà
 * không xác nhận" (README §10).
 */
export function RejectSettlementSheet({
  busy = false,
  onClose,
  onSubmit,
  visible,
}: RejectSettlementSheetProps) {
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();
  const tooShort = trimmed.length < WALLET_LIMITS.rejectReasonMin;
  const counter = `${trimmed.length}/${WALLET_LIMITS.settlementNoteMax}`;

  return (
    <BottomSheet
      description="Người chuyển sẽ đọc lý do này."
      // ⚠️ Chạm nền mờ lúc yêu cầu từ chối đang bay là đóng tấm mà việc vẫn xảy ra — cùng luật `ConfirmSheet`.
      dismissOnBackdrop={!busy}
      footer={
        <Button
          disabled={tooShort}
          fullWidth
          label="Từ chối"
          loading={busy}
          variant="danger"
          onPress={() => onSubmit(trimmed)}
        />
      }
      title="Từ chối khoản thanh toán"
      visible={visible}
      onClose={onClose}
    >
      <View className="py-xs">
        <Input
          // ✅ Nói rõ mức tối thiểu khi nút "Từ chối" còn khoá — ❌ bản trước chỉ có bộ đếm, nút xám mà không ai biết vì sao.
          hint={
            tooShort ? `Tối thiểu ${WALLET_LIMITS.rejectReasonMin} ký tự · ${counter}` : counter
          }
          label="Lý do"
          maxLength={WALLET_LIMITS.settlementNoteMax}
          multiline
          placeholder="Ví dụ: chưa thấy tiền về tài khoản"
          required
          onChangeText={setReason}
        />
      </View>
    </BottomSheet>
  );
}
