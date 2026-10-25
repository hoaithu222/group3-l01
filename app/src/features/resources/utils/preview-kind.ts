import type { ResourceDto, ResourceUrlVariant } from '../api';

export type PreviewKind = 'audio' | 'code' | 'image' | 'pdf' | 'text' | 'unsupported' | 'video';

export interface PreviewPlan {
  kind: PreviewKind;
  /** Biến thể URL ký cần xin — `original` cho loại xem thẳng được, `preview` cho bản PDF đã chuyển (P1). */
  variant: ResourceUrlVariant;
}

/**
 * Cách xem một tệp (app.md p3-01 §3 "Quy tắc preview").
 *
 * DOC/SHEET/SLIDE (Office): P0 chưa chuyển Office → PDF (`previewStatus: 'NONE'`), nên "Chưa
 * xem trước được" + "Mở bằng ứng dụng khác"; sang P1 khi `previewStatus === 'READY'` thì dùng
 * `PdfPreview` với biến thể `preview` — nhánh đã sẵn, không cần sửa màn. NGOẠI LỆ: CSV
 * (SHEET + `NATIVE`) xem thẳng dạng văn bản.
 *
 * ⚠️ Dùng `original` (không phải `preview`) cho loại xem thẳng được: `preview`
 * chỉ có nghĩa với bản đã chuyển đổi, và BE trả `RSC_005` nếu tệp chưa có nó.
 */
export function resolvePreview(resource: Pick<ResourceDto, 'previewStatus' | 'type'>): PreviewPlan {
  switch (resource.type) {
    case 'PDF':
      return { kind: 'pdf', variant: 'original' };
    case 'IMAGE':
      return { kind: 'image', variant: 'original' };
    case 'VIDEO':
      return { kind: 'video', variant: 'original' };
    case 'AUDIO':
      return { kind: 'audio', variant: 'original' };
    case 'CODE':
      return { kind: 'code', variant: 'original' };
    case 'TEXT':
      return { kind: 'text', variant: 'original' };
    case 'SHEET':
      // BE xếp CSV (`text/csv`) là SHEET nhưng `previewStatus: 'NATIVE'` — xem thẳng như văn bản;
      // XLSX là SHEET `NONE` (chờ chuyển PDF ở P1) nên đi tiếp như Office.
      if (resource.previewStatus === 'NATIVE') return { kind: 'text', variant: 'original' };
      return resource.previewStatus === 'READY'
        ? { kind: 'pdf', variant: 'preview' }
        : { kind: 'unsupported', variant: 'original' };
    case 'DOC':
    case 'SLIDE':
      return resource.previewStatus === 'READY'
        ? { kind: 'pdf', variant: 'preview' }
        : { kind: 'unsupported', variant: 'original' };
    default:
      return { kind: 'unsupported', variant: 'original' };
  }
}
