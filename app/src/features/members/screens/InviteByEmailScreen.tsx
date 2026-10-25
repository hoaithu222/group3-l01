import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useConnectionState } from '@/core/socket';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen, useScreenFooterKeyboardOffset } from '@/shared/ui/screen';

import { INVITE_MESSAGE_MAX, type InviteMembersResult } from '../api';
import { EmailChipsInput } from '../components/EmailChipsInput';
import { InviteEmailResult } from '../components/InviteEmailResult';
import { useRetryCountdown } from '../hooks/useRetryCountdown';
import { useWorkspaceAccess } from '../queries/guests.queries';
import { useInviteMembers } from '../queries/invitations.queries';
import { hasInvalidEmail } from '../utils/email.utils';
import { readErrorInfo } from '../utils/error-info';
import { newIdempotencyKey } from '../utils/idempotency-key';

/** 429 mà BE không kèm `Retry-After` — chờ tạm chừng này trước khi cho bấm lại. */
const DEFAULT_RETRY_SECONDS = 30;

/**
 * Mời THÀNH VIÊN qua email (app.md p3-04 §3, route `members/invite-email`).
 * OWNER/ADMIN, hoặc MEMBER khi nhóm bật `memberCanInvite` — màn không tự suy quyền:
 * nút vào chỉ hiện theo `myPermissions.canInvite`, còn 403/404 của BE mới là hàng
 * rào thật (404 → về nhóm, đúng cột "Mất quyền").
 *
 * Lỗi 429 hiện NGAY TRONG form kèm đếm ngược, không toast (toast tự tắt sau 4 giây
 * trong lúc người dùng còn đang sửa danh sách email).
 */
export function InviteByEmailScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const isOffline = useConnectionState() === 'offline';
  const { data: access } = useWorkspaceAccess(wsId);
  const inviteMembers = useInviteMembers(wsId);
  const countdown = useRetryCountdown();

  const [emails, setEmails] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<InviteMembersResult | null>(null);
  const [formError, setFormError] = useState<string | undefined>();
  // Sinh MỖI LẦN MỞ form, đổi sau khi gửi được để đợt kế tiếp là một yêu cầu mới (app.md §4).
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey('invite-email'));

  const cannotInvite = access !== undefined && !access.canInviteByEmail;
  const blocked = countdown.remaining > 0;
  const canSubmit =
    emails.length > 0 && !hasInvalidEmail(emails) && !isOffline && !blocked && !cannotInvite;

  function submit(): void {
    setFormError(undefined);
    inviteMembers.mutate(
      { payload: { emails, message: message.trim() || undefined }, idempotencyKey },
      {
        onSuccess: (data) => {
          hapticSuccess(); // đợt mời đã gửi — kết quả từng email hiện ngay bên dưới (`InviteEmailResult`)
          setResult(data);
          setEmails([]);
          setMessage('');
          setIdempotencyKey(newIdempotencyKey('invite-email'));
        },
        onError: (error) => {
          const info = readErrorInfo(error);
          if (info.status === 404) {
            showToast('error', 'Bạn không còn quyền mời vào nhóm này.');
            router.back();
            return;
          }
          if (info.status === 429) countdown.start(info.retryAfterSeconds ?? DEFAULT_RETRY_SECONDS);
          setFormError(toErrorMessage(error));
        },
      },
    );
  }

  // Nút gửi dính ĐÁY (nhảy lên trên bàn phím): danh sách email + lời nhắn dài dần khi thêm người, nút cuối nội dung thì phải cuộn/đóng
  // bàn phím mới thấy. Nhãn vẫn nói rõ lý do bị khoá (đếm ngược 429) ngay trên nút.
  // Bù chiều cao thanh tab dưới — xem `useScreenFooterKeyboardOffset`.
  const footerKeyboardOffset = useScreenFooterKeyboardOffset();
  const footer = (
    <KeyboardStickyView offset={footerKeyboardOffset}>
      <BottomActionBar>
        <Button
          disabled={!canSubmit}
          fullWidth
          label={
            blocked
              ? `Thử lại sau ${countdown.remaining} giây`
              : emails.length > 0
                ? `Gửi lời mời (${emails.length})`
                : 'Gửi lời mời'
          }
          loading={inviteMembers.isPending}
          onPress={submit}
        />
      </BottomActionBar>
    </KeyboardStickyView>
  );

  return (
    <Screen footer={footer} header={<AppBar title="Mời qua email" onBack={router.back} />} keyboardAware>
      <View className="gap-md py-xs">
        {cannotInvite ? (
          <Alert
            description="Chỉ chủ nhóm và quản trị viên (hoặc thành viên, nếu nhóm cho phép) mới mời được qua email."
            title="Bạn chưa được mời người khác"
            tone="warning"
          />
        ) : null}

        {result ? <InviteEmailResult result={result} /> : null}

        <EmailChipsInput
          disabled={cannotInvite || inviteMembers.isPending}
          emails={emails}
          message={formError}
          onChange={(next) => {
            setResult(null);
            setEmails(next);
          }}
        />

        <Input
          disabled={cannotInvite}
          hint={`${message.length}/${INVITE_MESSAGE_MAX}`}
          label="Lời nhắn (tuỳ chọn)"
          labelInside
          maxLength={INVITE_MESSAGE_MAX}
          multiline
          placeholder="Vài dòng giới thiệu về nhóm"
          value={message}
          onChangeText={setMessage}
        />
      </View>
    </Screen>
  );
}
