import { View } from 'react-native';

import type { PomodoroCommandKind, PomodoroSnapshot } from '../api/pomodoro.types';
import { isMicLocked, phaseHint } from '../utils/phase';
import { ConnectionNotice, type ConnectionNoticeProps } from './ConnectionNotice';
import { CycleDots } from './CycleDots';
import { HostControls } from './HostControls';
import { MyGoalCard } from './MyGoalCard';
import { PhaseLabel } from './PhaseLabel';
import { PomodoroClock } from './PomodoroClock';
import { PomodoroParticipants } from './PomodoroParticipants';
import { RoomRulesCard } from './RoomRulesCard';

export interface PomodoroRoomViewProps {
  busyKind: PomodoroCommandKind | null;
  channelId: string;
  connection: ConnectionNoticeProps;
  myId: string | undefined;
  offline: boolean;
  onConfigure: () => void;
  onEditGoal: () => void;
  onRunCommand: (kind: PomodoroCommandKind) => void;
  snapshot: PomodoroSnapshot;
}

/**
 * Trong phòng (app.md p5-02 §3 "Trong phòng" + "Host"): thông báo kết nối, giai đoạn + đồng hồ lớn + vòng, điều khiển chủ phòng (theo `myActions` của
 * server), mục tiêu của tôi, luật phòng, lưới người. Tablet: đồng hồ + điều khiển bên trái, mục tiêu + luật + người bên phải (§7). Thanh media
 * (mic/camera/loa/Rời) ở thanh đáy của màn (`PomodoroMediaBar`).
 */
export function PomodoroRoomView(props: PomodoroRoomViewProps) {
  const { busyKind, channelId, connection, myId, offline, onConfigure, onEditGoal, onRunCommand, snapshot } = props;
  return (
    <View className="gap-md py-md">
      <ConnectionNotice {...connection} />
      <View className="gap-lg tablet:flex-row">
        <View className="items-center gap-md tablet:flex-1">
          <PhaseLabel hint={phaseHint(snapshot)} phase={snapshot.phase} />
          <PomodoroClock channelId={channelId} snapshot={snapshot} />
          <CycleDots
            completed={snapshot.completedFocusCycles}
            phase={snapshot.phase}
            skipped={snapshot.skippedFocusCycles}
            total={snapshot.config.cyclesBeforeLongBreak}
          />
          <View className="w-full">
            <HostControls
              actions={snapshot.myActions}
              busyKind={busyKind}
              disabled={offline}
              phase={snapshot.phase}
              onConfigure={onConfigure}
              onRun={onRunCommand}
            />
          </View>
        </View>
        <View className="gap-md tablet:flex-1">
          <MyGoalCard goal={snapshot.myGoal} onEdit={onEditGoal} />
          <RoomRulesCard micLocked={isMicLocked(snapshot, myId)} snapshot={snapshot} variant="room" />
          <PomodoroParticipants myId={myId} participants={snapshot.participants} />
        </View>
      </View>
    </View>
  );
}
