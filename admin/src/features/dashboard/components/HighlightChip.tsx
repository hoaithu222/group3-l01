import { memo } from 'react';
import { Link } from 'react-router-dom';

import { Badge } from '@/shared/ui';
import type { BadgeColor, BoldSystemIconName } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import type { Highlight, HighlightLevel } from '../types/insights.types';

const LEVEL_COLOR: Record<HighlightLevel, BadgeColor> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'error',
};

/** Hình theo MỨC ĐỘ (không theo luật): người đọc quét dải chip bằng mắt, mức độ phải đọc được từ hình + màu trước khi đọc chữ. */
const LEVEL_ICON: Record<HighlightLevel, BoldSystemIconName> = {
  info: 'circle-exclamation-bold',
  success: 'arrow-trend-up-bold',
  warning: 'triangle-exclamation-bold',
  error: 'circle-xmark-bold',
};

export interface HighlightChipProps {
  highlight: Highlight;
}

/**
 * Một câu nhận xét dạng chip màu theo mức độ. Có `href` thì cả chip là liên kết (bấm sang trang xử lý).
 * Chữ `truncate` trong chip `max-w-full`: câu dài trên màn hẹp bị cắt đuôi (đủ chữ ở `title`) thay vì đẩy cả trang tràn ngang.
 */
const HighlightChip = memo(function HighlightChip({ highlight }: HighlightChipProps) {
  const chip = (
    <Badge
      className="max-w-full"
      color={LEVEL_COLOR[highlight.level]}
      size="md"
      startIcon={<SystemIcon name={LEVEL_ICON[highlight.level]} size={14} />}
      title={highlight.text}
      variant="tinted"
    >
      <span className="min-w-0 truncate">{highlight.text}</span>
    </Badge>
  );

  if (!highlight.href) return chip;
  return (
    <Link className="inline-flex max-w-full min-w-0 hover:brightness-110" to={highlight.href}>
      {chip}
    </Link>
  );
});

export default HighlightChip;
