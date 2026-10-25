/**
 * CopyableText — mã / ID dạng chữ mono, bấm để chép TOÀN BỘ giá trị vào clipboard (kit2).
 *
 * Gộp hai bản viết tay đã trôi khỏi nhau (`ConversationCodeCell` của workspace và `CopyableId` của cấu hình
 * hệ thống): cùng hình dạng, cùng hook `useCopyToClipboard`, nhưng không bản nào báo cho trình đọc màn hình
 * rằng "đã chép" — người dùng không nhìn thấy đổi icon thì không biết lệnh có chạy.
 *
 * ── Trợ năng ────────────────────────────────────────────────────────────────
 *  - Tên nút = chữ đang hiện (`display ?? value`) — đúng thứ người dùng thấy và đọc ra; hành động "chép"
 *    nằm ở `title` (gợi ý khi rê chuột, và là mô tả của nút với trình đọc màn hình).
 *  - Sau khi chép: một vùng `aria-live="polite"` LUÔN có mặt trong DOM (vùng live chỉ đọc được thay đổi của
 *    nội dung, KHÔNG đọc được vùng mới mount) đổi từ rỗng sang "Đã chép <label>" rồi tự tắt sau 2 giây (nhịp
 *    của `useCopyToClipboard`). Chép thất bại (không có quyền clipboard) thì KHÔNG thông báo gì — không nói
 *    dối là đã chép.
 *
 * ── Hình dạng ───────────────────────────────────────────────────────────────
 * Chữ cắt 1 dòng (`truncate`) nên `jobId` dài (`mail.send:tpl:hash`) không phá bề rộng cột; giá trị đầy đủ
 * nằm ở `title`. Muốn hiện bản rút gọn (id 24 ký tự → `#a1b2c3`) thì truyền `display`, cái được chép vẫn là
 * `value`. Bấm chép KHÔNG nổi bọt lên phần tử chứa nó (vd `Table onRowClick`).
 *
 * `font-mono` đúng luật: đây là mã/ID chứ không phải số liệu (`visual-hierarchy.md §3.3.1`).
 */
import { memo, useCallback } from 'react';

import { useCopyToClipboard } from '@/shared/hooks';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { cn } from '@/shared/utils/style/cn';

import Button from './Button';

export interface CopyableTextProps {
  /** Giá trị ĐẦY ĐỦ sẽ được chép. */
  value: string;
  /** Tên gọi của giá trị ("Job ID", "mã hội thoại"…) — đi vào gợi ý và thông báo "Đã chép …". */
  label: string;
  /** Chữ hiện ra. Mặc định chính `value`; đặt khi muốn hiện bản rút gọn của một id dài. */
  display?: string;
  className?: string;
}

const CopyableText = memo(function CopyableText({
  value,
  label,
  display,
  className,
}: CopyableTextProps) {
  const [copied, copyToClipboard] = useCopyToClipboard();

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      // Chép xong là xong việc — không được kéo theo hành động của hàng/thẻ chứa nút này.
      e.stopPropagation();
      void copyToClipboard(value);
    },
    [copyToClipboard, value],
  );

  return (
    <span className={cn('inline-flex max-w-full min-w-0', className)}>
      <Button
        className="max-w-full justify-start"
        size="sm"
        startIcon={
          <SystemIcon name={copied ? 'clipboard-check-outline' : 'copy-outline'} size={14} />
        }
        title={copied ? `Đã chép ${label}` : `${value} — bấm để chép ${label}`}
        variant="ghost"
        onClick={handleClick}
      >
        <span className="truncate font-mono text-caption-12">{display ?? value}</span>
      </Button>
      <span aria-atomic="true" aria-live="polite" className="sr-only">
        {copied ? `Đã chép ${label}` : ''}
      </span>
    </span>
  );
});

CopyableText.displayName = 'CopyableText';

export default CopyableText;
