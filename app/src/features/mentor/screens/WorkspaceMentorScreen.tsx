import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus';
import { ModuleBanner } from '@/shared/ui/banner';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Dialog } from '@/shared/ui/modal';
import { Reveal } from '@/shared/ui/motion';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';
import { showToast } from '@/shared/utils/toast.utils';

import type { MentorManagedPost } from '../api/mentor.types';
import { ConfirmEndDialog } from '../components/ConfirmEndDialog';
import { EngagementRow } from '../components/EngagementRow';
import { ExtendEngagementSheet } from '../components/ExtendEngagementSheet';
import { ManagedPostRow } from '../components/ManagedPostRow';
import { MENTOR_LIMITS } from '../constants/mentor.constants';
import { useEngagementActions } from '../hooks/useEngagementActions';
import { useNow } from '../hooks/useNow';
import { useCloseMentorPost } from '../queries/mentor.mutations';
import { useWorkspaceEngagements, useWorkspaceMentorPosts } from '../queries/mentor.queries';
import { conversationHref, newMentorPostHref, postApplicationsHref } from '../utils/mentor-routes';

/**
 * Quản lý bài tìm cố vấn của nhóm (OWNER/ADMIN — app.md §3): bài (mở/đủ/đóng, số đơn chờ), "Đăng bài" khoá khi đủ 3 bài mở
 * (kèm giải thích), đợt cố vấn đang chạy (gia hạn/kết thúc). 403/404 (không phải OWNER/ADMIN, khách) → ẩn nội dung.
 *
 * Đầu màn là dải phân hệ "Tìm cố vấn" (`support` · `warning`, khớp Trang chủ) nói điều AppBar không nói: đang mở mấy/3 bài, mấy cố vấn
 * đang hoạt động. "Đóng bài" hỏi lại trước khi đóng — bài đã đóng không nhận đơn nữa. Kéo xuống để tải lại cả bài lẫn đợt cố vấn.
 */
export function WorkspaceMentorScreen() {
  const { wsId = '' } = useLocalSearchParams<{ wsId: string }>();
  const posts = useWorkspaceMentorPosts(wsId);
  const engagements = useWorkspaceEngagements(wsId);
  // Đơn mới của người ngoài (số "chờ duyệt") và cố vấn tự kết thúc đều không có sự kiện tới đây — quay lại màn thì tải lại.
  useRefetchOnFocus(posts);
  useRefetchOnFocus(engagements);
  const close = useCloseMentorPost(wsId);
  const actions = useEngagementActions(wsId);
  const now = useNow();
  const [closing, setClosing] = useState<MentorManagedPost | null>(null);
  const openCount = (posts.data ?? []).filter((p) => p.status === 'OPEN' && !p.hidden).length;
  const activeCount = (engagements.data ?? []).length;
  const locked = openCount >= MENTOR_LIMITS.postsOpenPerWorkspace;
  const header = <AppBar title="Tìm cố vấn cho nhóm" onBack={router.back} />;

  if (posts.isLoading) {
    return (
      <Screen header={header}>
        <View className="gap-sm py-xs">
          <Skeleton className="h-24 rounded-md" />
          <Skeleton className="h-20 rounded-md" />
          <Skeleton className="h-20 rounded-md" />
        </View>
      </Screen>
    );
  }
  if (posts.isError) {
    return (
      <Screen header={header}>
        <EmptyState
          description="Chỉ chủ nhóm và quản trị nhóm quản lý được bài tìm cố vấn."
          icon="lock"
          title="Không xem được"
          tone="warning"
        />
      </Screen>
    );
  }

  const confirmClose = () => {
    if (!closing) return;
    close.mutate(closing.id, {
      onSettled: () => setClosing(null),
      onSuccess: () => showToast('success', 'Đã đóng bài tìm cố vấn'),
    });
  };

  return (
    <Screen
      header={header}
      refreshing={posts.isRefetching || engagements.isRefetching}
      onRefresh={() => {
        void posts.refetch();
        void engagements.refetch();
      }}
    >
      <View className="gap-xl py-xs">
        <Reveal>
          <ModuleBanner
            description={`${String(openCount)}/${String(MENTOR_LIMITS.postsOpenPerWorkspace)} bài đang mở · ${String(activeCount)} cố vấn đang hoạt động.`}
            icon="support"
            title="Cố vấn đồng hành cùng nhóm"
            tone="warning"
          />
        </Reveal>
        <View className="gap-xs">
          <Button
            disabled={locked}
            fullWidth
            iconLeft="add"
            label="Đăng bài tìm cố vấn"
            onPress={() => router.push(newMentorPostHref(wsId))}
          />
          {locked ? (
            <Text className="text-caption-lg text-fg-2">
              Nhóm đã có {MENTOR_LIMITS.postsOpenPerWorkspace} bài đang mở — đóng bớt bài để đăng
              bài mới.
            </Text>
          ) : null}
        </View>
        <Reveal index={1}>
          <Section icon="document" title="Bài của nhóm">
            {(posts.data ?? []).length === 0 ? (
              <EmptyState
                description="Đăng bài để cố vấn bên ngoài nhóm ứng tuyển."
                icon="support"
                size="compact"
                title="Nhóm chưa đăng bài tìm cố vấn"
                tone="warning"
              />
            ) : (
              (posts.data ?? []).map((p) => (
                <ManagedPostRow
                  key={p.id}
                  closing={close.isPending && close.variables === p.id}
                  post={p}
                  onClose={setClosing}
                  onOpen={(post) => router.push(postApplicationsHref(wsId, post.id))}
                />
              ))
            )}
          </Section>
        </Reveal>
        <Reveal index={2}>
          <Section icon="user-circle" title="Cố vấn đang hoạt động">
            {activeCount === 0 ? (
              <EmptyState
                description="Cố vấn được nhận vào nhóm sẽ hiện ở đây, kèm hạn còn lại."
                icon="user-circle"
                size="compact"
                title="Chưa có cố vấn nào đang hoạt động"
                tone="neutral"
              />
            ) : (
              (engagements.data ?? []).map((e) => (
                <EngagementRow
                  key={e.id}
                  engagement={e}
                  now={now}
                  perspective="team"
                  onEnd={actions.openEnd}
                  onExtend={actions.openExtend}
                  onOpenChat={(id) => router.push(conversationHref(id))}
                />
              ))
            )}
          </Section>
        </Reveal>
      </View>
      <ExtendEngagementSheet
        busy={actions.extendBusy}
        engagement={actions.extending}
        errorMessage={actions.extendError}
        onClose={actions.closeExtend}
        onSubmit={actions.submitExtend}
      />
      <ConfirmEndDialog
        busy={actions.endBusy}
        perspective="team"
        visible={actions.ending !== null}
        onCancel={actions.closeEnd}
        onConfirm={actions.confirmEnd}
      />
      <Dialog
        description={`"${closing?.title ?? ''}" sẽ không nhận đơn ứng tuyển mới. Đơn đang chờ vẫn xem được.`}
        primaryAction={{ label: 'Đóng bài', loading: close.isPending, onPress: confirmClose }}
        secondaryAction={{ label: 'Giữ bài', onPress: () => setClosing(null) }}
        title="Đóng bài tìm cố vấn?"
        variant="warning"
        visible={closing !== null}
        onClose={() => setClosing(null)}
      />
    </Screen>
  );
}
