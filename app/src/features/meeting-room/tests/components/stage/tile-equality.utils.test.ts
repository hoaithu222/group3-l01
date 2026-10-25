import {
  sameTileProps,
  sameVideoRef,
  samePersonOnTile,
} from '../../../components/stage/tile-equality.utils';
import { makePerson } from '../../fixtures';

/**
 * Bộ so của `memo(ParticipantTile)`: snapshot media dựng `RoomPerson` + `videoRef` MỚI mỗi lần (adapter LiveKit), nên so `===` là ô vẽ lại
 * liên tục. Ở đây khoá: cùng track (so nông) = bằng; trường KHÔNG hiện trên ô (chất lượng mạng…) không làm vẽ lại; trường hiện ra thì có.
 */
describe('sameVideoRef', () => {
  const participant = { id: 'p' };
  const publication = { sid: 'TR_1' };

  it('object MỚI cùng participant/publication/source → bằng nhau (cùng track)', () => {
    expect(
      sameVideoRef(
        { participant, publication, source: 'camera' },
        { participant, publication, source: 'camera' },
      ),
    ).toBe(true);
  });

  it('khác publication, khác bộ khoá, null ↔ object → khác', () => {
    expect(
      sameVideoRef(
        { participant, publication, source: 'camera' },
        { participant, publication: { sid: 'TR_2' }, source: 'camera' },
      ),
    ).toBe(false);
    expect(
      sameVideoRef({ participant, publication }, { participant, publication, source: 'camera' }),
    ).toBe(false);
    expect(sameVideoRef(null, { participant })).toBe(false);
    expect(sameVideoRef('cam-1', 'cam-2')).toBe(false);
  });

  it('cùng giá trị nguyên thuỷ / cùng tham chiếu → bằng', () => {
    expect(sameVideoRef('cam-1', 'cam-1')).toBe(true);
    expect(sameVideoRef(null, null)).toBe(true);
    expect(sameVideoRef(publication, publication)).toBe(true);
  });
});

describe('samePersonOnTile', () => {
  const base = makePerson({ name: 'Lan', userId: 'u1', videoRef: { sid: 'TR_1' } });

  it('chỉ đổi thứ ô KHÔNG vẽ (chất lượng mạng, bị chủ trì tắt mic, camera bật cờ, giờ giơ tay khác) → coi như bằng', () => {
    const later = {
      ...base,
      cameraEnabled: true,
      connectionQuality: 'poor' as const,
      mutedByHost: true,
      videoRef: { sid: 'TR_1' },
    };
    expect(samePersonOnTile(base, later)).toBe(true);
    expect(samePersonOnTile({ ...base, handRaisedAt: 'a' }, { ...base, handRaisedAt: 'b' })).toBe(
      true,
    );
  });

  it.each([
    ['isSpeaking', { isSpeaking: true }],
    ['micEnabled', { micEnabled: false }],
    ['handRaisedAt', { handRaisedAt: '2026-10-01T09:01:00.000Z' }],
    ['name', { name: 'Lan B' }],
    ['role', { role: 'HOST' as const }],
    ['videoRef', { videoRef: null }],
  ])('đổi `%s` → khác (ô phải vẽ lại)', (_field, change) => {
    expect(samePersonOnTile(base, { ...base, ...change })).toBe(false);
  });
});

describe('sameTileProps', () => {
  const person = makePerson({ userId: 'u1' });
  const onLongPress = jest.fn();

  it('cùng props (person mới nhưng cùng nội dung) → bằng; đổi callback / số thứ tự / ghim → khác', () => {
    expect(sameTileProps({ onLongPress, person }, { onLongPress, person: { ...person } })).toBe(
      true,
    );
    expect(sameTileProps({ onLongPress, person }, { onLongPress: jest.fn(), person })).toBe(false);
    expect(sameTileProps({ handOrder: 1, person }, { handOrder: 2, person })).toBe(false);
    expect(sameTileProps({ person, pinned: false }, { person, pinned: true })).toBe(false);
  });

  it('thêm/bớt một prop → khác (an toàn hơn bỏ sót)', () => {
    expect(
      sameTileProps<{ handOrder?: number; person: typeof person }>(
        { person },
        { handOrder: undefined, person },
      ),
    ).toBe(false);
  });
});
