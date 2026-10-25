import { ICON_NAMES, type IconName } from '@/shared/ui/icon';

import banksData from '../data/vn-banks.json';

/**
 * Bảng ngân hàng VN tĩnh (`data/vn-banks.json`). ⚠️ BIN CHƯA đối chiếu với NAPAS
 * chính thức — xem ghi chú đầu file JSON. Tên hiển thị ƯU TIÊN tên BE trả
 * (`bankName`), bảng này chỉ là đường lui và nguồn cho bộ chọn.
 */
export interface VnBank {
  bin: string;
  code: string;
  shortName: string;
  logo: string;
}

export const VN_BANKS: readonly VnBank[] = banksData.banks;

const BY_BIN = new Map(VN_BANKS.map((bank) => [bank.bin, bank]));
const ICON_SET: ReadonlySet<string> = new Set(ICON_NAMES);

export function findBankByBin(bin: string): VnBank | undefined {
  return BY_BIN.get(bin);
}

/** `undefined` khi chưa có logo trong `assets/icons/bank` — nơi gọi rơi về icon chung `bank`. */
export function bankLogoIcon(bin: string): IconName | undefined {
  const logo = BY_BIN.get(bin)?.logo;
  const name = logo ? `bank/${logo}` : '';
  return ICON_SET.has(name) ? (name as IconName) : undefined;
}

export function bankDisplayName(bin: string, serverName?: string | null): string {
  return serverName?.trim() || BY_BIN.get(bin)?.shortName || `Ngân hàng ${bin}`;
}
