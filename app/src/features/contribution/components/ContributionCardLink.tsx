import { router } from 'expo-router';
import { View } from 'react-native';

import { LinkButton } from '@/shared/ui/button';
import { useFeature } from '@/shell/capabilities';

import { contributionHref } from '../utils/contribution-routes';

export interface ContributionCardLinkProps {
  boardId: string;
  wsId: string;
}

/**
 * Lối vào "Báo cáo đóng góp" dưới thẻ bảng trong danh sách bảng (app.md §1). Nằm NGOÀI thẻ (không lồng nút vào thẻ bấm được — TalkBack sẽ không với tới) và hiện qua khe
 * `@/shared/board-extensions`. Cờ phân hệ `project` tắt thì ẩn.
 */
export function ContributionCardLink({ boardId, wsId }: ContributionCardLinkProps) {
  const enabled = useFeature('project');
  if (enabled === false) return null;

  return (
    <View className="items-start px-xs">
      <LinkButton
        iconLeft="chart-1"
        label="Báo cáo đóng góp"
        size="sm"
        onPress={() => router.push(contributionHref(wsId, boardId))}
      />
    </View>
  );
}
