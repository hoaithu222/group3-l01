import { memo, useMemo } from 'react';

import { cn } from '@/shared/utils/style/cn';
import { useCopyToClipboard } from '@/shared/hooks';

// ⛔ Import TƯƠNG ĐỐI trong `shared/ui` — import barrel `@/shared/ui` từ chính
// bên trong nó tạo vòng (kit2-architecture.md).
import Button from '../actions/Button';
import { SystemIcon } from '../icons/Icons';

export interface JsonViewerProps {
  /** Giá trị bất kỳ — object/array/chuỗi JSON đã parse. `undefined` hiện "—". */
  value: unknown;
  /** Số khoảng trắng thụt lề. Mặc định 2. */
  indent?: number;
  /** Chiều cao tối đa (px) trước khi cuộn. Mặc định 320. */
  maxHeight?: number;
  /** Ẩn nút chép. Mặc định hiện. */
  hideCopy?: boolean;
  className?: string;
}

/** Tuần tự hoá an toàn: vòng tham chiếu/BigInt không được làm sập drawer. */
function stringify(value: unknown, indent: number): string {
  if (value === undefined) return '—';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), indent);
  } catch {
    return String(value);
  }
}

/**
 * JsonViewer — khối chỉ đọc hiện JSON dạng chữ đơn cách (mono) + nút chép.
 *
 * Cố ý KHÔNG tô màu cú pháp: dùng cho metadata audit, payload job đã che phía
 * BE — cần đọc chính xác và chép nguyên văn, không cần trang trí. Không render
 * HTML từ dữ liệu (chỉ text node) nên an toàn XSS.
 */
const JsonViewer = memo(function JsonViewer({
  value,
  indent = 2,
  maxHeight = 320,
  hideCopy = false,
  className,
}: JsonViewerProps) {
  const [copied, copyToClipboard] = useCopyToClipboard();
  const text = useMemo(() => stringify(value, indent), [value, indent]);

  return (
    <div className={cn('relative border border-border-1 bg-bg-2', className)}>
      <pre
        className="overflow-auto p-3 font-mono text-caption-12 text-fg-2 whitespace-pre-wrap break-words"
        style={{ maxHeight }}
      >
        {text}
      </pre>
      {!hideCopy && (
        <Button
          className="absolute top-1 right-1"
          size="sm"
          startIcon={
            <SystemIcon name={copied ? 'clipboard-check-outline' : 'copy-outline'} size={14} />
          }
          title={copied ? 'Đã chép' : 'Chép nội dung'}
          variant="ghost"
          onClick={() => void copyToClipboard(text)}
        >
          {copied ? 'Đã chép' : 'Chép'}
        </Button>
      )}
    </div>
  );
});

export default JsonViewer;
