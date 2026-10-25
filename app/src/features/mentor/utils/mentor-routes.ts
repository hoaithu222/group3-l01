import type { Href } from 'expo-router';

/**
 * Href của các màn Mentor Connect — MỘT chỗ để đổi đường dẫn (`navigation.md`, cùng vai `PATHS`).
 *
 * ⚠️ Route CHỈ-CÓ-`index` (`mentor/index.tsx`, `workspaces/[wsId]/mentor/index.tsx`) ép `as Href`: bộ sinh typed routes
 * sinh THẤT THƯỜNG `/x` hoặc `/x/index` (cùng bẫy `wallet-routes.ts`/`board-routes.ts`); chuỗi thật đúng ở mọi trường hợp.
 */
export function mentorBoardHref(): Href {
  return '/mentor' as Href;
}

export function mentorPostHref(postId: string): Href {
  return { params: { postId }, pathname: '/mentor/[postId]' };
}

export function workspaceMentorHref(wsId: string): Href {
  return `/workspaces/${wsId}/mentor` as Href;
}

export function newMentorPostHref(wsId: string): Href {
  return { params: { wsId }, pathname: '/workspaces/[wsId]/mentor/new' };
}

export function postApplicationsHref(wsId: string, postId: string): Href {
  return { params: { postId, wsId }, pathname: '/workspaces/[wsId]/mentor/[postId]/applications' };
}

/** Mở nhóm (cố vấn là khách — thấy kênh được chỉ định) / nhóm chat cố vấn. */
export function workspaceHref(wsId: string): Href {
  return `/workspaces/${wsId}` as Href;
}

export function conversationHref(conversationId: string): Href {
  return `/messages/${conversationId}` as Href;
}
