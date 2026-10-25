import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';

import type { PomodoroSnapshot } from '../api/pomodoro.types';
import { describeConfig, phaseHint } from '../utils/phase';
import { POMODORO_HISTORY_HREF } from '../utils/pomodoro-routes';
import { CycleDots } from './CycleDots';
import { PhaseLabel } from './PhaseLabel';
import { PomodoroClock } from './PomodoroClock';
import { PomodoroParticipants } from './PomodoroParticipants';
import { RoomRulesCard } from './RoomRulesCard';
import { router } from 'expo-router';

export interface PomodoroPreviewProps {
  channelId: string;
  myId: string | undefined;
  offline: boolean;
  onConfigure: () => void;
  snapshot: PomodoroSnapshot;
}

/**
 * Xem trước phòng (app.md p5-02 §3 "Preview"): giai đoạn + đồng hồ CHỈ ĐỌC (đếm theo server dù chưa vào), cấu hình chu kỳ, số người đang học, luật phòng,
 * nút "Cấu hình" (khi server nói `canConfigure`). Nút "Vào học"/"Bắt đầu" ở thanh đáy (`PomodoroPreviewBar`). Kênh chưa có phiên ⇒ "Chưa có phiên —
 * bấm Bắt đầu để mở phòng". Tablet: đồng hồ trái, người + luật phải.
 */
export function PomodoroPreview({
  channelId,
  myId,
  offline,
  onConfigure,
  snapshot,
}: PomodoroPreviewProps) {
  const noSession = snapshot.sessionId === null;
  return (
    <View className="gap-lg py-md tablet:flex-row">
      <View className="items-center gap-md tablet:flex-1">
        <PhaseLabel
          hint={noSession ? 'Chưa có phiên — bấm Bắt đầu để mở phòng' : phaseHint(snapshot)}
          phase={snapshot.phase}
        />
        <PomodoroClock channelId={channelId} snapshot={snapshot} />
        {noSession ? null : (
          <CycleDots
            completed={snapshot.completedFocusCycles}
            phase={snapshot.phase}
            skipped={snapshot.skippedFocusCycles}
            total={snapshot.config.cyclesBeforeLongBreak}
          />
        )}
        <Text className="text-center text-body-md text-fg-2">
          {describeConfig(snapshot.config)}
        </Text>
        {snapshot.myActions?.canConfigure ? (
          <Button
            disabled={offline}
            iconLeft="setting"
            label="Cấu hình"
            variant="tertiary"
            onPress={onConfigure}
          />
        ) : null}
      </View>
      <View className="gap-md tablet:flex-1">
        <RoomRulesCard micLocked={false} snapshot={snapshot} variant="preview" />
        <PomodoroParticipants myId={myId} participants={snapshot.participants} />
        {/* Một HÀNG có mũi tên (không phải nút lẻ loi căn trái cuối cột). */}
        {/* Ô icon `timer` tông `brand` = cùng nhận diện với dải đầu màn lịch sử + thẻ "giờ tập trung" ở Trang chủ. Mũi tên
            `fg-2` (không `fg-3` — 2.96:1 trên thẻ trắng, dấu hiệu "bấm được" phải thấy rõ). */}
        <Card>
          <ListItem
            description="Thời gian có mặt, số vòng và mục tiêu của các phiên"
            emphasis="title"
            label="Lịch sử học của tôi"
            leading={<IconTile name="timer" size="sm" tone="brand" />}
            trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
            onPress={() => router.push(POMODORO_HISTORY_HREF)}
          />
        </Card>
      </View>
    </View>
  );
}
