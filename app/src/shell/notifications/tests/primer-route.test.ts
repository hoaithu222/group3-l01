import { isPrimerRoute } from '../push-primer';

/** Tấm primer chỉ được mời ở đúng lúc người dùng vừa mở hội thoại / vào nhóm (`app.md` §3). */

describe('isPrimerRoute', () => {
  it.each([
    ['/messages/abc123', true],
    ['/messages/abc123/info', true],
    ['/workspaces/ws1', true],
    ['/workspaces/ws1/channels/ch1', true],
  ])('%s → %s (mở hội thoại / vào nhóm)', (path, expected) => {
    expect(isPrimerRoute(path)).toBe(expected);
  });

  it.each([
    '/',
    '/messages',
    '/messages/new',
    '/messages/new-group',
    '/messages/archived',
    '/messages/calls',
    '/workspaces',
    '/workspaces/new',
    '/workspaces/pending',
    '/me',
    '/me/settings',
    '/activity',
    '/login',
  ])('%s → false (không phải một hội thoại/nhóm cụ thể)', (path) => {
    expect(isPrimerRoute(path)).toBe(false);
  });
});
