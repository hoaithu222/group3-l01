import { safeExternalUrl } from '@/features/recruiter';

import type { TalentBadge, TalentCard, TalentProfile } from '../types/talent.types';

/**
 * Ánh xạ RÕ RÀNG từng trường của ứng viên (thay vì `...raw`): dù BE hay một fixture lỡ trả thêm `email`/`phone`/`workspaceName`… thì các trường đó KHÔNG bao giờ
 * vào state/DOM của cổng HR (CR-42 phía giao diện; BE cũng không trả — đây là lớp phòng thủ thứ hai, README p6-08 §2 "Trường hiển thị cho HR").
 * `portfolioUrl` chỉ nhận http(s): nó đi thẳng vào `href` của thẻ `<a>`, `javascript:` sẽ chạy mã khi bấm.
 */
export function toTalentCard(raw: TalentCard): TalentCard {
  const portfolio = safeExternalUrl(raw.portfolioUrl);
  return {
    userId: raw.userId,
    displayName: raw.displayName,
    avatarUrl: raw.avatarUrl ?? null,
    headline: raw.headline ?? null,
    preferredRoles: raw.preferredRoles ?? [],
    location: raw.location ?? null,
    skills: (raw.skills ?? []).map((s) => ({
      skillId: s.skillId,
      code: s.code,
      name: s.name,
      icon: s.icon,
    })),
    badgeCount: raw.badgeCount ?? 0,
    ...(typeof raw.contributionPct === 'number' && { contributionPct: raw.contributionPct }),
    ...(typeof raw.contributionPct === 'number' &&
      typeof raw.contributionWorkspaces === 'number' && {
        contributionWorkspaces: raw.contributionWorkspaces,
      }),
    ...(portfolio && { portfolioUrl: portfolio }),
    ...(typeof raw.matchedSkills === 'number' && { matchedSkills: raw.matchedSkills }),
  };
}

const toBadge = (b: TalentBadge): TalentBadge => ({
  skillId: b.skillId,
  code: b.code,
  name: b.name,
  icon: b.icon,
  category: b.category,
  unlockedAt: b.unlockedAt,
  proof: {
    tasksDone: b.proof?.tasksDone ?? 0,
    storyPoints: b.proof?.storyPoints ?? 0,
    avgPeerScore: b.proof?.avgPeerScore ?? null,
  },
});

export function toTalentProfile(raw: TalentProfile): TalentProfile {
  return {
    card: toTalentCard(raw.card),
    badges: (raw.badges ?? []).map(toBadge),
    openOffer: raw.openOffer
      ? { id: raw.openOffer.id, status: raw.openOffer.status, sentAt: raw.openOffer.sentAt }
      : null,
  };
}
