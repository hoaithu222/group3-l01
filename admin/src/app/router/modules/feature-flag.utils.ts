import type { Capabilities } from '@/core/capabilities';

/** Một tên cờ, hoặc mảng tên cờ (`ModuleConfig.featureFlag`). */
export type FeatureFlagSpec = string | readonly string[];

/**
 * Đặc tả cờ đang BẬT không? Mảng ⇒ bật khi BẤT KỲ cờ nào bật (OR) — phân hệ dùng chung cho hai tính năng độc lập (vd `integration` có tab
 * Tích hợp theo cờ `integration` và tab Soạn thảo cộng tác theo cờ `collab`) vẫn phải vào được khi chỉ một trong hai bật. Mảng rỗng coi như
 * không có ràng buộc (bật).
 */
export function isFeatureFlagEnabled(
  features: Capabilities['features'],
  flag: FeatureFlagSpec,
): boolean {
  const flags = typeof flag === 'string' ? [flag] : flag;
  return flags.length === 0 || flags.some((name) => Boolean(features[name]?.enabled));
}
