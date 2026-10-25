import * as FileSystem from 'expo-file-system/legacy';
import { Asset, requestPermissionsAsync } from 'expo-media-library';

export type SaveOutcome = 'saved' | 'denied' | 'error';

/**
 * Lưu ảnh/video về thư viện máy — quyền "CHỈ THÊM" (`writeOnly=true`, app.md §6:
 * "quyền chỉ thêm iOS" — `NSPhotoLibraryAddUsageDescription`, không xin đọc
 * toàn bộ thư viện chỉ để LƯU một tệp).
 */
export async function saveAssetToLibrary(remoteUrl: string, fileName: string): Promise<SaveOutcome> {
  const permission = await requestPermissionsAsync(true);
  if (!permission.granted) return 'denied';
  try {
    const dest = `${FileSystem.cacheDirectory}${fileName}`;
    const result = await FileSystem.downloadAsync(remoteUrl, dest);
    await Asset.create(result.uri);
    return 'saved';
  } catch {
    return 'error';
  }
}
