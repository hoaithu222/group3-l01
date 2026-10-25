import {
  choiceFromChannelMode,
  inheritLabel,
  NOTIFY_CHOICE_LABEL,
  type NotifyChoice,
} from '@/shared/notifications';

import type { NotifyMode } from '../api';

/**
 * Nhãn chế độ thông báo của MỘT kênh, hiện ở dòng "Thông báo" của thẻ Cá nhân (`ChannelPersonalCard`) — cùng bộ chữ với `NotifyModeSheet`
 * ("Mọi tin" · "Chỉ nhắc tên & luồng" · "Tắt tiếng"). `INHERIT` hiện GIÁ TRỊ KẾ THỪA THỰC TẾ ("Theo mặc định (Chỉ nhắc tên & luồng)"), không
 * phải chữ trống; chưa biết giá trị kế thừa (đang tải nhóm) thì chỉ "Theo mặc định" — không bịa.
 */
export function channelNotifyLabel(
  mode: NotifyMode,
  inherited: Exclude<NotifyChoice, 'INHERIT'> | undefined,
): string {
  const choice = choiceFromChannelMode(mode);
  return choice === 'INHERIT' ? inheritLabel(inherited) : NOTIFY_CHOICE_LABEL[choice];
}
