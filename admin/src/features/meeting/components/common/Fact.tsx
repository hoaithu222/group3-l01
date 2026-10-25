import { memo } from 'react';

import { CopyableText } from '@/shared/ui';

const DASH = '—';

export interface FactProps {
  label: string;
  value: string;
  /** Dòng phụ nhỏ dưới giá trị (chú thích, múi giờ…). */
  note?: string;
  /** Mã/ID bấm để chép (không có giá trị → `—`). */
  mono?: boolean;
}

/** Một cặp nhãn/giá trị của ngăn kéo chi tiết (cuộc họp, cuộc gọi) — đặt trong `<dl>`. */
const Fact = memo(function Fact({ label, value, note, mono = false }: FactProps) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-body-13 text-fg-3">{label}</dt>
      <dd className="min-w-0 text-body-14 text-fg-1">
        {mono && value ? <CopyableText label={label.toLowerCase()} value={value} /> : value || DASH}
      </dd>
      {note && <dd className="text-caption-12 text-fg-4">{note}</dd>}
    </div>
  );
});

export default Fact;
