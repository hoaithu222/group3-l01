import { memo } from 'react';
import { Link } from 'react-router-dom';

import { useNavHref } from '@/shared/hooks';
import { Callout } from '@/shared/ui';

import { ECONOMY_SECTION_PARAM } from '../constants/economy.constants';
import type { ReconcileReport } from '../types/economy.types';
import { formatDateTime, shortId } from '../utils/economy-format.utils';

/** Tối đa bấy nhiêu ví lệch hiện thành liên kết (BE trả tối đa 20 id mẫu). */
const MAX_LINKS = 5;

export interface EconomyReconcileNoticeProps {
  /** `null` = chưa chạy lần nào / báo cáo đã hết hạn (giữ 3 ngày). */
  report: ReconcileReport | null;
}

/**
 * Kết quả đối soát số dư ví với tổng sổ cái (job 02:30, CHỈ cảnh báo — không tự sửa). `mismatched > 0` → cảnh báo kèm liên kết mở sổ cái của vài ví lệch
 * (sang nhóm "Ví người dùng"); `null` → nói thẳng là chưa có báo cáo, không giả vờ "không có lệch".
 */
const EconomyReconcileNotice = memo(function EconomyReconcileNotice({
  report,
}: EconomyReconcileNoticeProps) {
  const buildHref = useNavHref();

  if (!report) {
    return (
      <Callout
        description="Job đối soát chạy lúc 02:30 mỗi đêm; báo cáo được giữ 3 ngày. Chưa có báo cáo nào còn hiệu lực."
        icon="clock-bold"
        intent="neutral"
        variant="ghost"
      />
    );
  }

  const when = formatDateTime(report.at);
  if (report.mismatched === 0) {
    return (
      <Callout
        description={`Đối soát lúc ${when}: ${report.checked} ví đều khớp tổng sổ cái.`}
        intent="success"
        variant="ghost"
      />
    );
  }

  return (
    <Callout
      description={
        <span className="flex flex-col gap-1">
          <span>
            Đối soát lúc {when}: {report.mismatched}/{report.checked} ví có số dư khác tổng sổ cái.
            Hệ thống KHÔNG tự sửa — hãy kiểm tra sổ cái từng ví.
          </span>
          {report.sampleUserIds.length > 0 && (
            <span className="flex flex-wrap gap-x-3 gap-y-1">
              {report.sampleUserIds.slice(0, MAX_LINKS).map((id) => (
                <Link
                  key={id}
                  className="text-link hover:underline"
                  to={buildHref({
                    [ECONOMY_SECTION_PARAM]: 'wallet',
                    userId: id,
                    search: null,
                    page: null,
                  })}
                >
                  Ví {shortId(id)}
                </Link>
              ))}
            </span>
          )}
        </span>
      }
      intent="warning"
      title="Đối soát phát hiện ví lệch sổ cái"
    />
  );
});

export default EconomyReconcileNotice;
