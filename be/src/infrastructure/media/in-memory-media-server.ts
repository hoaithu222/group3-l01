import { mediaErrors } from "./media.errors";
import type {
  CreateMediaRoomInput,
  IMediaServer,
  ListEgressInput,
  MediaEgress,
  MediaParticipant,
  MediaPing,
  MediaRoom,
  MediaTrackInfo,
  StartRoomCompositeInput,
  UpdateMediaParticipantInput,
} from "./media.types";

interface FakeRoom {
  room: MediaRoom;
  participants: Map<string, MediaParticipant>;
}

/** Lời gọi đã ghi lại — test assert `calls` thay vì mock từng hàm. */
export interface MediaCall {
  op: string;
  args: unknown[];
}

/**
 * Adapter GIẢ của cổng `IMediaServer` cho test (không mạng, không SDK) — module Phase 2 gắn bằng
 * `setMediaServerForTests(new InMemoryMediaServer())`. Hành vi khớp quy ước lỗi của `IRoomService`
 * (deleteRoom/removeParticipant idempotent, listParticipants phòng lạ → `[]`, mute/update phòng lạ → MEDIA_004).
 *
 * Mô phỏng client: `join()` / `leave()` (LiveKit thật do client kết nối, không qua REST).
 * Mô phỏng sự cố: `failNext(op, error?)` — lần gọi kế tiếp của `op` ném lỗi (mặc định MEDIA_003).
 */
export class InMemoryMediaServer implements IMediaServer {
  readonly kind = "memory" as const;
  readonly calls: MediaCall[] = [];
  private readonly rooms = new Map<string, FakeRoom>();
  private readonly egresses = new Map<string, MediaEgress>();
  private readonly failures = new Map<string, Error>();
  private seq = 0;

  isConfigured(): boolean {
    return true;
  }

  failNext(op: string, error: Error = mediaErrors.unreachable(op)): void {
    this.failures.set(op, error);
  }

  reset(): void {
    this.calls.length = 0;
    this.rooms.clear();
    this.egresses.clear();
    this.failures.clear();
  }

  callsOf(op: string): MediaCall[] {
    return this.calls.filter((c) => c.op === op);
  }

  /** Ghi lời gọi, áp lỗi giả lập (nếu có), chạy `fn`; mọi lỗi (đồng bộ) thành rejection như adapter thật. */
  private run<T>(op: string, args: unknown[], fn: () => T): Promise<T> {
    this.calls.push({ op, args });
    try {
      const failure = this.failures.get(op);
      if (failure) {
        this.failures.delete(op);
        throw failure;
      }
      return Promise.resolve(fn());
    } catch (err) {
      return Promise.reject(err);
    }
  }

  private ensureRoom(name: string): FakeRoom {
    let entry = this.rooms.get(name);
    if (!entry) {
      entry = {
        room: {
          name,
          sid: `RM_${++this.seq}`,
          numParticipants: 0,
          maxParticipants: 0,
          emptyTimeoutSeconds: 300,
          metadata: "",
          createdAt: new Date().toISOString(),
        },
        participants: new Map(),
      };
      this.rooms.set(name, entry);
    }
    return entry;
  }

  private sync(entry: FakeRoom): MediaRoom {
    entry.room.numParticipants = entry.participants.size;
    return { ...entry.room };
  }

  /** Mô phỏng 1 client vào phòng (tạo phòng nếu chưa có — như LiveKit thật khi `roomCreate` bật). */
  join(room: string, p: Partial<MediaParticipant> & { identity: string; tracks?: MediaTrackInfo[] }): MediaParticipant {
    const entry = this.ensureRoom(room);
    const participant: MediaParticipant = {
      sid: `PA_${++this.seq}`,
      name: p.identity,
      state: "ACTIVE",
      metadata: "",
      attributes: {},
      joinedAt: new Date().toISOString(),
      tracks: [],
      permission: null,
      ...p,
    };
    entry.participants.set(p.identity, participant);
    return participant;
  }

  leave(room: string, identity: string): void {
    this.rooms.get(room)?.participants.delete(identity);
  }

  createRoom(input: CreateMediaRoomInput): Promise<MediaRoom> {
    return this.run("createRoom", [input], () => {
      const entry = this.ensureRoom(input.name);
      Object.assign(entry.room, {
        ...(input.emptyTimeoutSeconds !== undefined && { emptyTimeoutSeconds: input.emptyTimeoutSeconds }),
        ...(input.maxParticipants !== undefined && { maxParticipants: input.maxParticipants }),
        ...(input.metadata !== undefined && { metadata: input.metadata }),
      });
      return this.sync(entry);
    });
  }

  listRooms(names?: string[]): Promise<MediaRoom[]> {
    return this.run("listRooms", [names], () =>
      [...this.rooms.values()].filter((e) => !names || names.includes(e.room.name)).map((e) => this.sync(e))
    );
  }

  deleteRoom(room: string): Promise<void> {
    return this.run("deleteRoom", [room], () => {
      this.rooms.delete(room);
    });
  }

  listParticipants(room: string): Promise<MediaParticipant[]> {
    return this.run("listParticipants", [room], () =>
      [...(this.rooms.get(room)?.participants.values() ?? [])].map((p) => ({ ...p }))
    );
  }

  removeParticipant(room: string, identity: string): Promise<void> {
    return this.run("removeParticipant", [room, identity], () => {
      this.rooms.get(room)?.participants.delete(identity);
    });
  }

  mutePublishedTrack(room: string, identity: string, trackSid: string, muted: boolean): Promise<void> {
    return this.run("mutePublishedTrack", [room, identity, trackSid, muted], () => {
      const track = this.rooms.get(room)?.participants.get(identity)?.tracks.find((t) => t.sid === trackSid);
      if (!track) throw mediaErrors.roomNotFound();
      track.muted = muted;
    });
  }

  updateParticipant(room: string, identity: string, input: UpdateMediaParticipantInput): Promise<void> {
    return this.run("updateParticipant", [room, identity, input], () => {
      const participant = this.rooms.get(room)?.participants.get(identity);
      if (!participant) throw mediaErrors.roomNotFound();
      if (input.permission) participant.permission = { canUpdateMetadata: true, ...input.permission };
      if (input.attributes) participant.attributes = { ...participant.attributes, ...input.attributes };
      if (input.metadata !== undefined) participant.metadata = input.metadata;
      if (input.name !== undefined) participant.name = input.name;
    });
  }

  startRoomCompositeEgress(room: string, input: StartRoomCompositeInput): Promise<MediaEgress> {
    return this.run("startRoomCompositeEgress", [room, input], () => {
      if (!this.rooms.has(room)) throw mediaErrors.roomNotFound();
      const egress: MediaEgress = {
        egressId: `EG_${++this.seq}`,
        roomName: room,
        status: "ACTIVE",
        startedAt: new Date().toISOString(),
        endedAt: null,
        error: null,
        files: [],
      };
      this.egresses.set(egress.egressId, egress);
      return { ...egress };
    });
  }

  stopEgress(egressId: string): Promise<void> {
    return this.run("stopEgress", [egressId], () => {
      const egress = this.egresses.get(egressId);
      if (egress && egress.status === "ACTIVE") egress.status = "ENDING";
    });
  }

  listEgress(input: ListEgressInput = {}): Promise<MediaEgress[]> {
    return this.run("listEgress", [input], () => {
      const active = new Set(["STARTING", "ACTIVE", "ENDING"]);
      return [...this.egresses.values()]
        .filter((e) => !input.roomName || e.roomName === input.roomName)
        .filter((e) => !input.egressId || e.egressId === input.egressId)
        .filter((e) => !input.active || active.has(e.status))
        .map((e) => ({ ...e }));
    });
  }

  ping(): Promise<MediaPing> {
    return this.run("ping", [], () => ({ latencyMs: 0, rooms: this.rooms.size }));
  }
}
