import { WALLET_LIMITS } from '../constants/wallet.constants';
import { formatMoney } from './money';
import { bpsToPercentText } from './percent';
import type { SplitProblem } from './split-preview';

/**
 * Câu tiếng Việt cho từng lỗi chia — MỘT nguồn cho dòng tóm tắt của `SplitEditor` và
 * cho lỗi của form (schema), để hai nơi không bao giờ nói khác nhau về cùng một lỗi.
 * Số thiếu/thừa hiện bằng CHỮ ("Còn thiếu"/"Thừa"), không chỉ màu (`mobile-ux.md`).
 */
export function describeSplitProblem(problem: SplitProblem): string {
  switch (problem.kind) {
    case 'INVALID_AMOUNT':
      return 'Nhập số tiền để bắt đầu chia';
    case 'NO_PARTICIPANTS':
      return 'Chọn ít nhất một người tham gia';
    case 'TOO_MANY':
      return `Tối đa ${WALLET_LIMITS.participantsMax} người mỗi khoản chi`;
    default: {
      const amount =
        problem.unit === 'VND' ? formatMoney(problem.diff) : `${bpsToPercentText(problem.diff)}%`;
      return problem.kind === 'SHORT' ? `Còn thiếu ${amount}` : `Thừa ${amount}`;
    }
  }
}
