import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';

import { getDeviceId } from '@/core/device/device-id';

import { callsService } from '../../api/calls.service';
import { hangUp } from '../../hooks/call-actions';
import { callStoreApi } from '../../store/call.store';
import { newClientCallId } from '../../utils/client-call-id';
import { classifyCallError, type CallFailure } from '../../utils/call-errors';
import { voiceRoomKeys } from '../api/voice-room.keys';
import { voiceJoinAttempts, voiceJoinPrefs, type VoiceJoinPrefs } from '../store/voice-join.prefs';
import { useVoiceRoomStore } from '../store/voice-room.store';

export interface SwitchPrompt {
  /** `SAME_ROOM_OTHER_DEVICE`: đang ở CHÍNH phòng này trên máy khác · `OTHER_CALL`: đang trong cuộc gọi khác. */
  kind: 'OTHER_CALL' | 'SAME_ROOM_OTHER_DEVICE';
  options: VoiceJoinPrefs;
  /** Tên cuộc gọi đang ở (nếu biết) để câu hỏi nói rõ "rời cuộc gọi với …". */
  title?: string;
}

export interface UseJoinVoiceRoom {
  /** Người dùng đồng ý "Chuyển cuộc gọi sang đây" → gọi lại với `force`. */
  confirmSwitch: () => Promise<boolean>;
  dismissFailure: () => void;
  dismissSwitch: () => void;
  failure: CallFailure | null;
  /** Vào phòng (hoặc tạo phiên nếu chưa có). `true` = đã mở màn phòng. Xin quyền mic/camera ở bước MEDIA, không phải ở đây. */
  join: (options: VoiceJoinPrefs) => Promise<boolean>;
  pending: boolean;
  switchPrompt: SwitchPrompt | null;
}

/**
 * Bấm "Tham gia"/"Tham gia để nghe" ở preview (app.md §2 `useJoinVoiceRoom`): `POST /calls { CHANNEL }` (tạo hoặc vào), xử lý
 * `CALL_004` (hỏi rồi gọi lại `force`), `CALL_008/016/018/012` (làm mới preview + nói rõ lý do). KHÔNG xin quyền ở đây: lựa chọn
 * "để nghe"/camera đi qua `voiceJoinPrefs` tới `connectCallSession` — nơi duy nhất xin quyền, sau khi phòng đã tạo (VR-01/VR-02).
 */
export function useJoinVoiceRoom(channelId: string): UseJoinVoiceRoom {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<CallFailure | null>(null);
  const [switchPrompt, setSwitchPrompt] = useState<SwitchPrompt | null>(null);

  const run = useCallback(
    async (options: VoiceJoinPrefs, force: boolean): Promise<boolean> => {
      const current = callStoreApi.get();
      const live = current.starting || (current.phase !== 'idle' && current.phase !== 'ended');
      if (live && current.call?.mode === 'ROOM' && current.call.scopeId === channelId && current.callId) {
        router.push({ params: { callId: current.callId }, pathname: '/call/[callId]' }); // đang ở phòng này: quay lại, không vào lần hai
        return true;
      }
      if (live && !force) {
        setSwitchPrompt({ kind: 'OTHER_CALL', options, title: current.call?.scope.title });
        return false;
      }
      if (live) await hangUp(queryClient); // đã xác nhận rời cuộc gọi hiện tại (ngắt media phía máy này trước)

      const key = `${channelId}:${options.camera ? 'VIDEO' : 'AUDIO'}`;
      // Thử lại thủ công sau mất mạng dùng LẠI cùng `clientCallId` nên BE trả cùng phiên (CL-09).
      const clientCallId = voiceJoinAttempts.get(key) ?? newClientCallId();
      voiceJoinAttempts.set(key, clientCallId);
      useVoiceRoomStore.getState().reset();
      voiceJoinPrefs.set(options);
      callStoreApi.dispatch({ clientCallId, type: 'START_BEGIN' });
      setPending(true);
      try {
        const result = await callsService.create({
          clientCallId,
          deviceId: await getDeviceId(),
          force: force || undefined,
          mediaKind: options.camera ? 'VIDEO' : 'AUDIO',
          scopeId: channelId,
          scopeType: 'CHANNEL',
        });
        voiceJoinAttempts.delete(key);
        callStoreApi.dispatch({ call: result.call, joined: result.joined, token: result.token, type: 'START_OK' });
        void queryClient.invalidateQueries({ queryKey: voiceRoomKeys.preview(channelId) });
        router.push({ params: { callId: result.call.id }, pathname: '/call/[callId]' });
        return true;
      } catch (error) {
        voiceJoinPrefs.take(); // không để "chỉ nghe" của lần thất bại này rơi vào cuộc gọi kế tiếp
        callStoreApi.dispatch({ type: 'START_FAILED' });
        const classified = classifyCallError(error);
        if (classified.kind !== 'OFFLINE') voiceJoinAttempts.delete(key); // mọi lỗi khác: lần sau là ý định MỚI
        if (classified.kind === 'IN_OTHER_CALL') {
          setSwitchPrompt({
            kind: classified.sameCallOtherDevice ? 'SAME_ROOM_OTHER_DEVICE' : 'OTHER_CALL',
            options,
            title: classified.activeCallTitle,
          });
        } else {
          if (['ARCHIVED', 'FULL', 'REMOVED', 'NO_ACCESS'].includes(classified.kind)) {
            void queryClient.invalidateQueries({ queryKey: voiceRoomKeys.preview(channelId) });
          }
          setFailure(classified);
        }
        return false;
      } finally {
        setPending(false);
      }
    },
    [channelId, queryClient],
  );

  const join = useCallback((options: VoiceJoinPrefs) => run(options, false), [run]);
  const confirmSwitch = useCallback(async () => {
    const prompt = switchPrompt;
    setSwitchPrompt(null);
    return prompt ? run(prompt.options, true) : false;
  }, [run, switchPrompt]);

  return {
    confirmSwitch,
    dismissFailure: () => setFailure(null),
    dismissSwitch: () => setSwitchPrompt(null),
    failure,
    join,
    pending,
    switchPrompt,
  };
}
