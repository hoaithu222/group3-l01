import * as FileSystem from 'expo-file-system/legacy';

import { compressImage } from '@/core/media/compress-image';
import { pickAudio, pickImages } from '@/core/media/pick-media';
import type { PickedFile } from '@/core/uploads/upload.types';

import { STUDY_MEDIA_LIMITS } from '../constants/study.constants';
import { checkStudyFile, normalizeAudioMime, toJpegName } from './media-policy';

/** `null` = người dùng huỷ trình chọn; `error` = chọn được nhưng không hợp lệ (câu tiếng Việt để hiện toast). */
export type MediaPickResult = { file: PickedFile } | { error: string } | null;

/** `pickImages`/`pickAudio` không phải lúc nào cũng có `size` (Android trả 0/thiếu) — đo lại từ tệp. */
async function measure(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists ? info.size : 0;
}

/**
 * Chọn MỘT ảnh và chuẩn bị cho scope `STUDY`: nén ra JPEG (cạnh dài ≤ 2048, chất lượng 0.8) rồi kiểm dung lượng ≤ 5 MB.
 *
 * ⚠️ LUÔN nén, kể cả ảnh nhỏ: HEIC (iPhone) và ảnh gốc từ máy ảnh 12 MP+ (5–10 MB) đều trượt luật BE (`scopeRestrict.STUDY`
 * chỉ nhận JPEG/PNG/WebP ≤ 5 MiB), và `compressImage` là chỗ DUY NHẤT đổi HEIC → JPEG (be.md §10). Mất kênh alpha của PNG là
 * đánh đổi chấp nhận được cho ảnh minh hoạ thẻ học.
 */
export async function pickStudyImage(): Promise<MediaPickResult> {
  const [picked] = await pickImages({ allowsMultipleSelection: false, selectionLimit: 1 });
  if (!picked) return null;

  const compressed = await compressImage({
    height: picked.height ?? 0,
    uri: picked.uri,
    width: picked.width ?? 0,
  });
  const size = await measure(compressed.uri);
  const error = checkStudyFile('IMAGE', 'image/jpeg', size);
  if (error) return { error };

  return {
    file: {
      height: compressed.height,
      kind: 'IMAGE',
      mime: 'image/jpeg',
      name: toJpegName(picked.name),
      size,
      uri: compressed.uri,
      width: compressed.width,
    },
  };
}

/** Chọn MỘT tệp âm thanh MP3/M4A ≤ 10 MB; MIME được quy về đúng `audio/mpeg` | `audio/mp4` mà BE nhận. */
export async function pickStudyAudio(): Promise<MediaPickResult> {
  const picked = await pickAudio();
  if (!picked) return null;

  const mime = normalizeAudioMime(picked.mime, picked.name);
  if (!mime) return { error: `Định dạng không hỗ trợ. Chỉ nhận ${STUDY_MEDIA_LIMITS.AUDIO.label}.` };

  const size = picked.size > 0 ? picked.size : await measure(picked.uri);
  const error = checkStudyFile('AUDIO', mime, size);
  if (error) return { error };

  return { file: { ...picked, kind: 'AUDIO', mime, size } };
}
