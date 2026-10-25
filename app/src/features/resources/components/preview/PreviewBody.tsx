import type { PreviewKind } from '../../utils/preview-kind';
import { CodePreview } from './CodePreview';
import { ImagePreview } from './ImagePreview';
import { PdfPreview } from './PdfPreview';
import type { PreviewProps } from './preview.types';
import { TextPreview } from './TextPreview';
import { UnsupportedPreview } from './UnsupportedPreview';
import { VideoPreview } from './VideoPreview';

export interface PreviewBodyProps extends PreviewProps {
  kind: PreviewKind;
}

/**
 * Chọn khung xem theo `kind` (app.md p3-01 §3 "Quy tắc preview"). DOC/SHEET/SLIDE
 * ở P0 chưa chuyển Office → PDF nên `unsupported` (+ Mở bằng ứng dụng khác / Tải về);
 * P1 khi `previewStatus === 'READY'` `resolvePreview` trả `pdf` và nhánh này tự dùng `PdfPreview`.
 */
export function PreviewBody({ kind, ...props }: PreviewBodyProps) {
  switch (kind) {
    case 'pdf':
      return <PdfPreview {...props} />;
    case 'image':
      return <ImagePreview {...props} />;
    case 'video':
    case 'audio':
      return <VideoPreview {...props} />;
    case 'code':
      return <CodePreview {...props} />;
    case 'text':
      return <TextPreview {...props} />;
    case 'unsupported':
      return (
        // ✅ Chỉ MỘT CTA: "Tải về" đã là nút chính của thanh dưới (`PreviewActionBar`) — không lặp lại ở đây.
        <UnsupportedPreview
          actions={[{ label: 'Mở bằng ứng dụng khác', onPress: props.onOpenExternal }]}
          reason="unsupported"
        />
      );
  }
}
