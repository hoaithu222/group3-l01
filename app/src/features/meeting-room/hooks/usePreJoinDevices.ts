import { useCallback, useEffect, useState } from 'react';

import { showToast } from '@/shared/utils/toast.utils';

import { getMeetingMedia } from '../media/meeting-media.registry';
import { meetingRoomApi, useMeetingRoomStore, type PreJoinPrefs } from '../store/meeting-room.store';
import { ensureDevice } from './meeting-room.permissions';
import { useMicLevel } from './useMicLevel';

interface PreJoinDevices {
  camDenied: boolean;
  micDenied: boolean;
  /** 0..100 — chỉ khác 0 khi mic thử đang bật. */
  micLevel: number;
  prefs: PreJoinPrefs;
  /** Mảnh mờ đục cho `renderVideo`; `null` khi camera tắt/chưa mở được. */
  previewRef: unknown;
  speakerOn: boolean;
  chooseListenOnly: () => void;
  flipCamera: () => void;
  setDisplayName: (name: string) => void;
  toggleCam: () => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleSpeaker: () => void;
}

const patchPrefs = (partial: Partial<PreJoinPrefs>): void =>
  meetingRoomApi.patch({ preJoin: { ...meetingRoomApi.get().preJoin, ...partial } });

/**
 * Hàng đợi MỘT lượt mở xem trước tại một thời điểm (dùng chung cho mọi bản hook — cổng media chỉ có một track xem trước).
 * ⛔ Không xếp hàng thì bật→tắt (hoặc đổi camera) nhanh làm hai `startPreview` chạy chồng: lượt về SAU ghi đè track của lượt kia trong
 * adapter ⇒ một track không ai dừng được nữa — đèn camera sáng ngầm trong khi màn ghi "Camera đang tắt".
 */
let previewQueue: Promise<void> = Promise.resolve();

/**
 * Thiết bị ở pre-join/phòng chờ: mic và camera MẶC ĐỊNH TẮT; bật thì xin quyền đúng lúc đó (`ensureDevice`) và bị từ chối chỉ hiện dòng nhắc,
 * vẫn vào được. Xem trước camera chạy khi `active` (PREJOIN/WAITING_FOR_HOST/IN_LOBBY) và camera bật; tự dừng khi sang bước nối phòng —
 * không giữ đèn camera ngoài lúc cần. Lượt mở xem trước xếp hàng (`previewQueue`); lượt về muộn sau khi đã tắt/đổi camera bị dừng ngay.
 *
 * ⚠️ CHƯA XÁC MINH trên thiết bị thật: xem trước camera + đo mức mic.
 */
export function usePreJoinDevices(active: boolean): PreJoinDevices {
  const prefs = useMeetingRoomStore((state) => state.preJoin);
  const camDenied = useMeetingRoomStore((state) => state.camDenied);
  const micDenied = useMeetingRoomStore((state) => state.micDenied);
  const speakerOn = useMeetingRoomStore((state) => state.speakerOn);
  const [previewRef, setPreviewRef] = useState<unknown>(null);
  const listen = prefs.listenOnly;
  const micLevel = useMicLevel(active && prefs.mic && !listen);

  useEffect(() => {
    if (!active || !prefs.cam || listen) return undefined;
    let cancelled = false;
    const media = getMeetingMedia();
    const facing = prefs.facing;
    previewQueue = previewQueue.then(async () => {
      if (cancelled) return;
      try {
        const ref = await media.startPreview(facing);
        // ✅ Đã tắt/đổi camera trong lúc chờ mở ⇒ dừng NGAY track vừa mở (lượt kế tiếp chỉ chạy sau dòng này).
        if (cancelled) await media.stopPreview();
        else setPreviewRef(ref);
      } catch {
        if (cancelled) return;
        patchPrefs({ cam: false });
        showToast('warning', 'Không mở được camera để xem trước.');
      }
    });
    return () => {
      cancelled = true;
      setPreviewRef(null);
      // Dừng ngay (không chờ hàng đợi) — rời pre-join là tắt đèn camera tức thì; lượt mở còn treo tự dừng khi về (xem trên).
      void media.stopPreview();
    };
  }, [active, listen, prefs.cam, prefs.facing]);

  const toggleMic = useCallback(async () => {
    if (meetingRoomApi.get().preJoin.mic) return patchPrefs({ mic: false });
    if (await ensureDevice('mic')) patchPrefs({ listenOnly: false, mic: true });
  }, []);

  const toggleCam = useCallback(async () => {
    if (meetingRoomApi.get().preJoin.cam) return patchPrefs({ cam: false });
    if (await ensureDevice('cam')) patchPrefs({ cam: true, listenOnly: false });
  }, []);

  return {
    camDenied,
    chooseListenOnly: () => patchPrefs({ cam: false, listenOnly: true, mic: false }),
    flipCamera: () => patchPrefs({ facing: meetingRoomApi.get().preJoin.facing === 'front' ? 'back' : 'front' }),
    micDenied,
    micLevel,
    prefs,
    previewRef: prefs.cam && !listen ? previewRef : null,
    setDisplayName: (name) => patchPrefs({ displayName: name }),
    speakerOn,
    toggleCam,
    toggleMic,
    toggleSpeaker: () => meetingRoomApi.patch({ speakerOn: !meetingRoomApi.get().speakerOn }),
  };
}
