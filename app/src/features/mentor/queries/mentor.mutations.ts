import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { mentorEngagementsService } from '../api/mentor-engagements.service';
import { mentorPostsService } from '../api/mentor-posts.service';
import type {
  AcceptPayload,
  ApplyPayload,
  CreateMentorPostPayload,
  MentorReportReason,
} from '../api/mentor.types';
import { mentorKeys } from './mentor.keys';

/**
 * Danh bạ thành viên nhóm (`features/members`, khoá `['members', wsId, …]`) — KHÔNG import feature khác (`check:imports`),
 * nên làm mới bằng TIỀN TỐ khoá chữ. Đổi khoá ở `members.keys.ts` thì đổi ở đây.
 */
const membersPrefix = (wsId: string) => ['members', wsId] as const;

function refreshWorkspace(qc: QueryClient, wsId: string): void {
  void qc.invalidateQueries({ queryKey: mentorKeys.ws(wsId) });
  void qc.invalidateQueries({ queryKey: membersPrefix(wsId) });
}

export function useApplyToPost(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { idempotencyKey: string; payload: ApplyPayload }) =>
      mentorPostsService.apply(postId, vars.payload, vars.idempotencyKey),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: mentorKeys.post(postId) });
      void qc.invalidateQueries({ queryKey: mentorKeys.myApplications() });
      void qc.invalidateQueries({ queryKey: ['mentor', 'posts'] });
    },
  });
}

export function useWithdrawApplication(postId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (applicationId: string) => mentorPostsService.withdraw(applicationId),
    onSuccess: () => {
      if (postId) void qc.invalidateQueries({ queryKey: mentorKeys.post(postId) });
      void qc.invalidateQueries({ queryKey: mentorKeys.myApplications() });
      // Thẻ bài ở bảng tin (nằm dưới màn chi tiết, vẫn mounted) hiện nhãn "đã ứng tuyển" — phải về trạng thái mới.
      void qc.invalidateQueries({ queryKey: ['mentor', 'posts'] });
    },
  });
}

export function useCreateMentorPost(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { idempotencyKey: string; payload: CreateMentorPostPayload }) =>
      mentorPostsService.create(wsId, vars.payload, vars.idempotencyKey),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: mentorKeys.wsPosts(wsId) });
      void qc.invalidateQueries({ queryKey: ['mentor', 'posts'] });
    },
  });
}

export function useCloseMentorPost(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => mentorPostsService.close(postId),
    onSuccess: (post) => {
      void qc.invalidateQueries({ queryKey: mentorKeys.wsPosts(wsId) });
      void qc.invalidateQueries({ queryKey: mentorKeys.post(post.id) });
      // Bài đã đóng không còn ở bảng tin Mentor (tab khác, vẫn mounted).
      void qc.invalidateQueries({ queryKey: ['mentor', 'posts'] });
    },
  });
}

export function useReportMentorPost(postId: string) {
  return useMutation({
    mutationFn: (vars: { description?: string; reason: MentorReportReason }) =>
      mentorPostsService.report(postId, vars.reason, vars.description),
  });
}

/** Chấp nhận: thành công hay 409 đều làm mới bài + đơn (bản mới nhất có `version` mới — IR-22). */
export function useAcceptApplication(wsId: string, postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { applicationId: string; idempotencyKey: string; payload: AcceptPayload }) =>
      mentorPostsService.accept(vars.applicationId, vars.payload, vars.idempotencyKey),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: mentorKeys.applicationsOf(postId) });
      void qc.invalidateQueries({ queryKey: mentorKeys.post(postId) });
      // "Còn cần N cố vấn" trên thẻ bảng tin đổi theo số cố vấn đang hoạt động.
      void qc.invalidateQueries({ queryKey: ['mentor', 'posts'] });
      refreshWorkspace(qc, wsId);
    },
  });
}

export function useRejectApplication(wsId: string, postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { applicationId: string; reason?: string }) =>
      mentorPostsService.reject(vars.applicationId, vars.reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: mentorKeys.applicationsOf(postId) });
      void qc.invalidateQueries({ queryKey: mentorKeys.wsPosts(wsId) });
    },
  });
}

export function useExtendEngagement(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { addDays: number; engagementId: string; expectedVersion: number }) =>
      mentorEngagementsService.extend(vars.engagementId, vars.addDays, vars.expectedVersion),
    onSuccess: () => refreshWorkspace(qc, wsId),
  });
}

/** Kết thúc (nhóm hoặc chính cố vấn) — làm mới cả hai phía. */
export function useEndEngagement(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { engagementId: string; reason?: string }) =>
      mentorEngagementsService.end(vars.engagementId, vars.reason),
    onSuccess: () => {
      refreshWorkspace(qc, wsId);
      void qc.invalidateQueries({ queryKey: mentorKeys.myEngagements() });
      // "Đơn của tôi" hiện "Mở nhóm" theo trạng thái hợp tác; bài (bảng tin + chi tiết) hiện số cố vấn còn cần.
      void qc.invalidateQueries({ queryKey: mentorKeys.myApplications() });
      void qc.invalidateQueries({ queryKey: ['mentor', 'posts'] });
      void qc.invalidateQueries({ queryKey: ['mentor', 'post'] });
    },
  });
}
