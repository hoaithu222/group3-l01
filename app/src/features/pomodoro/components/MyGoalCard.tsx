import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';

import type { PomodoroSnapshot } from '../api/pomodoro.types';

export interface MyGoalCardProps {
  goal: PomodoroSnapshot['myGoal'];
  onEdit: () => void;
}

/** "Mục tiêu của tôi" (app.md p5-02 §3): mục tiêu hiện tại (nếu có) + nút đặt/sửa. Ghi rõ đang chia sẻ với phòng hay chỉ mình tôi thấy. */
export function MyGoalCard({ goal, onEdit }: MyGoalCardProps) {
  return (
    <View className="gap-xs rounded-md border-hairline border-border-1 bg-bg-1 p-md">
      <View className="flex-row items-center justify-between gap-xs">
        <Text className="flex-1 text-label-md font-semibold text-fg-1">Mục tiêu của tôi</Text>
        <Button label={goal ? 'Sửa' : 'Đặt mục tiêu'} size="sm" variant="tertiary" onPress={onEdit} />
      </View>
      {goal ? (
        <>
          <Text className="text-body-md text-fg-1">{goal.text}</Text>
          <Text className="text-caption-lg text-fg-2">{goal.shared ? 'Đang chia sẻ với phòng' : 'Chỉ mình bạn thấy'}</Text>
        </>
      ) : (
        <Text className="text-body-md text-fg-2">Chưa có mục tiêu — đặt một việc nhỏ cho phiên này.</Text>
      )}
    </View>
  );
}
