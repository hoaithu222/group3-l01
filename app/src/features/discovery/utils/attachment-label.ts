import type { IconName } from '@/shared/ui/icon';

import type { AttachmentsSummary } from '../api/discovery.types';

const KIND_LABEL: Record<string, string> = {
  IMAGE: 'ảnh',
  VIDEO: 'video',
  AUDIO: 'âm thanh',
  VOICE: 'tin nhắn thoại',
  FILE: 'tệp',
};

const KIND_ICON: Record<string, IconName> = {
  IMAGE: 'image',
  VIDEO: 'play',
  AUDIO: 'audio',
  VOICE: 'mic-01',
  FILE: 'file-2',
};

/** "3 ảnh" / "1 tệp" / "2 tệp đính kèm" (nhiều loại) — `null` khi tin không có tệp. */
export function attachmentSummaryLabel(
  summary: AttachmentsSummary | null | undefined,
): string | null {
  if (!summary || summary.count <= 0) return null;
  const only = summary.kinds.length === 1 ? KIND_LABEL[summary.kinds[0] ?? ''] : undefined;
  return only ? `${summary.count} ${only}` : `${summary.count} tệp đính kèm`;
}

export function attachmentSummaryIcon(summary: AttachmentsSummary | null | undefined): IconName {
  const only = summary?.kinds.length === 1 ? KIND_ICON[summary.kinds[0] ?? ''] : undefined;
  return only ?? 'file-2';
}
