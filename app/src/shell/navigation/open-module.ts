import { router } from 'expo-router';

import type { ModuleConfig } from './types';
import { useModuleUsageStore } from './module-usage.store';

/**
 * Mở một phân hệ từ Trang chủ / tấm chọn phân hệ — và ghi lượt mở để thứ hạng hero học theo thói quen.
 *
 * Ghi ở ĐÂY chứ không trong từng màn phân hệ: thứ hạng hero xếp theo lượt mở TỪ LỐI TẮT này; vào phân hệ bằng tab hay
 * deep link không phải là tín hiệu "người này coi lối tắt này là lối vào của mình". Thứ hạng mới chỉ áp ở lần nạp kế
 * tiếp (`module-usage.store`, ảnh chụp đóng băng) nên ghi ở đây không làm ô nào đổi chỗ dưới ngón tay.
 */
export function openModule(module: Pick<ModuleConfig, 'href' | 'id'>): void {
  useModuleUsageStore.getState().record(module.id);
  router.push(module.href);
}
