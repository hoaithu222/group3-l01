import { memo } from 'react';
import type { ReactNode } from 'react';

export interface InfoRowProps {
  label: string;
  children: ReactNode;
}

/** Một cặp nhãn/giá trị trong ngăn kéo hồ sơ doanh nghiệp (dùng ở vận hành và cổng HR). */
const InfoRow = memo(function InfoRow({ label, children }: InfoRowProps) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-caption-12 text-fg-4">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-1.5 text-body-14 text-fg-1">
        {children}
      </dd>
    </div>
  );
});

export default InfoRow;
