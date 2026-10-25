import { isErrorHandled, toErrorMessage } from '@/core/api/client.helpers';
import { showToast } from '@/shared/utils/toast.utils';

import type { WalletExportKind } from '../api';
import { useExportWalletCsv } from '../queries/settlement.mutations';
import { shareCsvFile } from '../utils/share-csv';

/**
 * "Xuất CSV": tải trực tiếp (không còn job + thông báo `wallet.export-ready` — BE đổi
 * sang `GET …/wallet/export?kind=`), ghi tệp tạm rồi mở bảng chia sẻ. Tối đa 5000 dòng.
 */
export function useWalletCsvExport(wsId: string) {
  const exporter = useExportWalletCsv(wsId);

  const run = async (kind: WalletExportKind): Promise<void> => {
    try {
      const outcome = await shareCsvFile(await exporter.mutateAsync(kind));
      if (outcome === 'unavailable') showToast('warning', 'Thiết bị này chưa hỗ trợ chia sẻ tệp.');
    } catch (error) {
      // Lỗi axios đã được interceptor toast; chỉ lỗi ghi tệp/chia sẻ mới cần toast thêm.
      if (!isErrorHandled(error)) showToast('error', toErrorMessage(error));
    }
  };

  return { run, isPending: exporter.isPending };
}
