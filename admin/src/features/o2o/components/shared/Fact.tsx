import type { ReactNode } from 'react';

export interface FactProps {
  label: string;
  children: ReactNode;
  /** Chiếm cả hai cột của lưới `<dl>` (giá trị dài: địa chỉ, lý do). */
  wide?: boolean;
}

/** Một cặp nhãn – giá trị trong lưới `<dl className="grid grid-cols-2">` của ngăn kéo chi tiết. */
export default function Fact({ label, children, wide }: FactProps) {
  return (
    <div className={wide ? 'col-span-2 min-w-0' : 'min-w-0'}>
      <dt className="text-caption-12 text-fg-4">{label}</dt>
      <dd className="break-words text-body-14 text-fg-1">{children}</dd>
    </div>
  );
}
