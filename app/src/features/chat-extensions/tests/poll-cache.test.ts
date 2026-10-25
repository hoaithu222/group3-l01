import { chatKeys } from '@/features/chat';
import { makeData, makeMessage } from '@/features/chat/cache/apply-socket-event.fixtures';

import type { PollUpdatedEvent } from '../api/chat-extensions.types';
import {
  applyPollEvent,
  findPoll,
  isPollClosed,
  mergeServerPoll,
  patchPollInMessages,
  percentOf,
  withMyVote,
} from '../utils/poll-cache';
import { makePoll } from './fixtures';

const event = (overrides: Partial<PollUpdatedEvent> = {}): PollUpdatedEvent => ({
  closeReason: null,
  messageId: 'msg-poll',
  options: [
    { id: 'a', voteCount: 3 },
    { id: 'b', voteCount: 1 },
  ],
  pollId: 'p-1',
  scopeId: 'ch-1',
  scopeType: 'CHANNEL',
  status: 'OPEN',
  version: 4,
  voterCount: 4,
  ...overrides,
});

describe('percentOf', () => {
  it('làm tròn 1 chữ số theo số NGƯỜI bầu; 0 người → 0', () => {
    expect(percentOf(1, 3)).toBe(33.3);
    expect(percentOf(2, 3)).toBe(66.7);
    expect(percentOf(0, 0)).toBe(0);
  });
});

describe('applyPollEvent — poll:updated', () => {
  it('bản MỚI hơn: cập nhật đếm + % + version, GIỮ myOptionIds cục bộ', () => {
    const poll = makePoll({ myOptionIds: ['a'] });
    const next = applyPollEvent(poll, event());
    expect(next.version).toBe(4);
    expect(next.voterCount).toBe(4);
    expect(next.options.map((o) => [o.voteCount, o.percent])).toEqual([[3, 75], [1, 25]]);
    expect(next.myOptionIds).toEqual(['a']);
  });

  it('version cũ hoặc bằng bị BỎ QUA (trả đúng đối tượng cũ)', () => {
    const poll = makePoll({ version: 5 });
    expect(applyPollEvent(poll, event({ version: 4 }))).toBe(poll);
    expect(applyPollEvent(poll, event({ version: 5 }))).toBe(poll);
  });

  it('đóng khảo sát: status CLOSED + lý do + canClose=false', () => {
    const next = applyPollEvent(makePoll({ canClose: true }), event({ closeReason: 'BY_CREATOR', status: 'CLOSED' }));
    expect(next).toMatchObject({ canClose: false, closeReason: 'BY_CREATOR', status: 'CLOSED' });
  });
});

describe('withMyVote — lạc quan', () => {
  it('bầu lần đầu: +1 người, +1 phiếu ở lựa chọn, % tính lại cho MỌI lựa chọn', () => {
    const next = withMyVote(makePoll(), ['a']);
    expect(next.voterCount).toBe(3);
    expect(next.options.map((o) => [o.voteCount, o.percent])).toEqual([[2, 66.7], [1, 33.3]]);
    expect(next.myOptionIds).toEqual(['a']);
  });

  it('đổi lựa chọn (chọn một): A −1, B +1, số người giữ nguyên', () => {
    const next = withMyVote(makePoll({ myOptionIds: ['a'] }), ['b']);
    expect(next.voterCount).toBe(2);
    expect(next.options.map((o) => o.voteCount)).toEqual([0, 2]);
  });

  it('bỏ phiếu (rỗng): −1 người, không xuống dưới 0', () => {
    const next = withMyVote(makePoll({ myOptionIds: ['a'], voterCount: 1, options: [{ id: 'a', percent: 100, text: 'Phở', voteCount: 1 }] }), []);
    expect(next.voterCount).toBe(0);
    expect(next.options[0]).toMatchObject({ percent: 0, voteCount: 0 });
  });
});

describe('mergeServerPoll', () => {
  it('server mới hơn hoặc bằng → thay hẳn', () => {
    const server = makePoll({ myOptionIds: ['b'], version: 4 });
    expect(mergeServerPoll(makePoll(), server)).toBe(server);
  });

  it('server CŨ hơn (poll:updated mới hơn đã tới trước) → chỉ lấy myOptionIds, không lùi số đếm', () => {
    const current = makePoll({ version: 6, voterCount: 9 });
    const merged = mergeServerPoll(current, makePoll({ myOptionIds: ['b'], version: 5, voterCount: 8 }));
    expect(merged).toMatchObject({ myOptionIds: ['b'], version: 6, voterCount: 9 });
  });
});

describe('isPollClosed', () => {
  it('CLOSED, hoặc đã quá closesAt dù trạng thái còn OPEN (job đóng chưa chạy)', () => {
    const now = Date.parse('2026-10-01T00:00:00.000Z');
    expect(isPollClosed({ closesAt: null, status: 'CLOSED' }, now)).toBe(true);
    expect(isPollClosed({ closesAt: '2026-09-30T00:00:00.000Z', status: 'OPEN' }, now)).toBe(true);
    expect(isPollClosed({ closesAt: '2026-10-02T00:00:00.000Z', status: 'OPEN' }, now)).toBe(false);
    expect(isPollClosed({ closesAt: null, status: 'OPEN' }, now)).toBe(false);
  });
});

describe('vá khảo sát trong cache tin nhắn của chat', () => {
  const data = makeData([{ data: [makeMessage({ id: 'msg-poll', kind: 'POLL', poll: makePoll() }), makeMessage({ id: 'm-2' })] }]);

  it('vá đúng tin khảo sát; tin khác giữ nguyên', () => {
    const next = patchPollInMessages(data, 'msg-poll', (poll) => ({ ...poll, voterCount: 99 }));
    expect(findPoll(next, 'msg-poll')?.voterCount).toBe(99);
    expect(next?.pages[0]?.data[1]).toBe(data.pages[0]?.data[1]);
  });

  it('tin không có khảo sát / cache rỗng → không vá, không ném', () => {
    expect(findPoll(patchPollInMessages(data, 'm-2', (p) => ({ ...p, voterCount: 1 })), 'm-2')).toBeUndefined();
    expect(patchPollInMessages(undefined, 'msg-poll', (p) => p)).toBeUndefined();
  });

  it('khoá cache dùng đúng `chatKeys.messages` của phòng', () => {
    expect(chatKeys.messages({ scopeId: 'ch-1', scopeType: 'CHANNEL' })).toEqual(['chat', 'CHANNEL', 'ch-1', 'root', 'messages']);
  });
});
