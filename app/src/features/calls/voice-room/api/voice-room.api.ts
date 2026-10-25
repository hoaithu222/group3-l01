import type { HostAction } from './voice-room.types';

/** Đường dẫn endpoint phòng thoại kênh (BE `calls.routes.ts`, p2-03) — cùng module `calls`, chỉ khác đường dẫn kênh. */

export const channelVoicePath = (channelId: string): string => `/channels/${channelId}/voice`;

/** `BLOCK_AUDIO` → `block-audio`: đoạn cuối đường dẫn của BE (`hostActionParamsSchema`). */
export const hostActionSlug = (action: HostAction): string => action.toLowerCase().replace(/_/g, '-');

export const callHostPath = (callId: string, action: HostAction): string => `/calls/${callId}/host/${hostActionSlug(action)}`;
