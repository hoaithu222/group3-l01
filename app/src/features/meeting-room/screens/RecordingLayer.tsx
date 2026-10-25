import { useEffect } from 'react';

import { showToast } from '@/shared/utils/toast.utils';

import { ConsentPromptDialog } from '../components/recording/ConsentPromptDialog';
import { ConsentRequestSheet } from '../components/recording/ConsentRequestSheet';
import { expireConsentRequest } from '../hooks/meeting-room.recording';
import type { RecordingControls } from '../hooks/useRecordingControls';
import { useServerNow } from '../hooks/useServerNow';
import { meetingRoomApi, useMeetingRoomStore } from '../store/meeting-room.store';
import { remainingMs } from '../utils/clock.utils';

/**
 * Lớp ghi hình của phòng (p2-06): tấm "Ghi hình" của chủ trì (`sheet === 'RECORDING'`) + hộp thoại hỏi ý kiến cho người tham gia (`consentPrompt`).
 * Yêu cầu đồng ý hết hạn trong lúc hộp thoại mở → đóng + "Yêu cầu đã hết hạn" (app.md §3). Đồng hồ server chỉ chạy khi có thứ đang hiện.
 */
export function RecordingLayer({ controls }: { controls: RecordingControls }) {
  const sheet = useMeetingRoomStore((state) => state.sheet);
  const prompt = useMeetingRoomStore((state) => state.consentPrompt);
  const rec = controls.recording;
  const sheetOpen = sheet === 'RECORDING';
  const nowMs = useServerNow(sheetOpen || prompt !== 'NONE');
  const requestId = rec?.status === 'CONSENT_REQUESTED' ? rec.requestId : undefined;
  const secondsLeft = requestId ? Math.ceil(remainingMs(rec?.expiresAt, nowMs) / 1000) : null;
  const expired = prompt === 'REQUEST' && secondsLeft !== null && secondsLeft <= 0;

  useEffect(() => {
    if (!expired || !requestId) return;
    expireConsentRequest(requestId);
    showToast('info', 'Yêu cầu ghi hình đã hết hạn.');
  }, [expired, requestId]);

  return (
    <>
      <ConsentRequestSheet
        busy={controls.busy}
        error={controls.failure?.message ?? null}
        nowMs={nowMs}
        recording={rec}
        visible={sheetOpen}
        onClose={() => {
          controls.clearFailure();
          meetingRoomApi.patch({ sheet: 'NONE' });
        }}
        onRequest={() => void controls.request()}
        onStart={() => void controls.start()}
        onStop={() => void controls.stop()}
      />
      <ConsentPromptDialog
        busy={controls.busy === 'RESPOND'}
        error={prompt !== 'NONE' ? (controls.failure?.message ?? null) : null}
        kind={prompt === 'LATE' ? 'LATE' : 'REQUEST'}
        secondsLeft={secondsLeft}
        visible={prompt !== 'NONE' && !expired}
        onAccept={() => void controls.respond(true)}
        onDecline={() => void controls.respond(false)}
      />
    </>
  );
}
