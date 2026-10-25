import { useBreakpoint } from '@/shared/theme';

import { NoOfferSelected } from '../../components/jobs/NoOfferSelected';
import { OfferInboxScreen } from './OfferInboxScreen';

/**
 * `offers/index`: điện thoại ⇒ hộp thư đầy màn; máy tính bảng ⇒ hộp thư đã nằm cột TRÁI của `OffersSplitLayout`, khung phải chỉ báo "Chưa chọn lời mời".
 * (Cùng khuôn `MessagesHomeScreen`.)
 */
export function OffersHomeScreen() {
  const { isTablet } = useBreakpoint();
  return isTablet ? <NoOfferSelected /> : <OfferInboxScreen />;
}
