import { gridColumns, groupForPanel, mergePeople, paginate, sortForStage, videoIdentitiesToSubscribe } from '../utils/room-people.utils';
import { fakeParticipant, makePerson, makeServerParticipant } from './fixtures';

/** Ghép media + server, sắp thứ tự ô, chia trang, chọn video cần subscribe (app.md §3.2, §6). */

describe('mergePeople', () => {
  it('danh sách gốc là MEDIA; vai trò/`mutedByHost` lấy từ ảnh chụp server theo userId', () => {
    const people = mergePeople(
      [fakeParticipant({ identity: 'u1', isLocal: true, name: 'Tôi' }), fakeParticipant({ identity: 'u2', name: '' })],
      [
        makeServerParticipant({ mutedByHost: true, name: 'Hai', role: 'CO_HOST', userId: 'u2' }),
        makeServerParticipant({ role: 'HOST', userId: 'u3' }),
      ],
    );
    expect(people.map((p) => p.userId)).toEqual(['u1', 'u2']); // u3 chưa kết nối LiveKit ⇒ chưa có ô
    expect(people[0]).toMatchObject({ isLocal: true, mutedByHost: false, name: 'Tôi', role: 'MEMBER' });
    expect(people[1]).toMatchObject({ mutedByHost: true, name: 'Hai', role: 'CO_HOST' }); // media thiếu tên → dùng tên server
  });
});

describe('sortForStage', () => {
  it('ghim → đang nói → giơ tay → camera bật → vào trước (ổn định)', () => {
    const people = [
      makePerson({ userId: 'a' }),
      makePerson({ cameraEnabled: true, userId: 'b' }),
      makePerson({ handRaisedAt: '2026-10-01T09:00:00.000Z', userId: 'c' }),
      makePerson({ isSpeaking: true, userId: 'd' }),
      makePerson({ userId: 'e' }),
    ];
    expect(sortForStage(people, 'e').map((p) => p.userId)).toEqual(['e', 'd', 'c', 'b', 'a']);
    expect(sortForStage(people, null).map((p) => p.userId)).toEqual(['d', 'c', 'b', 'a', 'e']);
  });
});

describe('groupForPanel', () => {
  it('mỗi người đúng MỘT nhóm: giơ tay (sớm nhất trước) → chủ trì/đồng chủ trì → còn lại', () => {
    const groups = groupForPanel([
      makePerson({ role: 'HOST', userId: 'h' }),
      makePerson({ handRaisedAt: '2026-10-01T09:02:00.000Z', userId: 'r2' }),
      makePerson({ handRaisedAt: '2026-10-01T09:01:00.000Z', role: 'CO_HOST', userId: 'r1' }),
      makePerson({ userId: 'x' }),
    ]);
    expect(groups.raised.map((p) => p.userId)).toEqual(['r1', 'r2']);
    expect(groups.hosts.map((p) => p.userId)).toEqual(['h']);
    expect(groups.others.map((p) => p.userId)).toEqual(['x']);
  });
});

describe('paginate / gridColumns / videoIdentitiesToSubscribe', () => {
  it('paginate chia đúng cỡ trang, trang cuối có thể ngắn, rỗng → không trang', () => {
    expect(paginate([1, 2, 3, 4, 5], 4)).toEqual([[1, 2, 3, 4], [5]]);
    expect(paginate([], 4)).toEqual([]);
    expect(paginate([1, 2], 0)).toEqual([[1], [2]]); // cỡ trang hỏng vẫn không treo
  });

  it('gridColumns: 1 → 1; 2 → dọc 1/ngang 2; 3–4 → 2; 5–9 → 3', () => {
    expect([1, 2, 3, 4, 5, 9].map((n) => gridColumns(n, false))).toEqual([1, 1, 2, 2, 3, 3]);
    expect(gridColumns(2, true)).toBe(2);
  });

  it('subscribe: chia sẻ màn hình + ghim luôn được giữ, cắt theo trần, không trùng', () => {
    const page = ['a', 'b', 'c', 'd'].map((userId) => makePerson({ userId }));
    const ids = videoIdentitiesToSubscribe(page, { max: 3, pinnedUserId: 'z', sharerUserId: 's', speakerUserId: 'a' });
    expect(ids).toEqual(['s', 'z', 'a']);
    expect(videoIdentitiesToSubscribe(page, { max: 9, pinnedUserId: 'a', sharerUserId: null, speakerUserId: 'a' })).toEqual(['a', 'b', 'c', 'd']);
  });
});
