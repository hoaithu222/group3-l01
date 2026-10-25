import { AssetsPortAdapter } from "./adapters/meeting-assets.adapter";
import { PrismaAdminRecordingReader, type IAdminRecordingReader } from "./repositories/admin-recording.reader";
import { AdminRecordingService } from "./services/admin-recording.service";
import type { MeetingRoomKit } from "./meeting-room.container";
import type { MeetingAssetsPort } from "./services/meeting-assets.port";
import type { NotifyFn } from "./services/meeting-event.handler";
import { MeetingRecapRecordingEvents } from "./services/meeting-recap-recording.events";
import { MeetingRecapService } from "./services/meeting-recap.service";
import { MeetingRecordingService } from "./services/meeting-recording.service";
import type { SystemMessagePoster } from "./services/meeting-reminder.service";
import { RecordingConsentService } from "./services/recording-consent.service";
import { RecordingConsentStore } from "./services/recording-consent.store";
import { RecordingEgressHandler } from "./services/recording-egress.handler";
import { RecordingGuards } from "./services/recording-guards";
import { RecordingImportService } from "./services/recording-import.service";
import { RecordingLifecycle } from "./services/recording-lifecycle.service";
import { RecordingMaintenanceService } from "./services/recording-maintenance.service";
import { RecordingSignals } from "./services/recording-signals";
import { EnvRecordingCapability, InfraRecordingStorage, loadRecordingLimits, type RecordingCapability, type RecordingRuntimeLimits, type RecordingStoragePort } from "./services/recording-runtime";

export interface RecapRecordingOverrides {
  /** Cổng sang module `assets` — mặc định `AssetsPortAdapter` (`@modules/assets/public`). */
  assets?: MeetingAssetsPort;
  /** Storage của tệp ghi hình (head/ký URL/xoá) — mặc định `storage` (S3); test dùng bản giả. */
  recordingStorage?: RecordingStoragePort;
  /** Ghi hình có dùng được không (hạ tầng S3 + cờ) — mặc định đọc env/SystemConfig. */
  recordingCapability?: RecordingCapability;
  recordingLimits?: () => Promise<RecordingRuntimeLimits>;
  /** Bộ đọc bản ghi hình cho admin (chỉ metadata) — mặc định Prisma. */
  adminRecordingReader?: IAdminRecordingReader;
}

export interface RecapRecordingKit {
  signals: RecordingSignals;
  recap: MeetingRecapService;
  consent: RecordingConsentService;
  recording: MeetingRecordingService;
  lifecycle: RecordingLifecycle;
  egress: RecordingEgressHandler;
  importer: RecordingImportService;
  maintenance: RecordingMaintenanceService;
  /** Sink `meeting.events` (ended / recap-published / recording-ready) + nhắc biên bản. */
  events: MeetingRecapRecordingEvents;
  assets: MeetingAssetsPort;
  storage: RecordingStoragePort;
  /** Giám sát bản ghi hình cho admin nền tảng (p2-06 admin.md): danh sách/tóm tắt/chi tiết chỉ metadata + xoá có lý do. */
  admin: AdminRecordingService;
}

/**
 * Dựng phần BIÊN BẢN & GHI HÌNH (p2-06) trên deps của phòng họp — tách khỏi `meetings.container.ts` như `createMeetingRoomKit`. Tương tác với module khác chỉ qua cổng:
 * `MeetingAssetsPort` (assets), `MeetingCallPort` (calls, có sẵn ở `room.deps`), `getLiveKit()` (Egress), `RecordingStoragePort` (storage), `SystemMessagePoster` (messages).
 */
export function createRecapRecordingKit(room: MeetingRoomKit, notifyFn: NotifyFn, messages: SystemMessagePoster, o: RecapRecordingOverrides = {}): RecapRecordingKit {
  const d = room.deps;
  const assets = o.assets ?? new AssetsPortAdapter();
  const storage = o.recordingStorage ?? new InfraRecordingStorage();
  const capability = o.recordingCapability ?? new EnvRecordingCapability();
  const limits = o.recordingLimits ?? loadRecordingLimits;

  const signals = new RecordingSignals(d, room.access);
  const guards = new RecordingGuards(d, capability, limits);
  const store = new RecordingConsentStore(d.store.port);
  const lifecycle = new RecordingLifecycle(d, signals, assets, limits);
  const consent = new RecordingConsentService(d, store, guards, signals, limits);
  const recording = new MeetingRecordingService(d, guards, consent, store, lifecycle, storage, capability, limits);
  const egress = new RecordingEgressHandler(d, lifecycle);
  return {
    signals,
    recap: new MeetingRecapService(d, assets, limits),
    consent,
    recording,
    lifecycle,
    egress,
    importer: new RecordingImportService(d, lifecycle, assets, storage, limits),
    maintenance: new RecordingMaintenanceService(d, lifecycle, egress, limits),
    events: new MeetingRecapRecordingEvents(d, notifyFn, messages, recording, signals),
    assets,
    storage,
    admin: new AdminRecordingService(o.adminRecordingReader ?? new PrismaAdminRecordingReader(), d.recordings, lifecycle, storage, d.audit, d.now),
  };
}
