import { render } from '@testing-library/react-native';

import { MeetingStage, type MeetingStageProps } from '../../../components/stage/MeetingStage';
import { makePerson } from '../../fixtures';
import { makeRenderVideo } from './stage-helpers';

/**
 * Đồ dùng chung cho test `MeetingStage` (tách ra để mỗi file test ≤ 200 dòng). KHÔNG phải test (`testMatch` chỉ nhận `*.test.ts(x)`).
 * Phòng mẫu: "Tôi" (người mình, `me`) đứng đầu, rồi "Người 2", "Người 3"… (`u2`, `u3`…).
 */
export const room = (count: number) => [
  makePerson({ isLocal: true, name: 'Tôi', userId: 'me' }),
  ...Array.from({ length: count - 1 }, (_, index) =>
    makePerson({ name: `Người ${String(index + 2)}`, userId: `u${String(index + 2)}` }),
  ),
];

export function makeProps(over: Partial<MeetingStageProps> = {}): MeetingStageProps {
  return {
    landscape: false,
    layout: 'GRID',
    onChangePage: jest.fn(),
    onPin: jest.fn(),
    page: 0,
    pageSize: 4,
    people: room(6),
    pinnedUserId: null,
    renderVideo: makeRenderVideo(),
    ...over,
  };
}

/** Dựng sân khấu; `view` là Promise của `render` (RNTL 14 bất đồng bộ) — nhớ `await`. */
export function mount(over: Partial<MeetingStageProps> = {}) {
  const props = makeProps(over);
  return { props, view: render(<MeetingStage {...props} />) };
}
