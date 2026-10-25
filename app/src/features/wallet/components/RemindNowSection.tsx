import { useState } from 'react';
import { Text, View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/modal';
import { showToast } from '@/shared/utils/toast.utils';

import { formatCountdown, useCountdown } from '../hooks/useCountdown';
import { useIsOffline } from '../hooks/useIsOffline';
import { useRemindNow } from '../queries/settlement.mutations';
import { retryAfterSeconds, walletErrorCode } from '../utils/wallet-errors';
import { WALLET_ERROR } from '../constants/wallet.constants';

export interface RemindNowSectionProps {
  wsId: string;
}

/**
 * "Nhắc ngay" (OWNER/ADMIN): gửi thông báo nợ tới những người còn nợ NGAY, ngoài lịch. Tối đa 1 lần/giờ —
 * bị chặn (`WALLET_010`, 429) thì nút khoá kèm ĐẾM NGƯỢC còn bao lâu, thay vì để người dùng bấm mãi
 * rồi nhận cùng một câu lỗi. Thông báo tới từng người mang số tiền RIÊNG của họ; tin đăng vào nhóm
 * chat/kênh (nếu bật) thì KHÔNG có số tiền.
 *
 * ✅ Bấm "Nhắc ngay" MỞ HỘP THOẠI xác nhận rồi mới gửi: đây là hành động có tác dụng ra ngoài (người khác nhận thông báo)
 * và KHOÁ 1 GIỜ sau khi gửi — bấm nhầm trên màn cài đặt (ngay dưới nút "Lưu cài đặt") là mất cả giờ.
 */
export function RemindNowSection({ wsId }: RemindNowSectionProps) {
  const remind = useRemindNow(wsId);
  const countdown = useCountdown();
  const offline = useIsOffline();
  const [confirming, setConfirming] = useState(false);
  const blocked = countdown.remaining > 0;
  const tooOften = walletErrorCode(remind.error) === WALLET_ERROR.remindTooOften;

  const send = () =>
    remind.mutate(undefined, {
      onError: (error) => {
        // BE không cho biết thời gian chờ thì mặc định trọn 1 giờ (`remindNowPerHour` = 1).
        if (walletErrorCode(error) === WALLET_ERROR.remindTooOften)
          countdown.start(retryAfterSeconds(error) ?? 3600);
      },
      onSuccess: ({ remindedCount }) =>
        showToast(
          'success',
          remindedCount > 0 ? `Đã nhắc ${remindedCount} người.` : 'Hiện không có ai cần nhắc.',
        ),
    });

  return (
    <View className="gap-sm">
      <Text className="text-body-md text-fg-2">
        Gửi thông báo cho những bạn còn nợ ngay bây giờ, không chờ tới lịch nhắc.
      </Text>

      {remind.error && !tooOften ? (
        <Alert description={toErrorMessage(remind.error)} tone="error" />
      ) : null}
      {blocked ? (
        <Alert
          description={`Mỗi giờ chỉ nhắc được một lần. Thử lại sau ${formatCountdown(countdown.remaining)}.`}
          tone="warning"
        />
      ) : null}

      <Button
        disabled={offline || blocked}
        iconLeft="notification"
        label={blocked ? `Nhắc lại sau ${formatCountdown(countdown.remaining)}` : 'Nhắc ngay'}
        loading={remind.isPending}
        variant="secondary"
        onPress={() => setConfirming(true)}
      />

      <Dialog
        description="Thông báo sẽ được gửi ngay tới những người còn nợ. Mỗi giờ chỉ nhắc được một lần, nên nếu gửi nhầm bạn phải chờ 1 giờ để nhắc lại."
        primaryAction={{
          label: 'Gửi nhắc ngay',
          onPress: () => {
            setConfirming(false);
            send();
          },
        }}
        secondaryAction={{ label: 'Chưa gửi', onPress: () => setConfirming(false) }}
        title="Nhắc nợ ngay bây giờ?"
        visible={confirming}
        onClose={() => setConfirming(false)}
      />
    </View>
  );
}
