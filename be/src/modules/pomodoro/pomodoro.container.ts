import { getLiveKit } from "../../infrastructure/media";
import { CallsRoomAdapter } from "./adapters/calls-room.adapter";
import { QueuePomodoroJobs } from "./jobs/pomodoro.queue";
import { SocketPomodoroBroadcaster, type PomodoroSocketPort } from "./realtime/pomodoro.broadcaster";
import { PermissionPomodoroAccess, PrismaPomodoroChannelReader } from "./repositories/pomodoro-channel.reader";
import { PrismaPomodoroRepository } from "./repositories/pomodoro.repository.prisma";
import type { IPomodoroRepository } from "./repositories/pomodoro.repository.interface";
import { PrismaOutboxPort, PrismaTxRunner, type IOutboxPort, type ITxRunner } from "./repositories/tx";
import { NodeRedisPomodoroPort, PomodoroCommandStore, type PomodoroRedisPort } from "./services/pomodoro-command.store";
import { PomodoroJoinService } from "./services/pomodoro-join.service";
import { PomodoroLiveKitHandler } from "./services/pomodoro-livekit.handler";
import { PomodoroMediaSync } from "./services/pomodoro-media-sync.service";
import { PomodoroPresenceService } from "./services/pomodoro-presence.service";
import { PomodoroRunner } from "./services/pomodoro-runner.service";
import { PomodoroSnapshotBuilder } from "./services/pomodoro-snapshot";
import { PomodoroTransitions } from "./services/pomodoro-transition.service";
import { PomodoroService } from "./services/pomodoro.service";
import type { IPomodoroAccess, IPomodoroChannelReader, IPomodoroJobs, PomodoroCallPort, PomodoroDeps } from "./services/pomodoro.ports";

export interface PomodoroContainerOverrides {
  repo?: IPomodoroRepository;
  tx?: ITxRunner;
  outbox?: IOutboxPort;
  calls?: PomodoroCallPort;
  channels?: IPomodoroChannelReader;
  access?: IPomodoroAccess;
  redisPort?: PomodoroRedisPort;
  jobs?: IPomodoroJobs;
  socket?: PomodoroSocketPort;
  now?: () => Date;
}

export interface PomodoroContainer {
  deps: PomodoroDeps;
  service: PomodoroService;
  join: PomodoroJoinService;
  presence: PomodoroPresenceService;
  runner: PomodoroRunner;
  media: PomodoroMediaSync;
  transitions: PomodoroTransitions;
  snapshots: PomodoroSnapshotBuilder;
  broadcaster: SocketPomodoroBroadcaster;
  livekit: PomodoroLiveKitHandler;
}

/** Dựng toàn bộ đồ thị phụ thuộc (DI thủ công) — dùng chung routes (API) và job (worker), như `getCallsContainer()`. */
export function createPomodoroContainer(o: PomodoroContainerOverrides = {}): PomodoroContainer {
  const repo = o.repo ?? new PrismaPomodoroRepository();
  const channels = o.channels ?? new PrismaPomodoroChannelReader();
  const access = o.access ?? new PermissionPomodoroAccess();
  const calls = o.calls ?? new CallsRoomAdapter();
  const now = o.now ?? (() => new Date());
  const commands = new PomodoroCommandStore(o.redisPort ?? new NodeRedisPomodoroPort());
  const snapshots = new PomodoroSnapshotBuilder({ repo, calls, channels, access, now });
  const broadcaster = new SocketPomodoroBroadcaster(repo, snapshots, o.socket);
  const deps: PomodoroDeps = {
    repo,
    tx: o.tx ?? new PrismaTxRunner(),
    outbox: o.outbox ?? new PrismaOutboxPort(),
    calls,
    channels,
    access,
    commands,
    jobs: o.jobs ?? new QueuePomodoroJobs(),
    broadcaster,
    media: () => getLiveKit(),
    now,
  };
  const media = new PomodoroMediaSync(deps);
  const transitions = new PomodoroTransitions(deps, media);
  const presence = new PomodoroPresenceService(deps, media);
  const runner = new PomodoroRunner(deps, transitions, media);
  return {
    deps,
    service: new PomodoroService(deps, snapshots, transitions),
    join: new PomodoroJoinService(deps, snapshots, transitions),
    presence,
    runner,
    media,
    transitions,
    snapshots,
    broadcaster,
    livekit: new PomodoroLiveKitHandler(repo, presence, runner),
  };
}

let container: PomodoroContainer | null = null;

export function getPomodoroContainer(): PomodoroContainer {
  container ??= createPomodoroContainer();
  return container;
}

/** Test: thay container (`null` = dựng lại mặc định lần sau). */
export function setPomodoroContainerForTests(next: PomodoroContainer | null): void {
  container = next;
}
