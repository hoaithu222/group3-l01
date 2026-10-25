/**
 * Tên phòng LiveKit (p0-08 README §2) — MỘT nơi duy nhất sinh/giải mã, không ghép chuỗi tay ở module khác:
 * - `call_<callId>`: cuộc gọi 1-1/nhóm (p2-01) và phòng thoại kênh (p2-03);
 * - `meet_<meetingCode>`: phòng họp (p2-05), mã họp bỏ dấu gạch;
 * - `spike_<tên>`: phòng spike P0 (dev/staging).
 * Không dùng id hội thoại làm tên phòng (tách phòng chat và phòng media, mỗi cuộc gọi một phòng mới).
 */
export type RoomKind = "call" | "meeting" | "spike" | "unknown";

export interface ParsedRoomName {
  kind: RoomKind;
  /** Phần sau tiền tố (callId / mã họp không gạch / tên spike); nguyên tên phòng khi `kind = "unknown"`. */
  ref: string;
}

const PREFIX = { call: "call_", meeting: "meet_", spike: "spike_" } as const;

function requireRef(value: string, what: string): string {
  if (!value || value.trim() === "") throw new Error(`room-names: ${what} không được rỗng`);
  return value;
}

export const roomNames = {
  call: (callId: string): string => `${PREFIX.call}${requireRef(callId, "callId")}`,
  meeting: (code: string): string => `${PREFIX.meeting}${requireRef(code.replace(/-/g, ""), "mã họp")}`,
  spike: (name: string): string => `${PREFIX.spike}${requireRef(name, "tên phòng spike")}`,
  parse(room: string): ParsedRoomName {
    for (const [kind, prefix] of [
      ["call", PREFIX.call],
      ["meeting", PREFIX.meeting],
      ["spike", PREFIX.spike],
    ] as const) {
      if (room.startsWith(prefix) && room.length > prefix.length) {
        return { kind, ref: room.slice(prefix.length) };
      }
    }
    return { kind: "unknown", ref: room };
  },
};
