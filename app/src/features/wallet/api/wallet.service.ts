import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { walletExportPath, walletPath, walletRemindPath, walletSummaryPath } from './wallet.api';
import { parseView } from './parse-view';
import type {
  UpdateWalletSettingsPayload,
  WalletSettingsView,
  WalletSummaryView,
} from './wallet.types';
import { walletSettingsViewSchema, walletSummaryViewSchema } from '../schemas/wallet.schemas';
import { remindResultSchema } from '../schemas/wallet-payments.schemas';

export type WalletExportKind = 'expenses' | 'settlements';

export interface WalletCsvFile {
  fileName: string;
  /** Đã đảm bảo có BOM đầu chuỗi — Excel đọc UTF-8 tiếng Việt đúng dấu. */
  text: string;
}

const BOM = '\uFEFF';
const FILENAME_RE = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i;

/** Ví nhóm: cài đặt · số dư · nhắc nợ · xuất CSV. Khoản chi/settlement/hồ sơ nhận tiền ở file riêng. */
export const walletService = {
  async getSettings(workspaceId: string): Promise<WalletSettingsView> {
    const response = await apiClient.get(walletPath(workspaceId));
    return parseView(walletSettingsViewSchema, unwrapData(response), 'cài đặt ví');
  },

  async updateSettings(
    workspaceId: string,
    payload: UpdateWalletSettingsPayload,
  ): Promise<WalletSettingsView> {
    const response = await apiClient.put(walletPath(workspaceId), payload, {
      skipErrorToast: true,
    });
    return parseView(walletSettingsViewSchema, unwrapData(response), 'cài đặt ví');
  },

  async summary(workspaceId: string): Promise<WalletSummaryView> {
    const response = await apiClient.get(walletSummaryPath(workspaceId));
    return parseView(walletSummaryViewSchema, unwrapData(response), 'số dư ví');
  },

  /** `WALLET_010` (429) khi nhắc quá dày — `details.retryAfter` (giây) do nơi gọi đọc. */
  async remindNow(workspaceId: string): Promise<{ remindedCount: number }> {
    const response = await apiClient.post(walletRemindPath(workspaceId), undefined, {
      skipErrorToast: true,
    });
    return parseView(remindResultSchema, unwrapData(response), 'kết quả nhắc nợ');
  },

  /**
   * `GET …/wallet/export?kind=` — `text/csv` (UTF-8 BOM) kèm `Content-Disposition`,
   * ⛔ KHÔNG phải phong bì JSON. Đi qua `apiClient` (không `fetch` trần) để được
   * gắn Bearer + làm mới token khi 401 + toast lỗi như mọi request khác.
   *
   * ⚠️ `responseType: 'text'` bắt buộc: mặc định axios thử `JSON.parse` thân
   * chuỗi. Và XHR của React Native có thể ĐÃ cắt BOM lúc giải mã, nên bù lại ở
   * đây thay vì tin rằng nó còn nguyên.
   */
  async exportCsv(workspaceId: string, kind: WalletExportKind): Promise<WalletCsvFile> {
    const response = await apiClient.get<string>(walletExportPath(workspaceId), {
      params: { kind },
      responseType: 'text',
    });
    const disposition = String(response.headers?.['content-disposition'] ?? '');
    const fileName = FILENAME_RE.exec(disposition)?.[1]?.trim() || `wallet-${kind}.csv`;
    const text = String(response.data ?? '');
    return { fileName, text: text.startsWith(BOM) ? text : `${BOM}${text}` };
  },
};
