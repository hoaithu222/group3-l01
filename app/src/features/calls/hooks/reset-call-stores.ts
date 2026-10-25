import { useCallMediaStore } from '../store/call-media.store';
import { callStoreApi } from '../store/call.store';
import { resetVoiceJoinState } from '../voice-room/store/voice-join.prefs';
import { teardownCallSession } from './call-session.controller';

/**
 * Đăng xuất/đổi tài khoản (README p2-01 §5.4): xoá state cuộc gọi VÀ ngắt media ngay. `CallRuntime` nay sống ở GỐC
 * (không bị gỡ khi rời nhóm `(app)`) nên nó KHÔNG tự ngắt hộ lúc đăng xuất — phải gọi tường minh ở đây. `deviceId` KHÔNG xoá: nó định danh MÁY (dùng chung với socket/refresh), không phải phiên; token push
 * được huỷ ở p0-06.
 *
 * Phòng thoại kênh (p2-03): `teardownCallSession` dọn `voice-room.store` (lời nhắc của chủ phòng); `resetVoiceJoinState` dọn lựa chọn
 * "để nghe"/camera và `clientCallId` thử lại của lượt vào phòng — không để người dùng kế tiếp thừa hưởng.
 */
export function resetCallStores(): void {
  callStoreApi.dispatch({ type: 'RESET' });
  useCallMediaStore.getState().reset();
  resetVoiceJoinState();
  void teardownCallSession().catch(() => undefined);
}
