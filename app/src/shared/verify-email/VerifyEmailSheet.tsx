import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button, LinkButton } from '@/shared/ui/button';
import { PinInput } from '@/shared/ui/pin';

import { useVerifyEmailFlow, VERIFY_CODE_LENGTH } from './useVerifyEmailFlow';

/** Câu mặc định ở bước "Gửi mã" khi nơi gọi không truyền `intro` — chỉ nói điều đúng ở MỌI nơi dùng. */
export const VERIFY_EMAIL_DEFAULT_INTRO = 'Mã có hiệu lực 15 phút.';

export interface VerifyEmailSheetProps {
  /** Email (đã che nếu là email của lời mời) — nói rõ mã gửi tới đâu. Bỏ trống ⇒ "email của tài khoản". */
  emailHint?: string;
  /** Câu giải thích ở bước gửi mã (vì sao phải xác minh). Mặc định `VERIFY_EMAIL_DEFAULT_INTRO`. */
  intro?: string;
  visible: boolean;
  onClose: () => void;
  /** Xác minh xong (hoặc BE báo đã xác minh sẵn) — màn cha đi tiếp (chấp nhận lời mời / cập nhật cờ `emailVerified`). */
  onVerified: () => void;
}

/**
 * "Xác minh email" (p3-04 app.md §3, `INV_008` `EMAIL_NOT_VERIFIED`; và Cài đặt → Bảo mật): gửi mã 6 số → nhập mã → xong gọi `onVerified`.
 * Lỗi hiện NGAY TRONG tấm (dưới ô mã / trong khối cảnh báo), không toast — toast tự tắt sau 4 giây trong lúc người dùng còn đang gõ lại mã.
 * Ô mã dùng `PinInput` chung (dán mã từ thư/tin nhắn vào được). "Tôi đã có mã" cho người đã nhận mã từ lần gửi trước (BE chỉ cho gửi 3 lần/15 phút).
 *
 * ⚠️ Trạng thái luồng (bước, mã, đếm ngược) sống TRONG component này và sống theo nơi gọi (không theo `visible`): đóng bằng nút/vuốt
 * (`onClose`) thì luồng được `reset` nên mở lại là lượt mới; còn đóng do `onVerified` thì nơi gọi tự gỡ/không mở lại tấm đó nữa.
 */
export function VerifyEmailSheet({
  emailHint,
  intro = VERIFY_EMAIL_DEFAULT_INTRO,
  onClose,
  onVerified,
  visible,
}: VerifyEmailSheetProps) {
  const flow = useVerifyEmailFlow(onVerified);
  const target = emailHint ?? 'email của tài khoản';

  function close(): void {
    flow.reset();
    onClose();
  }

  return (
    <BottomSheet
      alert={
        flow.step === 'send' && flow.error ? (
          <Alert description={flow.error} tone="error" />
        ) : undefined
      }
      description={
        flow.step === 'send' ? `Gửi mã 6 số tới ${target}.` : `Nhập mã 6 số đã gửi tới ${target}.`
      }
      footer={
        flow.step === 'send' ? (
          <Button fullWidth label="Gửi mã" loading={flow.sending} onPress={flow.sendCode} />
        ) : (
          <Button
            disabled={flow.code.length !== VERIFY_CODE_LENGTH}
            fullWidth
            label="Xác minh"
            loading={flow.confirming}
            onPress={() => flow.submit(flow.code)}
          />
        )
      }
      title="Xác minh email"
      visible={visible}
      onClose={close}
    >
      {flow.step === 'send' ? (
        <View className="items-start gap-sm">
          <Text className="text-body-md text-fg-2">{intro}</Text>
          <LinkButton label="Tôi đã có mã" onPress={flow.haveCode} />
        </View>
      ) : (
        <View className="items-center gap-sm">
          <PinInput
            autoFocus
            disabled={flow.confirming}
            error={flow.error}
            length={VERIFY_CODE_LENGTH}
            value={flow.code}
            onChange={flow.setCode}
            onComplete={flow.submit}
          />
          <LinkButton
            disabled={flow.cooldown > 0 || flow.sending}
            label={flow.cooldown > 0 ? `Gửi lại mã (${flow.cooldown}s)` : 'Gửi lại mã'}
            loading={flow.sending}
            onPress={flow.sendCode}
          />
        </View>
      )}
    </BottomSheet>
  );
}
