import { useState } from 'react';
import { View } from 'react-native';

import { ProofOfWorkSheet, SkillBadgeCard, type SkillBadge } from '@/shared/career';

import { useSkillProof } from '../queries/career.queries';

export interface SkillBadgeListProps {
  /** Chủ các huy hiệu (chính tôi hoặc người khác) — minh chứng tải theo người này, server lọc theo người XEM. */
  userId: string;
  badges: SkillBadge[];
}

/**
 * Danh sách thẻ huy hiệu + tấm minh chứng (app.md p6-06 §3): chạm thẻ ⇒ `ProofOfWorkSheet` tải `GET /users/:id/skills/:skillId/proof` —
 * tiêu đề task/tên nhóm do SERVER quyết theo quyền riêng tư (CR-26), app chỉ vẽ ("Task ẩn tiêu đề" khi `title` null).
 */
export function SkillBadgeList({ badges, userId }: SkillBadgeListProps) {
  const [open, setOpen] = useState<SkillBadge | null>(null);
  const proof = useSkillProof(userId, open?.skill.id ?? null);

  return (
    <>
      <View className="gap-sm">
        {badges.map((b) => (
          <SkillBadgeCard key={b.skill.id} badge={b} onPress={setOpen} />
        ))}
      </View>
      <ProofOfWorkSheet
        error={proof.isError}
        loading={proof.isLoading}
        proof={proof.data}
        title={open ? `Minh chứng · ${open.skill.name}` : ''}
        visible={open !== null}
        onClose={() => setOpen(null)}
        onRetry={() => void proof.refetch()}
      />
    </>
  );
}
