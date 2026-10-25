import { Text } from 'react-native';

import { describeAccessSources } from '../utils/access-source';

export interface AccessSourceNoteProps {
  className?: string;
  /** `effectiveSources` của BE (`'DIRECT'`, `'ROLE:ADMIN'`, …) — hoặc `['ROLE:' + roleRef]` cho dòng grant cũ. */
  sources: readonly string[];
}

/**
 * Dòng chú thích "Được cấp qua vai trò Quản trị viên" (app.md p3-04 §2) — cho người quản
 * lý kênh hiểu VÌ SAO một người đọc được kênh mà không có tên trong danh sách cấp trực tiếp.
 * Chữ thuần (không icon/màu): đây là thông tin, không phải cảnh báo.
 */
export function AccessSourceNote({ className, sources }: AccessSourceNoteProps) {
  const text = describeAccessSources(sources);
  if (!text) return null;
  return <Text className={className ?? 'text-caption-sm text-fg-2'}>{text}</Text>;
}
