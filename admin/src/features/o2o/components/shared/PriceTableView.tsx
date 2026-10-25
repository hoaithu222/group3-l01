import { memo } from 'react';

import { Badge } from '@/shared/ui';
import { formatCurrency } from '@/shared/utils/format';

import { CAPABILITY_KEYS, CAPABILITY_LABELS, PRICE_FIELDS } from '../../constants/print.constants';
import type { PrintCapabilities, PrintPriceTable } from '../../types/print.types';
import Fact from './Fact';

export interface PriceTableViewProps {
  priceTable: PrintPriceTable;
  capabilities: PrintCapabilities;
}

/**
 * Bảng giá + năng lực CHỈ ĐỌC — dùng ở ngăn kéo tiệm (vận hành, bên cạnh form sửa) và tab "Bảng giá" của chủ tiệm
 * (P0 chỉ vận hành đổi giá). Đơn vị đồng/trang; năng lực có CHỮ Có/Không (không chỉ màu).
 */
const PriceTableView = memo(function PriceTableView({
  priceTable,
  capabilities,
}: PriceTableViewProps) {
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3">
        {PRICE_FIELDS.map((f) => (
          <Fact key={f.key} label={`${f.label} (mỗi trang)`}>
            <span className="tabular-nums">{formatCurrency(priceTable[f.key])}</span>
          </Fact>
        ))}
        <Fact label="Giảm khi in 2 mặt">
          <span className="tabular-nums">{priceTable.duplexDiscountPct}%</span>
        </Fact>
        <Fact label="Đơn tối thiểu">
          <span className="tabular-nums">{formatCurrency(priceTable.minOrder)}</span>
        </Fact>
      </dl>
      <div className="flex flex-wrap gap-2">
        {CAPABILITY_KEYS.map((k) => (
          <Badge key={k} color={capabilities[k] ? 'success' : 'neutral'} variant="tinted">
            {CAPABILITY_LABELS[k]}: {capabilities[k] ? 'Có' : 'Không'}
          </Badge>
        ))}
      </div>
    </div>
  );
});

export default PriceTableView;
