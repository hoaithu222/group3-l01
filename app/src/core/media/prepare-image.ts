import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { PickedFile } from '@/core/uploads/upload.types';

import { compressImage } from './compress-image';

/**
 * Trần của BE cho ảnh hiển thị (scope `AVATAR`, `mimePolicy`) là 2 MiB — chừa 64 KiB biên vì số đo tệp trên máy và trên
 * server có thể lệch vài byte (metadata do trình mã hoá JPEG thêm vào).
 */
const MAX_BYTES = 2 * 1024 * 1024 - 64 * 1024;

/** Nấc thu nhỏ tiếp theo khi bản nén đầu (cạnh 2048, JPEG 0.8 — `compressImage`) vẫn vượt trần: ảnh nhiều chi tiết. */
const SHRINK_STEPS = [
  { edge: 1600, quality: 0.72 },
  { edge: 1200, quality: 0.65 },
] as const;

interface Rendered {
  uri: string;
  width: number;
  height: number;
  size: number;
}

async function sizeOf(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists ? info.size : 0;
  } catch {
    return 0;
  }
}

async function shrink(from: Rendered, edge: number, quality: number): Promise<Rendered> {
  const longEdge = Math.max(from.width, from.height);
  const context = ImageManipulator.manipulate(from.uri);
  if (longEdge > edge) {
    const scale = edge / longEdge;
    context.resize({ width: Math.round(from.width * scale), height: Math.round(from.height * scale) });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: quality, format: SaveFormat.JPEG });
  return { uri: saved.uri, width: saved.width, height: saved.height, size: await sizeOf(saved.uri) };
}

/**
 * Chuẩn bị ảnh HIỂN THỊ (ảnh đại diện, ảnh bìa nhóm) trước khi tải: LUÔN nén về JPEG (≤ 2048 px, 0.8), còn vượt trần thì
 * thu nhỏ tiếp theo `SHRINK_STEPS`.
 *
 * ⛔ Vì sao phải nén cả ảnh JPEG/PNG (`pickImages` chỉ đổi HEIC): ảnh chụp gốc của điện thoại thường 3–8 MB, vượt trần
 * 2 MiB của BE ⇒ `413 ASSET_002` ngay ở `POST /assets`. Bản nén cạnh 2048 thường 300 KB–1 MB, đủ nét cho ảnh bìa.
 *
 * Nén hỏng (máy thiếu codec, ảnh lạ) hoặc không đo được dung lượng thì trả tệp gốc: BE báo lỗi rõ ràng thay vì mất lượt chọn.
 */
export async function prepareImageForUpload(file: PickedFile): Promise<PickedFile> {
  if (file.kind !== 'IMAGE') return file;
  try {
    const first = await compressImage({ uri: file.uri, width: file.width ?? 0, height: file.height ?? 0 });
    let current: Rendered = { ...first, size: await sizeOf(first.uri) };
    for (const step of SHRINK_STEPS) {
      if (current.size <= MAX_BYTES) break;
      current = await shrink(current, step.edge, step.quality);
    }
    if (current.size <= 0) return file;
    return {
      ...file,
      uri: current.uri,
      name: `${file.name.replace(/\.[^./]+$/, '')}.jpg`,
      mime: 'image/jpeg',
      size: current.size,
      width: current.width,
      height: current.height,
    };
  } catch {
    return file;
  }
}

/** Ảnh chat: dưới ngưỡng này tải nguyên bản (nén còn tốn thời gian hơn phần byte tiết kiệm được). */
const CHAT_SKIP_BYTES = 400 * 1024;
/** Cạnh dài tối đa của ảnh chat — đủ nét trên màn điện thoại (ô chat rộng ≤ ~400 dp) và khi mở toàn màn hình. */
const CHAT_EDGE = 1600;
const CHAT_QUALITY = 0.75;

/**
 * Chuẩn bị ảnh CHAT trước khi tải: thu về cạnh dài ≤ 1600 px, JPEG 0.75 (ảnh chụp 4–12 MB thường còn 200–600 KB ⇒ tải nhanh gấp 5–20
 * lần trên 4G, và BE xử lý ở "đường nhanh" nên khỏi phải poll `PROCESSING`). Giữ nguyên: không phải ảnh, GIF (mất hoạt hoạ), ảnh
 * đã nhỏ; và mọi trường hợp nén hỏng hoặc kết quả không nhỏ hơn bản gốc ⇒ trả tệp gốc, không bao giờ làm mất lượt chọn.
 */
export async function prepareChatImage(file: PickedFile): Promise<PickedFile> {
  if (file.kind !== 'IMAGE' || file.mime === 'image/gif' || (file.size > 0 && file.size <= CHAT_SKIP_BYTES)) return file;
  try {
    const out = await shrink(
      { uri: file.uri, width: file.width ?? 0, height: file.height ?? 0, size: file.size },
      CHAT_EDGE,
      CHAT_QUALITY,
    );
    if (out.size <= 0 || (file.size > 0 && out.size >= file.size)) return file;
    return {
      ...file,
      uri: out.uri,
      name: `${file.name.replace(/\.[^./]+$/, '')}.jpg`,
      mime: 'image/jpeg',
      size: out.size,
      width: out.width,
      height: out.height,
    };
  } catch {
    return file;
  }
}
