import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { SKILL_CATEGORY_LABELS, SkillProgressBar, formatPoints, formatScore, skillIconName } from '@/shared/career';
import { Alert } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { IconTile } from '@/shared/ui/icon-tile';
import { Reveal } from '@/shared/ui/motion';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';
import { useAuthStore } from '@/shell/store/slices/auth';

import type { SkillCatalogItem } from '../api/career.types';
import { SkillBadgeList } from '../components/SkillBadgeList';
import { useMySkills, useSkill } from '../queries/career.queries';
import { isNotShared } from '../utils/career-errors';
import { criteriaLines, remainingText } from '../utils/skill-text';

function ProgressBlock({ item }: { item: SkillCatalogItem }) {
  const { criteria: c, myProgress: p } = item;
  return (
    <View className="gap-sm">
      <SkillProgressBar caption={`${String(p.tasksDone)}/${String(c.requiredTasksDone)} task`} current={p.tasksDone} target={c.requiredTasksDone} />
      {c.minStoryPoints !== null ? (
        <SkillProgressBar caption={`${formatPoints(p.storyPoints)}/${formatPoints(c.minStoryPoints)} story points`} current={p.storyPoints} target={c.minStoryPoints} />
      ) : null}
      {c.minAvgPeerScore !== null ? (
        <SkillProgressBar caption={`Review TB ${formatScore(p.avgPeerScore)}/${formatScore(c.minAvgPeerScore)}`} current={p.avgPeerScore ?? 0} target={c.minAvgPeerScore} />
      ) : null}
      {c.requireReview ? (
        <SkillProgressBar caption={`${String(p.reviewedTasks)}/${String(c.requiredTasksDone)} task đã qua chấm chéo`} current={p.reviewedTasks} target={c.requiredTasksDone} />
      ) : null}
      <Text className="text-body-md text-fg-1">{remainingText(item) ?? 'Bạn đã đủ tiêu chí.'}</Text>
    </View>
  );
}

/**
 * Chi tiết kỹ năng (app.md p6-06 §3): mô tả, TIÊU CHÍ dạng chữ, nhãn khớp, tiến độ từng tiêu chí (thanh + số), huy hiệu (nếu có) + minh chứng,
 * mẹo gắn nhãn. 404 ⇒ "Kỹ năng không còn" (vận hành đã tắt kỹ năng mà bạn chưa có huy hiệu).
 */
export function SkillDetailScreen() {
  const { skillId = '' } = useLocalSearchParams<{ skillId: string }>();
  const userId = useAuthStore((state) => state.user?.id) ?? '';
  const skill = useSkill(skillId);
  const mine = useMySkills();
  const header = <AppBar title={skill.data?.name ?? 'Kỹ năng'} onBack={router.back} />;

  if (skill.isLoading) {
    return (
      <Screen header={header}>
        <Skeleton className="h-40 rounded-md" />
      </Screen>
    );
  }
  if (!skill.data) {
    const gone = isNotShared(skill.error);
    return (
      <Screen header={header}>
        <EmptyState
          actions={gone ? undefined : [{ label: 'Thử lại', onPress: () => void skill.refetch() }]}
          description={gone ? 'Kỹ năng này không còn trong danh mục.' : 'Không tải được kỹ năng.'}
          icon={gone ? 'lock' : 'alert-warning'}
          title={gone ? 'Kỹ năng không còn' : 'Không tải được kỹ năng'}
          tone={gone ? 'warning' : 'danger'}
        />
      </Screen>
    );
  }

  const item = skill.data;
  const badge = mine.data?.find((b) => b.skill.id === item.id);
  return (
    <Screen header={header} refreshing={skill.isRefetching} onRefresh={() => void skill.refetch()}>
      {/* Khe 24 giữa các khối; ba nhóm có icon ở tiêu đề (tiêu chí · tiến độ · huy hiệu) để mắt quét nhanh trên màn dài. */}
      <View className="gap-xl py-xs">
        <Reveal className="flex-row items-start gap-sm">
          <IconTile
            name={skillIconName(item.icon)}
            size="lg"
            tone={badge && !badge.revoked ? 'success' : 'brand'}
          />
          <View className="flex-1 gap-xs">
            <Badge appearance="soft" className="self-start" label={SKILL_CATEGORY_LABELS[item.category]} variant="neutral" />
            {item.description ? <Text className="text-body-md text-fg-1">{item.description}</Text> : null}
          </View>
        </Reveal>
        <Section icon="checkmark-square" title="Tiêu chí">
          <Card>
            <View className="gap-2xs">
              {criteriaLines(item.name, item.criteria).map((line) => (
                <Text key={line} className="text-body-md text-fg-1">{`• ${line}`}</Text>
              ))}
            </View>
            <Text className="text-caption-lg text-fg-2">{`Nhãn task được tính: ${item.labelMatch.join(', ')}`}</Text>
          </Card>
        </Section>
        <Section icon="chart-1" title="Tiến độ của bạn">
          <Card>
            <ProgressBlock item={item} />
          </Card>
        </Section>
        {badge ? (
          <Section icon="star" title="Huy hiệu">
            <SkillBadgeList badges={[badge]} userId={userId} />
          </Section>
        ) : null}
        {/* Mẹo là thông tin ĐỌC trong trang ⇒ `Alert` (có icon theo tông), không phải một thẻ chữ trơn. */}
        <Alert
          description={`Mẹo: gắn nhãn ${item.name} cho task liên quan và đặt story points — task Done có nhãn khớp mới được tính.`}
          tone="info"
        />
      </View>
    </Screen>
  );
}
