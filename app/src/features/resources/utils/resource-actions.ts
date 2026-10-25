import { Asset, requestPermissionsAsync } from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Linking } from 'react-native';

import { resourcesService, type ResourceDto } from '../api';
import { cachePathFor, findCachedFile, startDownload } from './resource-files';

type Subject = Pick<ResourceDto, 'id' | 'mime' | 'name' | 'size' | 'type' | 'version'>;

export type FileActionOutcome = 'cancelled' | 'done' | 'unavailable';

/** Tệp về máy (biến thể `download` — `Content-Disposition: attachment`), dùng lại bản cache nếu đã có. */
export async function ensureLocalFile(
  resource: Subject,
  onProgress: (ratio: number) => void,
): Promise<string> {
  const cached = await findCachedFile(resource, 'download');
  if (cached) return cached;
  const { url } = await resourcesService.url(resource.id, 'download');
  return startDownload(url, cachePathFor(resource, 'download'), onProgress).promise;
}

/** Mở bảng chia sẻ của hệ điều hành với TỆP thật — ⛔ không chia sẻ URL ký (hết hạn 60 s và lộ quyền truy cập). */
export async function shareLocalFile(
  uri: string,
  resource: Pick<ResourceDto, 'mime' | 'name'>,
  dialogTitle: string,
): Promise<FileActionOutcome> {
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  await Sharing.shareAsync(uri, { dialogTitle, mimeType: resource.mime });
  return 'done';
}

/**
 * "Tải về": ảnh/video → thư viện máy (quyền CHỈ THÊM, cùng cách `chat` lưu ảnh);
 * tệp khác → bảng chia sẻ để người dùng chọn "Lưu vào Tệp/Drive" — app không có
 * quyền ghi thư mục tuỳ ý trên Android mới (Scoped Storage).
 */
export async function saveLocalFile(
  uri: string,
  resource: Pick<ResourceDto, 'mime' | 'name' | 'type'>,
): Promise<FileActionOutcome> {
  if (resource.type === 'IMAGE' || resource.type === 'VIDEO') {
    const permission = await requestPermissionsAsync(true);
    if (!permission.granted) return 'cancelled';
    await Asset.create(uri);
    return 'done';
  }
  return shareLocalFile(uri, resource, 'Lưu tệp');
}

/**
 * "Mở bằng ứng dụng khác": mở URL ký (`original`, inline) bằng trình duyệt/ứng
 * dụng xử lý được — đường lui của PDF khi thiếu native module và của DOC/SHEET/SLIDE.
 * URL sống 60 s: mở NGAY sau khi xin, không giữ lại.
 */
export async function openWithExternalApp(resourceId: string): Promise<void> {
  const { url } = await resourcesService.url(resourceId, 'original');
  await Linking.openURL(url);
}
