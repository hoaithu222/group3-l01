import { memo } from 'react';
import type { ReactNode } from 'react';

export interface AuditInfoRowProps {
  label: string;
  children: ReactNode;
}

/** Hàng "nhãn · giá trị" của drawer — nhãn bề rộng cố định để cột giá trị luôn thẳng hàng. */
const AuditInfoRow = memo(function AuditInfoRow({ label, children }: AuditInfoRowProps) {
  return (
    <div className="flex items-start gap-2 border-b border-divider-1 py-2.5 last:border-b-0">
      <span className="w-32 shrink-0 pt-0.5 text-body-14 text-fg-3">{label}</span>
      <div className="min-w-0 flex-1 break-words text-fg-1">{children}</div>
    </div>
  );
});

export default AuditInfoRow;
