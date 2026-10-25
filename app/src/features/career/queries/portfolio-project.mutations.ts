import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { newIdempotencyKey, shouldRotateIdempotencyKey } from '@/shared/hooks/useIdempotencyKey';

import { portfolioProjectService } from '../api/portfolio-project.service';
import type { PortfolioProject, UpdateProjectInput } from '../api/portfolio.types';
import {
  markDirty,
  removeProject,
  reorderProjects,
  sortProjects,
  upsertProject,
} from '../utils/portfolio-cache';
import {
  applySaved,
  overviewOf,
  reportOptimisticError,
  resyncIfGone,
  type Cache,
} from './portfolio-project.helpers';
import { portfolioKeys } from './portfolio.keys';
import { refreshOverview } from './portfolio.mutations';

/**
 * Thêm dự án từ nhóm. `Idempotency-Key` sinh MỘT lần cho mỗi nhóm và GIỮ khi thử lại sau lỗi mạng/5xx (BE chỉ làm một lượt); chỉ đổi khoá khi BE đã chốt
 * câu trả lời (4xx hoặc thành công) — gửi lại cùng khoá sau 4xx là nhận lại đúng câu lỗi cũ (`shouldRotateIdempotencyKey`).
 * Thành công ⇒ làm mới hồ sơ (BE có thể vừa TẠO hồ sơ ở lượt này) và danh sách nhóm (`alreadyAdded`).
 */
export function useAddProject() {
  const queryClient = useQueryClient();
  const keys = useRef(new Map<string, string>());
  return useMutation({
    mutationFn: async (workspaceId: string) => {
      const key = keys.current.get(workspaceId) ?? newIdempotencyKey('portfolio-add', workspaceId);
      keys.current.set(workspaceId, key);
      try {
        const project = await portfolioProjectService.add(workspaceId, key);
        keys.current.delete(workspaceId);
        return project;
      } catch (error) {
        if (shouldRotateIdempotencyKey(error)) keys.current.delete(workspaceId);
        throw error;
      }
    },
    onSuccess: (project) => {
      applySaved(queryClient, project);
      void refreshOverview(queryClient);
      void queryClient.invalidateQueries({ queryKey: portfolioKeys.eligible() });
    },
  });
}

/** Lưu nội dung một dự án (form). Lỗi hiện TRONG form (`RES_003` → banner "Tải lại"), không toast. */
export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, projectId }: { projectId: string; input: UpdateProjectInput }) =>
      portfolioProjectService.update(projectId, input),
    onError: (error) => resyncIfGone(queryClient, error),
    onSuccess: (project) => applySaved(queryClient, project),
  });
}

/** Ẩn/hiện một dự án: LẠC QUAN, lỗi ⇒ trả về giá trị cũ + toast (không thì công tắc nói "đã ẩn" trong khi trang vẫn hiện). Gửi `expectedVersion` CỦA DỰ ÁN. */
export function useToggleProjectVisible() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ project, visible }: { project: PortfolioProject; visible: boolean }) =>
      portfolioProjectService.update(project.id, { expectedVersion: project.version, visible }),
    // ⚠️ `onMutate` PHẢI đứng trước `onError`: TypeScript suy kiểu `context` từ giá trị trả về của `onMutate` theo thứ tự khoá (đảo lại → `context` là `{}`).
    onMutate: async ({ project, visible }) => {
      await queryClient.cancelQueries({ exact: true, queryKey: portfolioKeys.overview() });
      const previous = overviewOf(queryClient);
      queryClient.setQueryData<Cache>(portfolioKeys.overview(), (old) =>
        upsertProject(old, { ...project, visible }),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      queryClient.setQueryData<Cache>(portfolioKeys.overview(), context?.previous);
      reportOptimisticError(queryClient, error);
    },
    onSuccess: (project) => applySaved(queryClient, project),
  });
}

/** Đổi thứ tự dự án: LẠC QUAN (`projectIds` = thứ tự mới, phải đủ tập hiện có), lỗi ⇒ trả về thứ tự cũ + toast. Server trả danh sách MỚI làm nguồn đúng. */
export function useReorderProjects() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectIds: string[]) => portfolioProjectService.reorder(projectIds),
    onMutate: async (projectIds) => {
      await queryClient.cancelQueries({ exact: true, queryKey: portfolioKeys.overview() });
      const previous = overviewOf(queryClient);
      queryClient.setQueryData<Cache>(portfolioKeys.overview(), (old) =>
        reorderProjects(old, projectIds),
      );
      return { previous };
    },
    onError: (error, _ids, context) => {
      queryClient.setQueryData<Cache>(portfolioKeys.overview(), context?.previous);
      reportOptimisticError(queryClient, error);
    },
    onSuccess: (projects) =>
      queryClient.setQueryData<Cache>(portfolioKeys.overview(), (old) =>
        old ? markDirty({ ...old, projects: sortProjects(projects) }) : old,
      ),
  });
}

/** Xoá dự án khỏi hồ sơ (không xoá task/nhóm). Nhóm đó quay lại danh sách "đủ điều kiện" với `alreadyAdded: false`. */
export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => portfolioProjectService.remove(projectId),
    onError: (error) => resyncIfGone(queryClient, error),
    onSuccess: (_void, projectId) => {
      queryClient.setQueryData<Cache>(portfolioKeys.overview(), (old) =>
        markDirty(removeProject(old, projectId)),
      );
      void queryClient.invalidateQueries({ queryKey: portfolioKeys.eligible() });
    },
  });
}

/** "Làm mới số liệu" — 10 lượt/giờ; 429 `PORT_007` kèm `retryAfterSeconds` (màn đếm ngược, không toast). */
export function useRefreshProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => portfolioProjectService.refresh(projectId),
    onError: (error) => resyncIfGone(queryClient, error),
    onSuccess: (project) => applySaved(queryClient, project),
  });
}
