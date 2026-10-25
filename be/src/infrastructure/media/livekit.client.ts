import {
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  EncodingOptionsPreset,
  RoomServiceClient,
  S3Upload,
  type ParticipantPermission,
} from "livekit-server-sdk";
import { AppError } from "../../core/exceptions";
import { logger } from "../logger";
import { createLogThrottle } from "../logger/log-throttle";
import { livekitApiErrorsTotal } from "../metrics";
import { getEgressS3Config, getLiveKitApiCredentials, isLiveKitConfigured, type LiveKitConfig } from "./livekit.config";
import { mapEgress, mapParticipant, mapRoom, toSdkSources } from "./livekit.mappers";
import { mediaErrors } from "./media.errors";
import { NoopMediaServer } from "./noop-media-server";
import type {
  CreateMediaRoomInput,
  IMediaServer,
  ListEgressInput,
  MediaEgress,
  MediaParticipant,
  MediaPermission,
  MediaPing,
  MediaRoom,
  StartRoomCompositeInput,
  UpdateMediaParticipantInput,
} from "./media.types";

/** Hạn mỗi lời gọi HTTP tới LiveKit (giây) — SDK mặc định rất dài (Sun PMS treo ~100 s khi LiveKit không phản hồi). */
export const LIVEKIT_REQUEST_TIMEOUT_SECONDS = 5;

/**
 * LiveKit chưa chạy/không tới được (thường gặp ở dev) thì cron `media.rooms-snapshot` lỗi mỗi 30 s: cảnh báo cùng `op`
 * chỉ ghi một lần / 5 phút (kèm `suppressed`). Số lần lỗi đầy đủ vẫn nằm ở `livekit_api_errors_total{op}`, và mỗi request
 * nghiệp vụ bị ảnh hưởng vẫn nhận `MEDIA_003` + log request riêng.
 */
export const LIVEKIT_FAILURE_LOG_INTERVAL_MS = 5 * 60_000;
const failureLog = createLogThrottle(LIVEKIT_FAILURE_LOG_INTERVAL_MS);

type ApiCredentials = Pick<LiveKitConfig, "url" | "apiKey" | "apiSecret">;

function isNotFound(err: unknown): boolean {
  const e = err as { status?: number; code?: string } | null;
  return !!e && (e.status === 404 || e.code === "not_found");
}

function toSdkPermission(p: MediaPermission): Partial<ParticipantPermission> {
  return {
    canPublish: p.canPublish,
    canSubscribe: p.canSubscribe,
    canPublishData: p.canPublishData,
    canPublishSources: toSdkSources(p.canPublishSources),
    canUpdateMetadata: p.canUpdateMetadata ?? true,
  };
}

/** Adapter THẬT của cổng `IMediaServer` — bọc `RoomServiceClient`/`EgressClient` của `livekit-server-sdk`. */
export class LiveKitMediaServer implements IMediaServer {
  readonly kind = "livekit" as const;
  private readonly rooms: RoomServiceClient;
  private readonly egress: EgressClient;

  constructor(
    private readonly creds: ApiCredentials,
    private readonly s3Config: typeof getEgressS3Config = getEgressS3Config
  ) {
    const options = { requestTimeout: LIVEKIT_REQUEST_TIMEOUT_SECONDS };
    this.rooms = new RoomServiceClient(creds.url, creds.apiKey, creds.apiSecret, options);
    this.egress = new EgressClient(creds.url, creds.apiKey, creds.apiSecret, options);
  }

  isConfigured(): boolean {
    return true;
  }

  /** Chạy 1 lời gọi SDK: lỗi mạng/quá hạn → `MEDIA_003`; `not_found` → `onNotFound` (nếu có) hoặc `MEDIA_004`. */
  private async call<T>(op: string, fn: () => Promise<T>, onNotFound?: () => T): Promise<T> {
    try {
      const result = await fn();
      failureLog.clear(op);
      return result;
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (isNotFound(err)) {
        if (onNotFound) return onNotFound();
        throw mediaErrors.roomNotFound();
      }
      livekitApiErrorsTotal.inc({ op });
      const gate = failureLog.tryAcquire(op);
      if (gate) {
        logger.warn("[livekit] Lỗi gọi API máy chủ media", {
          op,
          status: (err as { status?: number }).status,
          error: err instanceof Error ? err.message : String(err),
          ...(gate.suppressed > 0 && { suppressed: gate.suppressed }),
        });
      }
      throw mediaErrors.unreachable(op);
    }
  }

  async createRoom(input: CreateMediaRoomInput): Promise<MediaRoom> {
    const room = await this.call("createRoom", () =>
      this.rooms.createRoom({
        name: input.name,
        emptyTimeout: input.emptyTimeoutSeconds,
        departureTimeout: input.departureTimeoutSeconds,
        maxParticipants: input.maxParticipants,
        metadata: input.metadata,
      })
    );
    return mapRoom(room);
  }

  async listRooms(names?: string[]): Promise<MediaRoom[]> {
    return (await this.call("listRooms", () => this.rooms.listRooms(names))).map(mapRoom);
  }

  async deleteRoom(room: string): Promise<void> {
    await this.call("deleteRoom", () => this.rooms.deleteRoom(room), () => undefined);
  }

  async listParticipants(room: string): Promise<MediaParticipant[]> {
    const list = await this.call("listParticipants", () => this.rooms.listParticipants(room), () => []);
    return list.map(mapParticipant);
  }

  async removeParticipant(room: string, identity: string): Promise<void> {
    await this.call("removeParticipant", () => this.rooms.removeParticipant(room, identity), () => undefined);
  }

  async mutePublishedTrack(room: string, identity: string, trackSid: string, muted: boolean): Promise<void> {
    await this.call("mutePublishedTrack", () => this.rooms.mutePublishedTrack(room, identity, trackSid, muted));
  }

  async updateParticipant(room: string, identity: string, input: UpdateMediaParticipantInput): Promise<void> {
    await this.call("updateParticipant", () =>
      this.rooms.updateParticipant(room, identity, {
        metadata: input.metadata,
        attributes: input.attributes,
        name: input.name,
        permission: input.permission ? toSdkPermission(input.permission) : undefined,
      })
    );
  }

  async startRoomCompositeEgress(room: string, input: StartRoomCompositeInput): Promise<MediaEgress> {
    // Đích env (`EGRESS_S3_*`) tự thêm `EGRESS_S3_PREFIX`; đích truyền tường minh giữ nguyên `filepath` của caller.
    const envTarget = input.fileOutput.s3 ? null : this.s3Config();
    const s3 = input.fileOutput.s3 ?? envTarget;
    if (!s3) throw mediaErrors.notConfigured("egress-s3");
    const prefix = envTarget?.prefix ?? "";
    const filepath =
      prefix && !input.fileOutput.filepath.startsWith(prefix)
        ? `${prefix}${input.fileOutput.filepath}`
        : input.fileOutput.filepath;
    const file = new EncodedFileOutput({
      fileType: EncodedFileType.MP4,
      filepath,
      output: {
        case: "s3",
        value: new S3Upload({ accessKey: s3.accessKey, secret: s3.secret, region: s3.region, bucket: s3.bucket }),
      },
    });
    const info = await this.call("startRoomCompositeEgress", () =>
      this.egress.startRoomCompositeEgress(room, file, {
        layout: input.layout,
        audioOnly: input.audioOnly,
        encodingOptions: input.preset ? EncodingOptionsPreset[input.preset] : undefined,
      })
    );
    return mapEgress(info);
  }

  async stopEgress(egressId: string): Promise<void> {
    await this.call(
      "stopEgress",
      async () => {
        await this.egress.stopEgress(egressId);
      },
      () => undefined
    );
  }

  async listEgress(input: ListEgressInput = {}): Promise<MediaEgress[]> {
    return (await this.call("listEgress", () => this.egress.listEgress(input))).map(mapEgress);
  }

  async ping(timeoutMs = 2000): Promise<MediaPing> {
    const client = new RoomServiceClient(this.creds.url, this.creds.apiKey, this.creds.apiSecret, {
      requestTimeout: timeoutMs / 1000,
      failover: false,
    });
    const startedAt = Date.now();
    const rooms = await this.call("ping", () => client.listRooms());
    return { latencyMs: Date.now() - startedAt, rooms: rooms.length };
  }
}

let instance: IMediaServer | null = null;

/**
 * Adapter hiện hành (lazy singleton): cấu hình đủ → `LiveKitMediaServer`, thiếu → `NoopMediaServer`
 * (mọi thao tác `MEDIA_001`, không mạng). Module nghiệp vụ LUÔN lấy qua đây — không `new` adapter, không import SDK.
 */
export function getLiveKit(): IMediaServer {
  if (!instance) {
    instance = isLiveKitConfigured() ? new LiveKitMediaServer(getLiveKitApiCredentials()) : new NoopMediaServer();
  }
  return instance;
}

/** Test: ép adapter (vd `InMemoryMediaServer`); `null` = xoá singleton để chọn lại theo env. */
export function setMediaServerForTests(server: IMediaServer | null): void {
  instance = server;
}
