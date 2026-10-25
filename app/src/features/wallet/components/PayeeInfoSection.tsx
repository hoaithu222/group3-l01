import type { UseQueryResult } from '@tanstack/react-query';
import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Skeleton } from '@/shared/ui/skeleton';

import type { PaymentInfoView } from '../api';
import { httpStatusOf } from '../utils/wallet-errors';
import { VietQrCard } from './VietQrCard';

export interface PayeeInfoSectionProps {
  amount: number | null;
  payeeName: string;
  query: UseQueryResult<PaymentInfoView>;
}

/**
 * Phần "chuyển khoản" của màn Trả nợ: QR + thông tin, hoặc lý do KHÔNG có.
 * 404 gộp hai ca (người nhận chưa thêm tài khoản · tôi không nợ họ) — BE cố ý không phân biệt để
 * không lộ ai có tài khoản; UI nói ca hay gặp nhất và chỉ lối ra (tiền mặt/khác).
 */
export function PayeeInfoSection({ amount, payeeName, query }: PayeeInfoSectionProps) {
  if (query.isPending) return <Skeleton className="h-72 rounded-md" />;

  if (query.isError) {
    const notFound = httpStatusOf(query.error) === 404;
    return (
      <Alert
        description={
          notFound
            ? `${payeeName} chưa thêm tài khoản nhận tiền. Bạn vẫn có thể ghi nhận trả bằng tiền mặt hoặc hình thức khác.`
            : 'Không tải được thông tin tài khoản. Kiểm tra kết nối rồi thử lại.'
        }
        title={notFound ? 'Người nhận chưa thêm tài khoản' : undefined}
        tone={notFound ? 'info' : 'error'}
      />
    );
  }

  return (
    <View>
      <VietQrCard amount={amount} info={query.data} />
    </View>
  );
}
