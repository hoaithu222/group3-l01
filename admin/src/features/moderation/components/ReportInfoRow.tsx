import { memo } from 'react';
import type { ReactNode } from 'react';

export interface ReportInfoRowProps {
  label: string;
  children: ReactNode;
}

/** Một cặp nhãn/giá trị trong khối "Ngữ cảnh" của trang chi tiết báo cáo. */
const ReportInfoRow = memo(function ReportInfoRow({ label, children }: ReportInfoRowProps) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-caption-12 text-fg-4">{label}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-body-14 text-fg-1">
        {children}
      </div>
    </div>
  );
});

export default ReportInfoRow;
