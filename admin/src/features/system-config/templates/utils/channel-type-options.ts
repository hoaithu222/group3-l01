import type { DropdownOption } from '@/shared/ui';

import { CHANNEL_TYPE_LABELS } from '../constants/templates.constants';

export interface ChannelTypeFlags {
  /** `capabilities.features.voice.enabled`. */
  voice: boolean;
  /** `capabilities.features.pomodoro.enabled`. */
  pomodoro: boolean;
}

/**
 * Lựa chọn "Loại kênh". VOICE/POMODORO bị KHOÁ (không chọn MỚI được) khi phân hệ tương ứng đang tắt — BE bỏ qua các kênh
 * đó lúc áp mẫu (`TYPE_UNAVAILABLE`) nên chọn vào chỉ vô ích. Hàng đang mang loại đó (vd bản seed) vẫn hiện đúng giá trị và
 * đổi được sang loại khác. `TEXT` luôn chọn được.
 */
export function buildChannelTypeOptions({ voice, pomodoro }: ChannelTypeFlags): DropdownOption[] {
  return [
    { value: 'TEXT', label: CHANNEL_TYPE_LABELS.TEXT },
    {
      value: 'VOICE',
      label: CHANNEL_TYPE_LABELS.VOICE,
      disabled: !voice,
      meta: voice ? undefined : 'Phân hệ thoại đang tắt',
    },
    {
      value: 'POMODORO',
      label: CHANNEL_TYPE_LABELS.POMODORO,
      disabled: !pomodoro,
      meta: pomodoro ? undefined : 'Phòng Pomodoro đang tắt',
    },
  ];
}
