import { requestRecordingPermissionsAsync } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import { Linking } from 'react-native';

/**
 * `granted` — đã cấp. `denied` — vừa từ chối, còn hỏi lại được. `blocked` — từ
 * chối VĨNH VIỄN (`canAskAgain === false`), chỉ còn cách vào Cài đặt hệ thống.
 *
 * app.md §7: "Xin quyền camera/mic CHỈ KHI người dùng bấm chụp/ghi; bị từ chối
 * vĩnh viễn → sheet giải thích + nút Mở Cài đặt".
 */
export type PermissionOutcome = 'granted' | 'denied' | 'blocked';

function toOutcome(granted: boolean, canAskAgain: boolean): PermissionOutcome {
  if (granted) return 'granted';
  return canAskAgain ? 'denied' : 'blocked';
}

export async function ensureCameraPermission(): Promise<PermissionOutcome> {
  const result = await ImagePicker.requestCameraPermissionsAsync();
  return toOutcome(result.granted, result.canAskAgain);
}

export async function ensureMediaLibraryPermission(): Promise<PermissionOutcome> {
  const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return toOutcome(result.granted, result.canAskAgain);
}

export async function ensureMicrophonePermission(): Promise<PermissionOutcome> {
  const result = await requestRecordingPermissionsAsync();
  return toOutcome(result.granted, result.canAskAgain);
}

/** Mở màn Cài đặt hệ thống của app — dùng khi quyền bị từ chối VĨNH VIỄN. */
export function openAppSettings(): void {
  void Linking.openSettings();
}
