import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Cạnh dài ≤ 2048, JPEG 0.8 — app.md §2. */
const MAX_EDGE = 2048;
const JPEG_QUALITY = 0.8;

export interface CompressImageInput {
  uri: string;
  width: number;
  height: number;
}

export interface CompressImageResult {
  uri: string;
  width: number;
  height: number;
}

/**
 * Nén ảnh trước khi upload.
 *
 * Luôn xuất JPEG — kể cả nguồn HEIC (iPhone): be.md §10 "HEIC chuyển JPEG ở
 * client để server không phải hỗ trợ". Vì vậy hàm này CHẠY LUÔN dù ảnh đã nhỏ
 * hơn `MAX_EDGE` (bỏ bước `resize`, giữ bước `saveAsync` để đổi định dạng).
 */
export async function compressImage({
  uri,
  width,
  height,
}: CompressImageInput): Promise<CompressImageResult> {
  const longEdge = Math.max(width, height);
  const scale = longEdge > MAX_EDGE ? MAX_EDGE / longEdge : 1;

  const context = ImageManipulator.manipulate(uri);
  if (scale < 1) {
    context.resize({ width: Math.round(width * scale), height: Math.round(height * scale) });
  }

  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });

  return { uri: saved.uri, width: saved.width, height: saved.height };
}
