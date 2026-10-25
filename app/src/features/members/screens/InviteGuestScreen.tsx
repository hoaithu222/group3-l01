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

import { GUEST_DAYS_DEFAULT, GUEST_DAYS_MAX, INVITE_MESSAGE_MAX } from '../api';
import { DesignatedChannelPicker } from '../components/DesignatedChannelPicker';
import { GuestDaysSelector } from '../components/GuestDaysSelector';
import { useGuestChannelOptions, useWorkspaceAccess } from '../queries/guests.queries';
import { useInviteGuest } from '../queries/invitations.queries';
import { isValidEmail } from '../utils/email.utils';
import { classifyGuestInviteError, type GuestInviteFailure } from '../utils/invitation-errors';
import { newIdempotencyKey } from '../utils/idempotency-key';

/**
 * Mời KHÁCH (app.md p3-04 §3, route `members/invite-guest`): email + kênh (≥ 1) +
 * số ngày + lời nhắn. Khách CHỈ tạo qua lời mời đích danh — không có link chung
 * cho khách (README §2), nên màn này là cửa duy nhất.
 *
 * Ẩn/khoá theo `myRole` + `guestPolicy` của BE (không tự suy): không phải
 * OWNER/ADMIN → thông báo; nhóm chưa bật mời khách → banner + "Mở cài đặt" (OWNER).
 * Sau khi gửi, lỗi BE hiện đúng chỗ: `GUEST_DISABLED` banner, `CHANNEL_NOT_MANAGED`
 * dưới danh sách kênh, `ALREADY_MEMBER` dưới ô email.
 */
export function InviteGuestScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const isOffline = useConnectionState() === 'offline';
  const { data: access } = useWorkspaceAccess(wsId);
  const channels = useGuestChannelOptions(wsId);
  const inviteGuest = useInviteGuest(wsId);

  const [email, setEmail] = useState('');
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [days, setDays] = useState(GUEST_DAYS_DEFAULT);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState<GuestInviteFailure | null>(null);
  const [emailTouched, setEmailTouched] = useState(false);
  const [idempotencyKey] = useState(() => newIdempotencyKey('invite-guest'));

  const maxDays = access?.maxGuestDays ?? GUEST_DAYS_MAX;
  const trimmedEmail = email.trim();
  const emailError = emailTouched && trimmedEmail && !isValidEmail(trimmedEmail) ? 'Email không đúng định dạng.' : undefined;
  const disabledByPolicy = access !== undefined && (!access.canManageMembers || !access.guestEnabled);
  const canSubmit = isValidEmail(trimmedEmail) && channelIds.length > 0 && !isOffline && !disabledByPolicy;

  function submit(): void {
    setFailure(null);
    inviteGuest.mutate(
      {
        idempotencyKey,
        payload: { email: trimmedEmail, channelIds, days: Math.min(days, maxDays), message: message.trim() || undefined },
      },
      {
        onSuccess: () => {
          hapticSuccess();
          showToast('success', `Đã gửi lời mời khách tới ${trimmedEmail}.`);
          router.back();
        },
        onError: (error) => {
          const kind = classifyGuestInviteError(error);
          if (kind === 'NO_PERMISSION') {
            showToast('error', 'Bạn không còn quyền mời khách vào nhóm này.');
            router.back();
            return;
          }
          if (kind === 'OTHER') showToast('error', toErrorMessage(error));
          setFailure(kind);
        },
      },
    );
  }

  const showSettingsBanner = failure === 'GUEST_DISABLED' || (access !== undefined && !access.guestEnabled);

  // Form dài (email + kênh + số ngày + lời nhắn) ⇒ nút gửi dính ĐÁY, nhảy lên trên bàn phím — không phải cuộn xuống cuối mới thấy.
  // Bù chiều cao thanh tab dưới — xem `useScreenFooterKeyboardOffset`.
  const footerKeyboardOffset = useScreenFooterKeyboardOffset();
  const footer = (
    <KeyboardStickyView offset={footerKeyboardOffset}>
      <BottomActionBar>
        <Button disabled={!canSubmit} fullWidth label="Gửi lời mời khách" loading={inviteGuest.isPending} onPress={submit} />
      </BottomActionBar>
    </KeyboardStickyView>
  );

  return (
    <Screen footer={footer} header={<AppBar title="Mời khách" onBack={router.back} />} keyboardAware>
      <View className="gap-md py-xs">
        {access !== undefined && !access.canManageMembers ? (
          <Alert description="Chỉ chủ nhóm và quản trị viên mới mời được khách." title="Bạn chưa mời được khách" tone="warning" />
        ) : showSettingsBanner ? (
          <Alert
            actions={
              access?.isOwner ? (
                <Button
                  label="Mở cài đặt"
                  size="sm"
                  variant="secondary"
                  onPress={() => router.push({ pathname: '/workspaces/[wsId]/settings/access', params: { wsId } })}
                />
              ) : undefined
            }
            description="Nhóm chưa bật mời khách hoặc đã đủ số khách tối đa."
            title="Nhóm chưa bật mời khách"
            tone="warning"
          />
        ) : null}

        <Alert
          description="Khách chỉ thấy các kênh đã chọn và những người trong đó. Không thấy danh bạ thành viên, bảng việc hay tài liệu."
          tone="info"
        />

        <Input
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          disabled={disabledByPolicy}
          keyboardType="email-address"
          label="Email của khách"
          message={failure === 'ALREADY_MEMBER' ? 'Người này đã là thành viên của nhóm.' : emailError}
          placeholder="khach@congty.com"
          required
          textContentType="emailAddress"
          value={email}
          onBlur={() => setEmailTouched(true)}
          onChangeText={(text) => {
            setFailure(null);
            setEmail(text);
          }}
        />

        <DesignatedChannelPicker
          disabled={disabledByPolicy}
          error={failure === 'CHANNEL_NOT_MANAGED' ? 'Bạn chỉ chỉ định được kênh riêng tư mà mình quản lý — hãy bỏ chọn kênh đó.' : undefined}
          isLoading={channels.isLoading}
          options={channels.data ?? []}
          selectedIds={channelIds}
          onChange={(next) => {
            setFailure(null);
            setChannelIds(next);
          }}
        />

        <GuestDaysSelector disabled={disabledByPolicy} maxDays={maxDays} value={Math.min(days, maxDays)} onChange={setDays} />

        <Input
          disabled={disabledByPolicy}
          hint={`${message.length}/${INVITE_MESSAGE_MAX}`}
          label="Lời nhắn (tuỳ chọn)"
          labelInside
          maxLength={INVITE_MESSAGE_MAX}
          multiline
          placeholder="Vài dòng chào gửi kèm lời mời"
          value={message}
          onChangeText={setMessage}
        />
      </View>
    </Screen>
  );
}
