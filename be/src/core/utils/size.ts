/**
 * Parse chuỗi kích thước dạng "25mb"/"512kb"/"100b" thành số byte.
 * Không khớp định dạng → mặc định 10MB (an toàn, không throw ở đường validate file).
 */
export function parseSize(size: string): number {
  const match = size.match(/^(\d+)(b|kb|mb|gb)$/i);
  if (!match) return 10 * 1024 * 1024; // default 10MB
  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };
  return num * (multipliers[unit] || 1);
}
