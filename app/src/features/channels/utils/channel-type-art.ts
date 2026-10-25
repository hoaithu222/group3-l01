import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';

import type { ChannelType } from '../api';

/**
 * Icon + tông ô icon theo LOẠI kênh — MỘT nguồn cho mọi chỗ vẽ kênh (dòng danh sách, đầu trang thông tin, bước chọn loại khi
 * tạo kênh), để "kênh thoại" ở màn nào cũng cùng một hình, cùng một màu.
 *
 * ⛔ `hash` (TEXT) và `volume` (VOICE) không có trong bộ icon hiện tại (`ls assets/icons/system`, app.md §6) — thay bằng tên gần
 * nhất: `chat-bubble` (tin nhắn) và `mic-01` (micro, đúng nghĩa "thoại" hơn cả `audio`). `timer` (POMODORO) dùng đúng tên.
 * Tông: chat = `info`, thoại = `success`, pomodoro = `warning`; kênh đã lưu trữ thì nơi gọi hạ về `neutral`.
 */
export const CHANNEL_TYPE_ICON: Record<ChannelType, IconName> = {
  TEXT: 'chat-bubble',
  VOICE: 'mic-01',
  POMODORO: 'timer',
};

export const CHANNEL_TYPE_TONE: Record<ChannelType, IconTileTone> = {
  TEXT: 'info',
  VOICE: 'success',
  POMODORO: 'warning',
};

export const CHANNEL_TYPE_LABEL: Record<ChannelType, string> = {
  TEXT: 'Kênh chữ',
  VOICE: 'Kênh thoại',
  POMODORO: 'Kênh Pomodoro',
};
