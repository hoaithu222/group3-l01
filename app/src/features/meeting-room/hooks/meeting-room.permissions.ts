import { ensureCameraPermission, ensureMicrophonePermission, openAppSettings } from '@/core/media/permissions';
import { showToast } from '@/shared/utils/toast.utils';

import { meetingRoomApi } from '../store/meeting-room.store';

export type DeviceKind = 'cam' | 'mic';

const BLOCKED_HINT: Record<DeviceKind, string> = {
  cam: 'Camera đang bị chặn. Chạm lại để mở Cài đặt và cấp quyền camera.',
  mic: 'Micro đang bị chặn. Chạm lại để mở Cài đặt và cấp quyền micro.',
};

/**
 * Xin quyền thiết bị đúng LÚC người dùng bật nó (app.md §3.2, §7) — không xin trước ở pre-join. Trả `true` khi dùng được.
 *
 * ⚠️ Không popup lặp: `denied` chỉ ghi cờ `micDenied`/`camDenied` (pre-join hiện dòng nhắc "vẫn vào được, chỉ nghe/không có camera").
 * Bị chặn VĨNH VIỄN (chỉ còn Cài đặt hệ thống): lần chạm đầu báo bằng toast, lần chạm THỨ HAI mới mở Cài đặt — không tự nhảy khỏi app.
 */
export async function ensureDevice(kind: DeviceKind): Promise<boolean> {
  const state = meetingRoomApi.get();
  const alreadyDenied = kind === 'mic' ? state.micDenied : state.camDenied;
  const outcome = await (kind === 'mic' ? ensureMicrophonePermission() : ensureCameraPermission());
  const denied = outcome !== 'granted';
  meetingRoomApi.patch(kind === 'mic' ? { micDenied: denied } : { camDenied: denied });
  if (outcome === 'blocked') {
    if (alreadyDenied) openAppSettings();
    else showToast('warning', BLOCKED_HINT[kind]);
  }
  return !denied;
}
