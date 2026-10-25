import { useCallback, useState } from 'react';

import { showToast } from '@/shared/utils/toast.utils';

import { getMeetingMedia } from '../media/meeting-media.registry';
import { meetingRoomApi, useMeetingRoomStore, type RoomSheet, type StageLayout } from '../store/meeting-room.store';
import { toggleCamera, toggleMicrophone } from './meeting-room.devices';

export interface MeetingControls {
  camBusy: boolean;
  camOn: boolean;
  /** Có quyền chia sẻ (token) VÀ thiết bị/bản dựng hỗ trợ — iOS cần Broadcast Extension nên `false` ở đó, UI ẩn nút (README §10). */
  canScreenShare: boolean;
  micBusy: boolean;
  micOn: boolean;
  screenSharing: boolean;
  speakerOn: boolean;
  closeSheet: () => void;
  flipCamera: () => Promise<void>;
  openSheet: (sheet: RoomSheet) => void;
  setLayout: (layout: StageLayout) => void;
  togglePin: (userId: string | null) => void;
  toggleCamera: () => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  toggleSpeaker: () => Promise<void>;
}

/** Chạy `action` với cờ bận — nút hiện `loading`, bấm dồn không gọi hai lần. */
function useBusyAction(action: () => Promise<void>): [boolean, () => Promise<void>] {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }, [action, busy]);
  return [busy, run];
}

/**
 * Thiết bị của MÌNH trong phòng. Nút luôn theo track THẬT: `micOn/camOn` lấy từ người cục bộ trong danh sách media
 * (`meeting-room.media-events.ts`) chứ không từ ý định của người dùng. Bật mic/camera xin quyền đúng lúc bấm; không bao giờ tự bật.
 */
export function useMeetingControls(): MeetingControls {
  const micOn = useMeetingRoomStore((state) => state.micOn);
  const camOn = useMeetingRoomStore((state) => state.camOn);
  const speakerOn = useMeetingRoomStore((state) => state.speakerOn);
  const screenSharing = useMeetingRoomStore((state) => state.screenSharing);
  const canShare = useMeetingRoomStore((state) => state.publish.screen);
  const [micBusy, toggleMic] = useBusyAction(toggleMicrophone);
  const [camBusy, toggleCam] = useBusyAction(toggleCamera);

  const toggleScreenShare = useCallback(async () => {
    const share = getMeetingMedia().setScreenShareEnabled;
    if (!share) return;
    try {
      meetingRoomApi.patch({ screenSharing: await share(!meetingRoomApi.get().screenSharing) });
    } catch {
      showToast('error', 'Không chia sẻ được màn hình. Hãy thử lại.');
    }
  }, []);

  const toggleSpeaker = useCallback(async () => {
    const next = !meetingRoomApi.get().speakerOn;
    await getMeetingMedia().setSpeakerOn(next).catch(() => undefined);
    meetingRoomApi.patch({ speakerOn: next });
  }, []);

  return {
    camBusy,
    camOn,
    canScreenShare: canShare && getMeetingMedia().setScreenShareEnabled !== null,
    closeSheet: () => meetingRoomApi.patch({ sheet: 'NONE' }),
    flipCamera: () => getMeetingMedia().flipCamera().catch(() => showToast('error', 'Không đổi được camera.')),
    micBusy,
    micOn,
    // Mở Chat = đã đọc: xoá badge chưa đọc cùng lúc.
    openSheet: (sheet) => meetingRoomApi.patch(sheet === 'CHAT' ? { chatUnread: 0, sheet } : { sheet }),
    screenSharing,
    setLayout: (layout) => meetingRoomApi.patch({ layout, page: 0 }),
    speakerOn,
    toggleCamera: toggleCam,
    toggleMic,
    togglePin: (userId) => meetingRoomApi.patch({ pinnedUserId: userId }),
    toggleScreenShare,
    toggleSpeaker,
  };
}
