import { runtimeConfig } from "../../core/config/runtime-config";
import { SUB_FEATURES } from "../../core/constants/modules";
import type { IResourceCreationPort } from "../../shared/ports/resource-creation.port";
import type { ITaskCreationPort } from "../../shared/ports/task-creation.port";
import { createMessageSendPort } from "../messages/public";
import { createTaskCreationPort } from "../projects";
import { createResourceCreationPort } from "../resources/public";
import { PrismaChatDirectory } from "./repositories/chat-directory.prisma";
import { PrismaMessageReminderRepository } from "./repositories/message-reminder.repository.prisma";
import { PrismaPollVoteRepository } from "./repositories/poll-vote.repository.prisma";
import { PrismaPollRepository } from "./repositories/poll.repository.prisma";
import { PrismaScheduledMessageRepository } from "./repositories/scheduled-message.repository.prisma";
import { PrismaOutboxPort, PrismaTxRunner } from "./repositories/tx";
import {
  DefaultChatPermissionGate,
  NotifyChatNotifier,
  PublicScheduledAssetPort,
  QueueJobEnqueuer,
  RedisEmitThrottle,
  SocketChatEmitter,
} from "./services/chat-extensions-adapters";
import { ChatExtensionsSweepService } from "./services/chat-extensions-sweep.service";
import { ChatExtensionsUserDataService } from "./services/chat-extensions-user-data.service";
import { MessageConversionService } from "./services/message-conversion.service";
import { MessageReminderService } from "./services/message-reminder.service";
import { PollPublisher } from "./services/poll-publisher";
import { PollReaderService } from "./services/poll-reader.service";
import { PollService } from "./services/poll.service";
import { ScheduledMessageDispatchService } from "./services/scheduled-message-dispatch.service";
import { ScheduledMessageService } from "./services/scheduled-message.service";

export interface ChatExtensionsContainerOptions {
  /** Cổng tạo thẻ (mặc định `projects` — dựng LƯỜI lúc dùng đầu để không nạp cả đồ thị `projects` khi import routes). */
  tasks?: ITaskCreationPort;
  /** Cổng lưu tài liệu (mặc định `resources` — dựng LƯỜI lúc dùng đầu, cùng lý do như `tasks`). */
  resources?: IResourceCreationPort;
}

/**
 * Nối dây DI cho module mở rộng chat — dùng CHUNG bởi `chat-extensions.routes.ts` và các job (tiến trình worker riêng không import routes nên dùng `getChatExtensionsContainer()`).
 * Không có DI container trong codebase (architecture.md).
 */
export function createChatExtensionsContainer(opts: ChatExtensionsContainerOptions = {}) {
  const polls = new PrismaPollRepository();
  const votes = new PrismaPollVoteRepository();
  const scheduled = new PrismaScheduledMessageRepository();
  const reminderRepo = new PrismaMessageReminderRepository();
  const directory = new PrismaChatDirectory();
  const tx = new PrismaTxRunner();
  const outbox = new PrismaOutboxPort();
  const sender = createMessageSendPort();
  const emitter = new SocketChatEmitter();
  const assets = new PublicScheduledAssetPort();
  const notifier = new NotifyChatNotifier();
  const gate = new DefaultChatPermissionGate();

  const publisher = new PollPublisher(polls, emitter, new RedisEmitThrottle());
  const pollService = new PollService({ polls, votes, directory, sender, gate, publisher, tx, outbox });
  const dispatch = new ScheduledMessageDispatchService({
    scheduled,
    sender,
    directory,
    assets,
    notifier,
    emitter,
    tx,
    subFeatureEnabled: () => runtimeConfig.isSubFeatureEnabled(SUB_FEATURES.SCHEDULED_MESSAGES),
  });
  const scheduledService = new ScheduledMessageService({ scheduled, sender, gate, assets, directory, dispatcher: dispatch, emitter, tx, outbox });
  const reminders = new MessageReminderService({ reminders: reminderRepo, sender, directory, notifier, tx, outbox });

  let lazyTasks: ITaskCreationPort | null = null;
  const taskPort = (): ITaskCreationPort => (lazyTasks ??= opts.tasks ?? createTaskCreationPort());
  let lazyResources: IResourceCreationPort | null = null;
  const resourcePort = (): IResourceCreationPort => (lazyResources ??= opts.resources ?? createResourceCreationPort());
  const conversion = new MessageConversionService({
    sender,
    directory,
    tasks: { assertCanCreate: (actor, boardId) => taskPort().assertCanCreate(actor, boardId), createFromMessage: (input) => taskPort().createFromMessage(input) },
    resources: {
      assertCanUpload: (actor, workspaceId) => resourcePort().assertCanUpload(actor, workspaceId),
      createFromExistingAsset: (input) => resourcePort().createFromExistingAsset(input),
    },
  });

  return {
    polls: pollService,
    pollPublisher: publisher,
    /** Bản đọc khảo sát cho `MessageView.poll` (đăng ký vào `shared/ports/message-poll-reader.port` ở `registerChatExtensionsModule()`). */
    pollReader: new PollReaderService(polls, votes),
    scheduled: scheduledService,
    dispatch,
    reminders,
    conversion,
    sweep: new ChatExtensionsSweepService(scheduled, reminderRepo, pollService, new QueueJobEnqueuer()),
    userData: new ChatExtensionsUserDataService(scheduled, reminderRepo, votes, assets, tx),
  };
}

export type ChatExtensionsContainer = ReturnType<typeof createChatExtensionsContainer>;

let cached: ChatExtensionsContainer | null = null;

/** Singleton lười cho job/route (tránh dựng lại repo/service mỗi lần). */
export function getChatExtensionsContainer(): ChatExtensionsContainer {
  cached ??= createChatExtensionsContainer();
  return cached;
}
