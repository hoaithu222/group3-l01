/**
 * "Nung" nét vẽ vào ảnh: vẽ ảnh gốc + shape ở KÍCH THƯỚC GỐC rồi xuất File mới.
 *
 * Giữ nguyên tên file để BE dedupe Document theo (Name, RefId, DocumentType) xử lý nhất quán.
 * PNG giữ nguyên PNG (ảnh chụp màn hình cần nét sắc); còn lại xuất JPEG 0.92.
 */
import { drawShapes } from './draw-shapes';
import type { Shape } from './annotation.types';

const JPEG_QUALITY = 0.92;

const outputMime = (sourceType: string) =>
  sourceType === 'image/png' ? 'image/png' : 'image/jpeg';

/** Đổi đuôi tên file cho khớp mime xuất ra — tránh ảnh .png mà nội dung là JPEG. */
const withExtension = (fileName: string, mime: string) => {
  const ext = mime === 'image/png' ? 'png' : 'jpg';
  const dot = fileName.lastIndexOf('.');
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  return `${base}.${ext}`;
};

/** `imageOrientation: 'from-image'` để ảnh chụp điện thoại (EXIF xoay) khớp với lúc hiển thị. */
export const decodeImage = (source: Blob): Promise<ImageBitmap> =>
  createImageBitmap(source, { imageOrientation: 'from-image' });

const toBlob = (canvas: HTMLCanvasElement, mime: string): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Không xuất được ảnh đã chú thích'))),
      mime,
      mime === 'image/jpeg' ? JPEG_QUALITY : undefined,
    );
  });

export interface FlattenOptions {
  source: Blob;
  shapes: Shape[];
  fileName: string;
}

export const flattenAnnotations = async ({
  source,
  shapes,
  fileName,
}: FlattenOptions): Promise<File> => {
  const bitmap = await decodeImage(source);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Trình duyệt không hỗ trợ canvas 2D');

    const mime = outputMime(source.type);
    // JPEG không có alpha — nền trắng để vùng trong suốt không thành đen.
    if (mime === 'image/jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bitmap, 0, 0);
    drawShapes(ctx, shapes); // scale = 1, không vẽ khung chọn

    const blob = await toBlob(canvas, mime);
    return new File([blob], withExtension(fileName, mime), { type: mime });
  } finally {
    bitmap.close?.();
  }
};
