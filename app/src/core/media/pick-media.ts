import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';

import { guessKindFromMime } from '@/core/uploads/mime';
import { isHeicMime, normalizeMime } from '@/core/uploads/mime-normalize';
import type { PickedFile } from '@/core/uploads/upload.types';

import { compressImage } from './compress-image';
import { ensureCameraPermission, ensureMediaLibraryPermission } from './permissions';

/**
 * Dung lượng THẬT của tệp — cả `expo-image-picker` (`fileSize`) lẫn `expo-document-picker` (`size`) đều để `undefined` trên nhiều
 * máy/nguồn (ảnh chụp, tệp từ Drive…). BE bắt `size` là số nguyên DƯƠNG, nên `0` làm `POST /assets` trả `400 VAL_001`.
 */
async function resolveSize(reported: number | null | undefined, uri: string): Promise<number> {
  if (typeof reported === 'number' && reported > 0) return reported;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists ? info.size : 0;
  } catch {
    return 0;
  }
}

/**
 * ⛔ HEIC/HEIF PHẢI thành JPEG NGAY Ở ĐÂY. `expo-image-picker` (`quality: 1` không mã hoá lại) và `expo-document-picker` trả
 * NGUYÊN bản gốc, mà BE không giải mã được HEIC: tệp qua `POST /assets` + `PUT /content` bình thường rồi kẹt `PROCESSING`, app
 * poll 30 s thì báo lỗi (log Railway 2026-09-27: `heif: Decoder plugin generated an error`). Trước đây chỉ màn Study tự gọi
 * `compressImage`, mọi nơi khác (chat, bảng công việc, ví, hồ sơ…) đi thẳng HEIC lên server.
 * Máy không đổi nổi thì trả tệp gốc: đúng hành vi cũ chứ không tệ đi, và một ảnh hỏng không làm mất cả lượt chọn.
 */
async function toServerReadable(file: PickedFile): Promise<PickedFile> {
  if (file.kind !== 'IMAGE' || !isHeicMime(file.mime)) return file;
  try {
    const jpeg = await compressImage({ uri: file.uri, width: file.width ?? 0, height: file.height ?? 0 });
    return {
      ...file,
      uri: jpeg.uri,
      name: `${file.name.replace(/\.[^./]+$/, '')}.jpg`,
      mime: 'image/jpeg',
      size: await resolveSize(undefined, jpeg.uri),
      width: jpeg.width,
      height: jpeg.height,
    };
  } catch {
    return file;
  }
}

/** `expo-image-picker` không trả `mimeType` ổn định trên mọi máy — suy từ `type` khi thiếu. */
async function fromImagePickerAsset(asset: ImagePicker.ImagePickerAsset): Promise<PickedFile> {
  const name = asset.fileName ?? asset.uri.split('/').pop() ?? 'tep';
  const mime = normalizeMime(asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'), name);
  return toServerReadable({
    uri: asset.uri,
    name,
    mime,
    size: await resolveSize(asset.fileSize, asset.uri),
    kind: asset.type === 'video' ? 'VIDEO' : 'IMAGE',
    durationMs: asset.duration ?? undefined,
    width: asset.width || undefined,
    height: asset.height || undefined,
  });
}

/** Thư viện ảnh — nhiều lựa chọn (giới hạn `selectionLimit`, app.md §3 `LIMITS.message.attachmentsMax`). */
export async function pickImages(options?: {
  allowsMultipleSelection?: boolean;
  selectionLimit?: number;
}): Promise<PickedFile[]> {
  const outcome = await ensureMediaLibraryPermission();
  if (outcome !== 'granted') return [];

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: options?.allowsMultipleSelection ?? true,
    selectionLimit: options?.selectionLimit,
    quality: 1,
  });
  if (result.canceled) return [];
  return Promise.all(result.assets.map(fromImagePickerAsset));
}

export async function pickVideo(): Promise<PickedFile | null> {
  const outcome = await ensureMediaLibraryPermission();
  if (outcome !== 'granted') return null;

  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1 });
  if (result.canceled) return null;
  const asset = result.assets[0];
  return asset ? await fromImagePickerAsset(asset) : null;
}

export async function takePhoto(): Promise<PickedFile | null> {
  const outcome = await ensureCameraPermission();
  if (outcome !== 'granted') return null;

  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  if (result.canceled) return null;
  const asset = result.assets[0];
  return asset ? await fromImagePickerAsset(asset) : null;
}

/**
 * Chọn MỘT tệp âm thanh (MP3/M4A — p4-01 âm thanh của mục học). `type` chỉ LỌC ở trình chọn tệp hệ thống; nơi gọi vẫn phải
 * kiểm lại MIME/dung lượng (nhiều máy Android báo `audio/x-m4a`, hoặc `application/octet-stream` khi tệp lấy từ Drive).
 * ⛔ Không sửa `pickDocuments` để nhận tham số: vài nơi truyền THẲNG nó làm callback (`run(pickDocuments)`) nên tham số
 * đầu tiên sẽ là sự kiện bấm.
 */
export async function pickAudio(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a'],
  });
  const asset = result.canceled ? undefined : result.assets?.[0];
  if (!asset) return null;
  return {
    kind: 'AUDIO',
    mime: normalizeMime(asset.mimeType, asset.name),
    name: asset.name,
    size: await resolveSize(asset.size, asset.uri),
    uri: asset.uri,
  };
}

/** `expo-document-picker` không xin quyền riêng — hệ điều hành tự lo (Storage Access Framework/UIDocumentPicker). */
export async function pickDocuments(): Promise<PickedFile[]> {
  const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
  if (result.canceled || !result.assets) return [];

  return Promise.all(
    result.assets.map(async (asset) => {
      // `kind` suy từ MIME ĐÃ chuẩn hoá: tệp chỉ báo `application/octet-stream` nhưng đuôi `.jpg`/`.m4a` phải thành IMAGE/AUDIO.
      const mime = normalizeMime(asset.mimeType, asset.name);
      return toServerReadable({
        uri: asset.uri,
        name: asset.name,
        mime,
        size: await resolveSize(asset.size, asset.uri),
        kind: guessKindFromMime(mime),
      });
    }),
  );
}
