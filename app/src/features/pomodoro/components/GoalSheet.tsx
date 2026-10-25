import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Toggle } from '@/shared/ui/toggle';

import { pomodoroKeys } from '../api/pomodoro.keys';
import { pomodoroService } from '../api/pomodoro.service';
import type { PomodoroGoalPayload, PomodoroSnapshot } from '../api/pomodoro.types';
import { usePomodoroLimits } from '../hooks/usePomodoroLimits';
import { usePomodoroStore } from '../store/pomodoro.store';
import { graphemeLength } from '../utils/grapheme';
import { pomodoroErrorMessage } from '../utils/pomodoro-errors';

export interface GoalSheetProps {
  channelId: string;
  offline: boolean;
  onClose: () => void;
  snapshot: PomodoroSnapshot;
  visible: boolean;
}

/**
 * Mục tiêu của tôi (app.md p5-02 §3 "Goal sheet"): ô nhiều dòng đếm GRAPHEME (khớp BE — emoji ghép tính 1) tới `goalMax` (200) + công tắc "Chia sẻ
 * với phòng". Chữ đang gõ giữ trong store theo phiên (`goalDraft`) nên đóng tấm / mất mạng không mất nháp; lỗi hiện NGAY TẠI Ô. Chuỗi rỗng = xoá mục tiêu.
 * Chỉ có tác dụng khi đã vào phòng (BE trả `CALL_POMO_006` nếu chưa).
 */
export function GoalSheet({ channelId, offline, onClose, snapshot, visible }: GoalSheetProps) {
  const queryClient = useQueryClient();
  const { goalMax } = usePomodoroLimits();
  const key = snapshot.sessionId ?? channelId;
  const draft = usePomodoroStore((state) => state.goalDraft[key]);
  const [sharedDraft, setShared] = useState<boolean | null>(null);
  const text = draft ?? snapshot.myGoal?.text ?? '';
  const shared = sharedDraft ?? snapshot.myGoal?.shared ?? false;
  const length = graphemeLength(text.trim());
  const tooLong = length > goalMax;

  const save = useMutation({
    mutationFn: (payload: PomodoroGoalPayload) => pomodoroService.setGoal(channelId, payload),
    onSuccess: (saved) => {
      queryClient.setQueryData<PomodoroSnapshot>(pomodoroKeys.snapshot(channelId), (prev) =>
        prev ? { ...prev, myGoal: saved.goal ? { shared: saved.shared, text: saved.goal } : null } : prev,
      );
      close();
    },
  });

  function close(): void {
    usePomodoroStore.getState().clearGoalDraft(key);
    setShared(null);
    save.reset();
    onClose();
  }

  return (
    <BottomSheet
      description="Một câu ngắn về việc bạn định làm trong phiên này."
      dismissOnBackdrop={!save.isPending}
      footer={
        <Button
          disabled={offline || tooLong}
          fullWidth
          label={offline ? 'Kết nối lại để lưu' : 'Lưu mục tiêu'}
          loading={save.isPending}
          onPress={() => save.mutate({ shared, text: text.trim() })}
        />
      }
      scrollable
      title="Mục tiêu của tôi"
      visible={visible}
      onClose={onClose}
    >
      <View className="gap-md py-xs">
        <Input
          hint={`${length}/${goalMax}`}
          label="Mục tiêu"
          labelInside
          message={tooLong ? `Tối đa ${goalMax} ký tự` : save.isError ? pomodoroErrorMessage(save.error, 'Không lưu được mục tiêu') : undefined}
          multiline
          placeholder="Ví dụ: xong chương 3 giải tích"
          value={text}
          onChangeText={(next) => usePomodoroStore.getState().setGoalDraft(key, next)}
        />
        <Toggle
          description="Mọi người trong phòng thấy mục tiêu của bạn dưới tên bạn"
          label="Chia sẻ với phòng"
          value={shared}
          onChange={setShared}
        />
      </View>
    </BottomSheet>
  );
}
