import { verifyLiveKitWebhook } from "../../infrastructure/media";
import { BullLiveKitEventQueue, type ILiveKitEventQueue } from "./livekit-event.queue";
import { LiveKitEventProcessor } from "./livekit-event.processor";
import { LiveKitWebhookService } from "./livekit-webhook.service";
import { PrismaWebhookEventRepository, type IWebhookEventRepository } from "./webhook-event.repo";

export interface WebhooksContainer {
  repo: IWebhookEventRepository;
  queue: ILiveKitEventQueue;
  service: LiveKitWebhookService;
  processor: LiveKitEventProcessor;
}

let container: WebhooksContainer | null = null;

/** DI dùng chung route (API) và job (worker — tiến trình riêng không import `router.ts`). */
export function getWebhooksContainer(): WebhooksContainer {
  if (!container) {
    const repo = new PrismaWebhookEventRepository();
    const queue = new BullLiveKitEventQueue();
    container = {
      repo,
      queue,
      service: new LiveKitWebhookService({ repo, queue, verify: verifyLiveKitWebhook }),
      processor: new LiveKitEventProcessor(repo),
    };
  }
  return container;
}
