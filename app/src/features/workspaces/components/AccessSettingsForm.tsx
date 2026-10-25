import { useState } from 'react';
import { Text, View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useConnectionState } from '@/core/socket';
import { hapticSelection, hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Chip } from '@/shared/ui/chip';
import { Section } from '@/shared/ui/section';
import { Stepper } from '@/shared/ui/stepper';
import { Toggle } from '@/shared/ui/toggle';

import type { GuestPolicy, JoinPolicy, WorkspaceDetail } from '../api';
import { useUpdateWorkspaceSettings } from '../queries/access.queries';
import type { GuestLimits } from '../utils/guest-limits';

/** Nhóm chưa từng cấu hình khách: bật lên thì bắt đầu từ mức vừa phải, không phải trần. */
const DEFAULT_GUEST_POLICY: GuestPolicy = { enabled: false, maxGuests: 5, maxDays: 30, memberCanInvite: false };
const DAY_CHOICES = [7, 14, 30, 60, 90];

function samePolicy(a: GuestPolicy, b: GuestPolicy): boolean {
  return (
    a.enabled === b.enabled &&
    a.maxGuests === b.maxGuests &&
    a.maxDays === b.maxDays &&
    a.memberCanInvite === b.memberCanInvite
  );
}

export interface AccessSettingsFormProps {
  limits: GuestLimits;
  workspace: WorkspaceDetail;
}

/**
 * Thiết lập vào nhóm/khách của CHỦ NHÓM (app.md p3-04 §3, `WorkspaceAccessSettings`).
 * State khởi tạo THẲNG từ `workspace` (màn cha mount qua `key` = id+version, nên lượt
 * tải lại sau 409 dựng lại form với giá trị mới nhất, không cần `useEffect`).
 *
 * `guestPolicy` gửi NGUYÊN khối (BE thay cả khối, không trộn từng trường) và chỉ khi
 * có thay đổi; kẹp `maxGuests`/`maxDays` trong trần hệ thống trước khi gửi.
 */
export function AccessSettingsForm({ limits, workspace }: AccessSettingsFormProps) {
  const isOffline = useConnectionState() === 'offline';
  const updateSettings = useUpdateWorkspaceSettings(workspace.id);

  const originalJoin: JoinPolicy = workspace.joinPolicy ?? 'OPEN';
  const originalGuest = workspace.guestPolicy ?? DEFAULT_GUEST_POLICY;
  const [joinPolicy, setJoinPolicy] = useState<JoinPolicy>(originalJoin);
  const [guest, setGuest] = useState<GuestPolicy>(originalGuest);

  const joinChanged = joinPolicy !== originalJoin;
  const guestChanged = !samePolicy(guest, originalGuest);
  const dayChoices = [...new Set([...DAY_CHOICES.filter((days) => days <= limits.maxDays), guest.maxDays])].sort((a, b) => a - b);

  function save(): void {
    updateSettings.mutate(
      {
        expectedVersion: workspace.version,
        ...(joinChanged && { joinPolicy }),
        ...(guestChanged && {
          guestPolicy: {
            ...guest,
            maxGuests: Math.min(guest.maxGuests, limits.maxPerWorkspace),
            maxDays: Math.min(guest.maxDays, limits.maxDays),
          },
        }),
      },
      {
        onSuccess: () => {
          hapticSuccess();
          showToast('success', 'Đã lưu thiết lập truy cập.');
        },
        onError: (error) => showToast('error', toErrorMessage(error)),
      },
    );
  }

  return (
    // `gap-xl` (24) giữa hai khối — cùng nhịp mọi màn (`screen-layout.md`); trước đây 20 lệch với Cài đặt nhóm ngay trước nó.
    <View className="gap-xl py-xs">
      {/* Hai thiết lập cùng trả lời "ai đưa người khác vào nhóm được và có cần duyệt không" ⇒ một khung, không phải hai
          khung mỗi khung một công tắc (trước đây "Mời qua email" là một Section riêng chỉ chứa đúng một công tắc). */}
      <Section title="Vào nhóm">
        <Card>
          <View className="gap-md">
            <Toggle
              description="Người vào bằng link mời sẽ chờ quản trị viên duyệt. Lời mời gửi thẳng qua email không cần duyệt."
              disabled={isOffline}
              label="Duyệt thành viên mới"
              value={joinPolicy === 'APPROVAL'}
              onChange={(value) => setJoinPolicy(value ? 'APPROVAL' : 'OPEN')}
            />
            <Toggle
              description="Thành viên thường (không phải quản trị viên) cũng gửi được lời mời qua email."
              disabled={isOffline}
              label="Thành viên được mời qua email"
              value={guest.memberCanInvite}
              onChange={(memberCanInvite) => setGuest({ ...guest, memberCanInvite })}
            />
          </View>
        </Card>
      </Section>

      <Section title="Khách">
        <Card>
          <View className="gap-md">
            <Toggle
              description="Khách chỉ thấy các kênh được chỉ định, có thời hạn và tự mất quyền khi hết hạn."
              disabled={isOffline}
              label="Cho phép mời khách"
              value={guest.enabled}
              onChange={(enabled) => setGuest({ ...guest, enabled })}
            />
            {guest.enabled ? (
              <>
                <View className="flex-row items-center justify-between gap-sm">
                  <Text className="text-label-md text-fg-1">Số khách tối đa</Text>
                  <Stepper
                    accessibilityLabel="Số khách tối đa"
                    disabled={isOffline}
                    max={limits.maxPerWorkspace}
                    min={0}
                    value={guest.maxGuests}
                    onChange={(maxGuests) => setGuest({ ...guest, maxGuests })}
                  />
                </View>
                <View className="gap-xs">
                  <Text className="text-label-md text-fg-1">Số ngày tối đa mỗi khách</Text>
                  <View className="flex-row flex-wrap gap-xs">
                    {dayChoices.map((days) => (
                      <Chip
                        key={days}
                        disabled={isOffline}
                        label={`${days} ngày`}
                        role="radio"
                        selected={guest.maxDays === days}
                        onPress={() => {
                          hapticSelection();
                          setGuest({ ...guest, maxDays: days });
                        }}
                      />
                    ))}
                  </View>
                </View>
              </>
            ) : null}
          </View>
        </Card>
      </Section>

      <Button
        disabled={(!joinChanged && !guestChanged) || isOffline}
        fullWidth
        label="Lưu thay đổi"
        loading={updateSettings.isPending}
        onPress={save}
      />
    </View>
  );
}
