import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { mentorEngagementsService } from '../api/mentor-engagements.service';
import { mentorPostsService } from '../api/mentor-posts.service';
import type { MentorApplicationStatus, MentorFeedFilter } from '../api/mentor.types';
import { mentorKeys } from './mentor.keys';

const FEED_STALE_MS = 60_000;

/** Bảng tin (cursor) — `staleTime` 60 s (app.md §4): quay lại màn không tải lại ngay. */
export function useMentorPosts(filter: MentorFeedFilter) {
  return useInfiniteQuery({
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      mentorPostsService.feed(filter, pageParam),
    queryKey: mentorKeys.posts(filter),
    staleTime: FEED_STALE_MS,
  });
}

export function useMentorPost(postId: string) {
  return useQuery({
    enabled: Boolean(postId),
    queryFn: () => mentorPostsService.detail(postId),
    queryKey: mentorKeys.post(postId),
    retry: false,
  });
}

export function useMyApplications() {
  return useInfiniteQuery({
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      mentorPostsService.myApplications(pageParam),
    queryKey: mentorKeys.myApplications(),
  });
}

/** `enabled = false` cho nơi gọi chỉ cần khi có điều kiện (vd banner cố vấn ở hub nhóm — chỉ khi cờ `mentor` bật). */
export function useMyEngagements(enabled = true) {
  return useQuery({
    enabled,
    queryFn: () => mentorEngagementsService.myEngagements(),
    queryKey: mentorKeys.myEngagements(),
  });
}

export function useManagedWorkspaces() {
  return useQuery({
    queryFn: () => mentorEngagementsService.managedWorkspaces(),
    queryKey: mentorKeys.managedWorkspaces(),
  });
}

export function useWorkspaceMentorPosts(wsId: string) {
  return useQuery({
    enabled: Boolean(wsId),
    queryFn: () => mentorPostsService.workspacePosts(wsId),
    queryKey: mentorKeys.wsPosts(wsId),
    retry: false,
  });
}

export function useWorkspaceEngagements(wsId: string) {
  return useQuery({
    enabled: Boolean(wsId),
    queryFn: () => mentorEngagementsService.workspaceEngagements(wsId, 'ACTIVE'),
    queryKey: mentorKeys.wsEngagements(wsId),
    retry: false,
  });
}

export function usePostApplications(postId: string, status: MentorApplicationStatus | undefined) {
  return useInfiniteQuery({
    enabled: Boolean(postId),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      mentorPostsService.postApplications(postId, status, pageParam),
    queryKey: mentorKeys.applications(postId, status),
  });
}

/** Kênh + thành viên cho `AcceptMentorSheet` — chỉ tải khi tấm mở (`enabled`). */
export function useAcceptOptions(wsId: string, enabled: boolean) {
  const channels = useQuery({
    enabled: enabled && Boolean(wsId),
    queryFn: () => mentorEngagementsService.channelOptions(wsId),
    queryKey: mentorKeys.wsChannels(wsId),
  });
  const members = useQuery({
    enabled: enabled && Boolean(wsId),
    queryFn: () => mentorEngagementsService.memberOptions(wsId),
    queryKey: mentorKeys.wsMembers(wsId),
  });
  return { channels, members };
}
