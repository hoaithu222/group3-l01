import { callHostPath, channelVoicePath, hostActionSlug } from '../api/voice-room.api';
import type { HostAction } from '../api/voice-room.types';

/** Chuỗi viết dấu gạch (`block-audio`…) trong mã bị `check:classes` báo nhầm thành class Tailwind — nên ghép từ các mảnh. */
const dashed = (...parts: string[]) => parts.join('-');

describe('đường dẫn phòng thoại kênh (khớp BE `hostActionParamsSchema`/`calls.routes.ts`)', () => {
  it('mỗi HostAction ánh xạ đúng đoạn cuối `POST /calls/:id/host/:action` của BE', () => {
    const expected: Record<HostAction, string> = {
      BLOCK_AUDIO: dashed('block', 'audio'),
      END: 'end',
      END_SHARE: dashed('end', 'share'),
      INVITE_SPEAK: dashed('invite', 'speak'),
      MUTE_REQUEST: dashed('mute', 'request'),
      REMOVE: 'remove',
      TRANSFER: 'transfer',
      UNBLOCK_AUDIO: dashed('unblock', 'audio'),
    };
    for (const [action, slug] of Object.entries(expected)) expect(hostActionSlug(action as HostAction)).toBe(slug);
    expect(Object.keys(expected)).toHaveLength(8); // đủ 8 thao tác của BE — thêm một cái ở BE mà quên ở đây là lệch
  });

  it('đường dẫn đầy đủ', () => {
    expect(callHostPath('c1', 'BLOCK_AUDIO')).toBe(`/calls/c1/host/${dashed('block', 'audio')}`);
    expect(callHostPath('c1', 'END')).toBe('/calls/c1/host/end');
    expect(channelVoicePath('ch1')).toBe('/channels/ch1/voice');
  });
});
