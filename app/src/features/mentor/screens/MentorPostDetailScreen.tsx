import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import { ApplySheet } from '../components/ApplySheet';
import { PostDetailBody } from '../components/PostDetailBody';
import { ReportPostSheet } from '../components/ReportPostSheet';
import { useWithdrawApplication } from '../queries/mentor.mutations';
import { useMentorPost } from '../queries/mentor.queries';
import { isNotAvailable, mentorErrorMessage } from '../utils/mentor-errors';
import { mentorBoardHref, postApplicationsHref } from '../utils/mentor-routes';

/**
 * Chi tiết bài + ứng tuyển (app.md §3). Nút theo `myActions` do SERVER tính (client không tự suy vai trò): "Ứng tuyển"
 * (`apply`), "Rút đơn" (`withdraw`), "Xem đơn" (`manage`), "Báo cáo" (`report`). 404 → "Bài không còn khả dụng".
 */
export function MentorPostDetailScreen() {
  const { postId = '' } = useLocalSearchParams<{ postId: string }>();
  const query = useMentorPost(postId);
  const withdraw = useWithdrawApplication(postId);
  const [applying, setApplying] = useState(false);
  const [reporting, setReporting] = useState(false);
  const post = query.data;
  const actions = post?.myActions;

  const header = (
    <AppBar
      actions={
        actions?.report ? (
          <Button
            accessibilityLabel="Báo cáo bài"
            iconLeft="alert-warning"
            iconOnly
            size="sm"
            variant="neutral-tertiary"
            onPress={() => setReporting(true)}
          />
        ) : undefined
      }
      title="Bài tìm cố vấn"
      onBack={router.canGoBack() ? router.back : () => router.replace(mentorBoardHref())}
    />
  );

  if (query.isLoading) {
    return (
      <Screen header={header}>
        <View className="gap-sm py-xs">
          <Skeleton className="h-16 rounded-md" />
          <Skeleton className="h-40 rounded-md" />
        </View>
      </Screen>
    );
  }
  if (!post) {
    const gone = isNotAvailable(query.error);
    return (
      <Screen header={header}>
        <EmptyState
          actions={
            gone
              ? [{ label: 'Về bảng tin', onPress: () => router.replace(mentorBoardHref()) }]
              : [{ label: 'Thử lại', onPress: () => void query.refetch() }]
          }
          description={
            gone ? 'Bài đã đóng, bị ẩn hoặc không còn tồn tại.' : mentorErrorMessage(query.error)
          }
          icon={gone ? 'lock' : 'alert-warning'}
          title={gone ? 'Bài không còn khả dụng' : 'Không tải được bài'}
          tone={gone ? 'warning' : 'danger'}
        />
      </Screen>
    );
  }

  const footer =
    actions?.apply || actions?.withdraw || actions?.manage ? (
      <BottomActionBar>
        {actions.apply ? (
          <Button fullWidth iconLeft="user-add" label="Ứng tuyển" onPress={() => setApplying(true)} />
        ) : null}
        {actions.withdraw && post.myApplication ? (
          <Button
            fullWidth
            iconLeft="cancel"
            label="Rút đơn"
            loading={withdraw.isPending}
            variant="secondary"
            onPress={() =>
              withdraw.mutate(post.myApplication?.id ?? '', {
                onSuccess: () => {
                  hapticSuccess();
                  showToast('success', 'Đã rút đơn');
                },
              })
            }
          />
        ) : null}
        {actions.manage ? (
          <Button
            fullWidth
            iconLeft="document"
            label="Xem đơn ứng tuyển"
            variant="secondary"
            onPress={() => router.push(postApplicationsHref(post.workspace.id, post.id))}
          />
        ) : null}
      </BottomActionBar>
    ) : undefined;

  return (
    <Screen footer={footer} header={header}>
      <PostDetailBody post={post} />
      <ApplySheet postId={post.id} visible={applying} onClose={() => setApplying(false)} />
      <ReportPostSheet postId={post.id} visible={reporting} onClose={() => setReporting(false)} />
    </Screen>
  );
}
