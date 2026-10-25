import dayjs from 'dayjs';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';
import { Button, LinkButton } from '@/shared/ui/button';
import { DatePicker } from '@/shared/ui/date-picker';

import { GUEST_DAYS_MAX, INVITATION_ERROR, type MemberCard } from '../api';
import { useGuestChannelOptions, useUpdateGuest } from '../queries/guests.queries';
import { useRemoveMember } from '../queries/members.queries';
import { readErrorInfo } from '../utils/error-info';
import { DesignatedChannelPicker } from './DesignatedChannelPicker';
import { RevokeGuestSheet } from './RevokeGuestSheet';

export interface GuestManageFormProps {
  card: MemberCard;
  /** Offline: chỉ đọc (app.md p3-04 §3 cột Offline). */
  disabled?: boolean;
  /** `guestPolicy.maxDays` của nhóm; mặc định trần hệ thống 90. */
  maxDays?: number;
  wsId: string;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item) => b.includes(item));
}

/**
 * Hạn + kênh chỉ định + thu hồi ngay của MỘT khách (app.md p3-04 §3, `ManageGuest`).
 * Mount qua `key` của màn cha nên state khởi tạo THẲNG từ `card` (không
 * `useEffect`+`setState`).
 *
 * Chọn hạn theo NGÀY: gửi CUỐI ngày đó (23:59:59) rồi trần `maxDate = hôm nay +
 * (maxDays − 1)` để chắc chắn ≤ `now + maxDays` mà BE kiểm — chọn đúng ngày thứ 90
 * lúc 23:59 sẽ vượt trần vài giờ và bị 400. Muốn hết hạn NGAY thì dùng "Thu hồi",
 * không phải đặt hạn quá khứ (be.md §3: "< now → thu hồi ngay, dùng remove").
 */
export function GuestManageForm({ card, disabled = false, maxDays = GUEST_DAYS_MAX, wsId }: GuestManageFormProps) {
  const originalExpiry = card.expiresAt ? dayjs(card.expiresAt) : null;
  const originalChannels = card.guestChannelIds ?? [];

  const [expiry, setExpiry] = useState<Date | null>(originalExpiry?.toDate() ?? null);
  const [channelIds, setChannelIds] = useState<string[]>(originalChannels);
  const [channelError, setChannelError] = useState<string | undefined>();
  const [revokeOpen, setRevokeOpen] = useState(false);

  const channels = useGuestChannelOptions(wsId);
  const updateGuest = useUpdateGuest(wsId);
  const removeMember = useRemoveMember(wsId);

  const name = card.displayName ?? card.name;
  const expiryChanged = expiry !== null && (!originalExpiry || !dayjs(expiry).isSame(originalExpiry, 'day'));
  const channelsChanged = !sameSet(channelIds, originalChannels);
  const canSave = (expiryChanged || channelsChanged) && channelIds.length > 0 && !updateGuest.isPending && !disabled;

  function save(): void {
    setChannelError(undefined);
    updateGuest.mutate(
      {
        userId: card.userId,
        payload: {
          // `version` chưa được BE xác nhận cho thẻ khách (be.md không khai) — thiếu thì gửi 1: sai thì
          // BE 409 và màn tải lại thẻ, an toàn hơn là tự bịa một phiên bản "đúng".
          expectedVersion: card.version ?? 1,
          ...(expiryChanged && expiry ? { expiresAt: dayjs(expiry).endOf('day').toISOString() } : {}),
          ...(channelsChanged ? { channelIds } : {}),
        },
      },
      {
        onSuccess: () => {
          hapticSuccess();
          showToast('success', 'Đã cập nhật quyền khách.');
        },
        onError: (error) => {
          const { code, status } = readErrorInfo(error);
          if (code === INVITATION_ERROR.CHANNEL_NOT_MANAGED) {
            setChannelError('Bạn chỉ chỉ định được kênh riêng tư mà mình quản lý — hãy bỏ chọn kênh đó.');
          } else if (status === 409) {
            showToast('info', 'Thông tin khách vừa thay đổi — đã tải lại, hãy kiểm tra rồi lưu lại.');
          } else {
            showToast('error', toErrorMessage(error));
          }
        },
      },
    );
  }

  function revoke(reason: string): void {
    removeMember.mutate(
      { userId: card.userId, payload: { reason } },
      {
        onSuccess: () => {
          setRevokeOpen(false);
          showToast('success', `Đã thu hồi quyền khách của ${name}.`);
          router.back();
        },
        onError: (error) => showToast('error', toErrorMessage(error)),
      },
    );
  }

  return (
    <View className="gap-md">
      <DatePicker
        disabled={disabled}
        label="Hạn của khách"
        maxDate={dayjs().add(maxDays - 1, 'day').endOf('day').toDate()}
        minDate={dayjs().add(1, 'day').startOf('day').toDate()}
        title="Chọn ngày hết hạn"
        value={expiry}
        onChange={setExpiry}
      />

      <DesignatedChannelPicker
        disabled={disabled}
        error={channelError}
        isLoading={channels.isLoading}
        options={channels.data ?? []}
        selectedIds={channelIds}
        onChange={(next) => {
          setChannelError(undefined);
          setChannelIds(next);
        }}
      />

      <Button disabled={!canSave} fullWidth label="Lưu thay đổi" loading={updateGuest.isPending} onPress={save} />
      {/* Việc phá huỷ đứng SAU việc chính và ở dạng liên kết đỏ, không phải nút viền đầy bề ngang ngang hàng nút "Lưu" (hai nút to cạnh
          nhau khiến "Thu hồi" nổi ngang "Lưu" và dễ bấm nhầm). Vẫn có hộp xác nhận nêu hậu quả. */}
      <View className="items-center">
        <LinkButton
          disabled={disabled}
          iconLeft="unlink"
          label="Thu hồi quyền khách ngay"
          size="md"
          tone="danger"
          onPress={() => setRevokeOpen(true)}
        />
      </View>

      <RevokeGuestSheet
        loading={removeMember.isPending}
        name={name}
        visible={revokeOpen}
        onClose={() => setRevokeOpen(false)}
        onConfirm={revoke}
      />
    </View>
  );
}
