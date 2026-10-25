import { memo } from 'react';
import { Link } from 'react-router-dom';

import { Avatar, Badge, Text, Tooltip } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { formatNumber } from '@/shared/utils/format';

import { TALENT_LIMITS } from '../constants/portal.constants';
import type { TalentCard } from '../types/talent.types';

export interface TalentCardItemProps {
  talent: TalentCard;
  /** Mã kỹ năng đang lọc — chip khớp được tô đậm. */
  matchedCodes: readonly string[];
  /** Đường dẫn mở ngăn kéo hồ sơ (giữ bộ lọc hiện tại) — tên là `<Link>` thật (chuột giữa/Ctrl+click mở tab mới). */
  href: string;
  onOpen: (userId: string) => void;
}

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

/**
 * Thẻ ứng viên (admin.md p6-08 §2.4): ảnh, tên hiển thị, tiêu đề, vị trí/khu vực, ≤ 6 chip kỹ năng (khớp bộ lọc tô đậm), số huy hiệu, % đóng góp (CHỈ khi có,
 * kèm "trên N nhóm" — công thức toàn cục dễ hiểu sai nên luôn nói rõ số nhóm) và liên kết portfolio (chỉ http/https, mở tab mới, `noopener`). KHÔNG có email/SĐT/tên nhóm.
 * Cả thẻ bấm được để mở ngăn kéo; lối bàn phím là liên kết tên.
 */
const TalentCardItem = memo(function TalentCardItem({
  talent,
  matchedCodes,
  href,
  onOpen,
}: TalentCardItemProps) {
  const matched = new Set(matchedCodes);
  const extra = talent.badgeCount - Math.min(talent.skills.length, TALENT_LIMITS.cardSkillsShown);

  return (
    <div
      className="flex cursor-pointer flex-col gap-2 border border-border-1 bg-bg-1 p-3 transition-colors hover:bg-bg-2"
      onClick={() => onOpen(talent.userId)}
    >
      <div className="flex items-start gap-3">
        <Avatar name={talent.displayName} size="md" src={talent.avatarUrl ?? undefined} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Link
            className="truncate text-body-14-semibold text-link hover:underline"
            to={href}
            onClick={stop}
          >
            {talent.displayName}
          </Link>
          {talent.headline ? (
            <span className="line-clamp-2 break-words text-body-13 text-fg-2">{talent.headline}</span>
          ) : null}
          <span className="truncate text-caption-12 text-fg-4">
            {[talent.preferredRoles.join(', '), talent.location].filter(Boolean).join(' · ') || '—'}
          </span>
        </div>
        {talent.portfolioUrl ? (
          <Tooltip content="Mở portfolio (tab mới)">
            <a
              aria-label={`Mở portfolio của ${talent.displayName}`}
              className="shrink-0 text-fg-3 hover:text-fg-1"
              href={talent.portfolioUrl}
              rel="noopener noreferrer"
              target="_blank"
              onClick={stop}
            >
              <SystemIcon name="arrow-up-right-from-square-outline" size={16} />
            </a>
          </Tooltip>
        ) : null}
      </div>
      {talent.skills.length > 0 ? (
        <ul aria-label="Kỹ năng đã xác thực" className="flex flex-wrap gap-1">
          {talent.skills.slice(0, TALENT_LIMITS.cardSkillsShown).map((s) => (
            <li key={s.skillId}>
              <Badge
                color={matched.has(s.code) ? 'primary' : 'neutral'}
                size="sm"
                variant={matched.has(s.code) ? 'solid' : 'tinted'}
              >
                {s.name}
              </Badge>
            </li>
          ))}
          {extra > 0 ? (
            <li className="self-center text-caption-12 text-fg-3">+{extra}</li>
          ) : null}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Text size="tiny" skin="muted">
          {formatNumber(talent.badgeCount)} huy hiệu
        </Text>
        {talent.contributionPct !== undefined ? (
          <Text size="tiny" skin="muted">
            Đóng góp {formatNumber(talent.contributionPct, 1)}%
            {talent.contributionWorkspaces !== undefined
              ? ` trên ${talent.contributionWorkspaces} nhóm`
              : ''}
          </Text>
        ) : null}
      </div>
    </div>
  );
});

export default TalentCardItem;
