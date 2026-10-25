import { Text, View } from 'react-native';

import { useIsScreenFocused } from '@/shared/hooks/useIsScreenFocused';
import { Button } from '@/shared/ui/button';
import { PulseDot } from '@/shared/ui/effects';
import { Icon, type IconName } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import type { WorkspaceListItem } from '../api';
import { JoinPendingGroupCard } from './JoinPendingGroupCard';

/** Ba chặng của một yêu cầu tham gia — chặng ĐANG chờ ghi rõ bằng chữ, không chỉ bằng màu chấm. */
const STEPS: readonly { icon: IconName; label: string; state: 'done' | 'current' | 'next' }[] = [
  { icon: 'checkmark-circle', label: 'Đã gửi yêu cầu', state: 'done' },
  { icon: 'clock', label: 'Quản trị nhóm xem xét (đang chờ)', state: 'current' },
  { icon: 'arrow-right-small', label: 'Tự chuyển vào nhóm khi được duyệt', state: 'next' },
];

export interface JoinPendingWaitingProps {
  cancelling: boolean;
  name: string | undefined;
  workspace: WorkspaceListItem | undefined;
  onBack: () => void;
  onCancel: () => void;
}

/**
 * Trạng thái CHỜ DUYỆT (p3-04) — bình thản, không giục: danh thiếp nhóm (`JoinPendingGroupCard`) · một chấm "đang chờ" toả
 * nhẹ · ba chặng (đã gửi → đang xem xét → tự vào nhóm) để người dùng biết mình đang ở đâu và KHÔNG phải làm gì thêm · hai lối
 * ra: về danh sách nhóm (yêu cầu vẫn giữ) hoặc huỷ yêu cầu.
 *
 * ⚠️ `PulseDot` là vòng lặp DUY NHẤT của màn, `active` theo `useIsScreenFocused()` (dừng khi màn bị che/app ở nền); "Giảm
 * chuyển động" bật thì đứng yên. Chấm là trang trí — nghĩa nằm ở tiêu đề chữ ngay cạnh.
 */
export function JoinPendingWaiting({
  cancelling,
  name,
  workspace,
  onBack,
  onCancel,
}: JoinPendingWaitingProps) {
  const focused = useIsScreenFocused();

  return (
    <View className="gap-xl">
      {workspace ? <JoinPendingGroupCard workspace={workspace} /> : null}

      <View className="gap-md rounded-md bg-bg-1 p-md">
        <View className="flex-row items-center gap-sm">
          <PulseDot active={focused} size={10} tone="warning" />
          <Text accessibilityRole="header" className="flex-1 text-label-lg font-semibold text-fg-1">
            Đang chờ quản trị nhóm duyệt
          </Text>
        </View>
        <Text className="text-body-md text-fg-2">
          {`Yêu cầu vào ${name ? `"${name}"` : 'nhóm'} đã được gửi. Bạn sẽ nhận thông báo khi được duyệt — màn này tự chuyển vào nhóm.`}
        </Text>
        <View accessibilityRole="list" className="gap-sm">
          {STEPS.map((step) => (
            <View key={step.label} className="flex-row items-center gap-sm">
              <Icon
                color={
                  step.state === 'done' ? 'success' : step.state === 'current' ? 'warning' : 'fg-2'
                }
                name={step.icon}
                size="sm"
              />
              <Text
                className={cn(
                  'flex-1 text-body-md',
                  step.state === 'current' ? 'font-semibold text-fg-1' : 'text-fg-2',
                )}
              >
                {step.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View className="gap-xs">
        <Button fullWidth label="Về danh sách nhóm" variant="secondary" onPress={onBack} />
        <Button
          fullWidth
          label="Huỷ yêu cầu"
          loading={cancelling}
          variant="neutral-secondary"
          onPress={onCancel}
        />
      </View>
    </View>
  );
}
