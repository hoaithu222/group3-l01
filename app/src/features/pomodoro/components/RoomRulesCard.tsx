import { Text, View } from 'react-native';

import type { IconName } from '@/shared/ui/icon';
import { Icon } from '@/shared/ui/icon';

import type { PomodoroSnapshot } from '../api/pomodoro.types';

export interface RoomRulesCardProps {
  /** Mic bị khoá với TÔI (server: giai đoạn tập trung, trừ chủ phòng khi `hostCanSpeakInFocus`). */
  micLocked: boolean;
  snapshot: Pick<PomodoroSnapshot, 'config' | 'phase' | 'rules'>;
  /** `preview` = khi CHƯA vào phòng: nói luật chung của phòng (mic khoá lúc tập trung) dù giai đoạn hiện tại là gì. */
  variant: 'preview' | 'room';
}

interface RuleLine {
  icon: IconName;
  text: string;
}

function roomLines({ micLocked, snapshot }: RoomRulesCardProps): RuleLine[] {
  const { config, phase, rules } = snapshot;
  const lines: RuleLine[] = [];
  if (!rules.micAllowed) {
    lines.push({ icon: 'lock', text: micLocked ? 'Mic tắt khi tập trung' : 'Bạn là chủ phòng — được nói khi tập trung' });
  } else {
    // PM-06: sang nghỉ KHÔNG tự bật mic — chỉ gợi ý.
    lines.push({
      icon: 'mic-01',
      text: phase === 'WAITING' ? 'Mic bật được — mặc định tắt cho tới khi bạn bật' : 'Bạn có thể bật mic (mic vẫn tắt cho tới khi bạn bật)',
    });
  }
  if (rules.cameraAllowed) lines.push({ icon: 'view', text: 'Camera bật được bất cứ lúc nào' });
  if (config.hostCanSpeakInFocus && micLocked) lines.push({ icon: 'user', text: 'Chỉ chủ phòng được nói khi tập trung' });
  return lines;
}

function previewLines({ snapshot }: RoomRulesCardProps): RuleLine[] {
  const lines: RuleLine[] = [
    { icon: 'lock', text: 'Mic tắt khi tập trung — máy chủ khoá, không bật được' },
    { icon: 'mic-01', text: 'Giờ nghỉ bật mic được (mic vẫn tắt cho tới khi bạn bật)' },
  ];
  if (snapshot.rules.cameraAllowed) lines.push({ icon: 'view', text: 'Camera bật được bất cứ lúc nào' });
  return lines;
}

/**
 * "Luật phòng" theo giai đoạn (app.md p5-02 §3): mic tắt khi tập trung, gợi ý bật mic khi nghỉ. Luật do SERVER tính (`snapshot.rules`) — client chỉ
 * hiển thị; thực thi thật ở máy chủ media (PM-02). Mỗi dòng có icon + CHỮ.
 */
export function RoomRulesCard(props: RoomRulesCardProps) {
  const lines = props.variant === 'preview' ? previewLines(props) : roomLines(props);
  return (
    <View className="gap-xs rounded-md border-hairline border-border-1 bg-bg-1 p-md">
      <Text className="text-label-md font-semibold text-fg-1">Luật phòng</Text>
      {lines.map((line) => (
        <View key={line.text} className="flex-row items-center gap-xs">
          <Icon color="fg-2" name={line.icon} size="sm" />
          <Text className="flex-1 text-body-md text-fg-2">{line.text}</Text>
        </View>
      ))}
    </View>
  );
}
