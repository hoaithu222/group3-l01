/**
 * Phiên học thẻ (app.md p4-01 §5 "Chế độ học thẻ giữ trong state màn"; README §2: client-side, KHÔNG ghi server —
 * tiến độ ôn theo lịch là p4-02). Toàn bộ là hàm THUẦN trên `SessionState` để test không cần React.
 */
export interface SessionState {
  /** Khoá mục theo thứ tự đang học (đã xáo hoặc gốc). */
  order: string[];
  /** Vị trí hiện tại trong `order`; bằng `order.length` khi đã học hết (màn tóm tắt). */
  index: number;
  flipped: boolean;
  known: string[];
  unknown: string[];
  shuffled: boolean;
}

/** Fisher–Yates, `random` tiêm vào để test tất định. */
export function shuffle<T>(list: readonly T[], random: () => number = Math.random): T[] {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}

export function startSession(
  keys: readonly string[],
  shuffled = false,
  random?: () => number,
): SessionState {
  return {
    flipped: false,
    index: 0,
    known: [],
    order: shuffled ? shuffle(keys, random) : [...keys],
    shuffled,
    unknown: [],
  };
}

export const isFinished = (state: SessionState): boolean => state.index >= state.order.length;

export const currentKey = (state: SessionState): string | undefined => state.order[state.index];

export function flip(state: SessionState): SessionState {
  return isFinished(state) ? state : { ...state, flipped: !state.flipped };
}

/** Sang thẻ kế; thẻ cuối rồi thì kết thúc phiên (`index === length`). Luôn về mặt trước. */
export function next(state: SessionState): SessionState {
  return isFinished(state) ? state : { ...state, flipped: false, index: state.index + 1 };
}

export function previous(state: SessionState): SessionState {
  return state.index <= 0
    ? state
    : { ...state, flipped: false, index: Math.min(state.index, state.order.length) - 1 };
}

/** Đánh dấu thẻ hiện tại "đã thuộc"/"chưa thuộc" rồi sang thẻ kế. Đánh dấu lại thẻ cũ thì đổi phía, không đếm đôi. */
export function mark(state: SessionState, known: boolean): SessionState {
  const key = currentKey(state);
  if (key === undefined) return state;
  const drop = (list: string[]) => list.filter((k) => k !== key);
  return next({
    ...state,
    known: known ? [...drop(state.known), key] : drop(state.known),
    unknown: known ? drop(state.unknown) : [...drop(state.unknown), key],
  });
}

/** Xáo (hoặc trả lại thứ tự gốc) rồi học lại TỪ ĐẦU; tiến độ đã thuộc bị xoá. */
export function restart(
  keys: readonly string[],
  shuffled: boolean,
  random?: () => number,
): SessionState {
  return startSession(keys, shuffled, random);
}

/** "Học lại thẻ chưa thuộc": phiên mới chỉ gồm thẻ đã đánh dấu chưa thuộc (giữ thứ tự đang học). */
export function retryUnknown(state: SessionState): SessionState {
  return startSession(
    state.order.filter((key) => state.unknown.includes(key)),
    false,
  );
}

export function progressText(state: SessionState): string {
  return `${Math.min(state.index + 1, state.order.length)}/${state.order.length}`;
}
