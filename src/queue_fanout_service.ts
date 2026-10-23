import { infrai } from "./infrai.js";
import { FanoutMessage, GameDomainEvent, routeGameNotification } from "./game_notification_router.js";

export type PublishRecord = {
  subscriber: FanoutMessage["subscriber"];
  idempotencyKey: string;
  payload: Record<string, unknown>;
};

export type QueuePublisher = (record: PublishRecord) => Promise<void>;

export async function ensureSubscriberQueues(): Promise<void> {
  for (const queueName of ["asset-feed", "live-ops", "moderation"]) {
    await infrai.queue.create({ name: queueName });
  }
}

export async function fanoutEvent(event: GameDomainEvent, publish: QueuePublisher = publishToInfrai): Promise<PublishRecord[]> {
  const routed = routeGameNotification(event);
  const published: PublishRecord[] = [];

  for (const message of routed) {
    const record: PublishRecord = {
      subscriber: message.subscriber,
      idempotencyKey: message.dedupeKey,
      payload: {
        subscriber: message.subscriber,
        idempotencyKey: message.dedupeKey,
        event: message.payload
      }
    };

    await publish(record);
    published.push(record);
  }

  return published;
}

export async function publishToInfrai(record: PublishRecord): Promise<void> {
  await infrai.queue.publish({
    queue: record.subscriber,
    payload: record
  });
}

export async function drainModerationQueue(maxMessages = 5): Promise<Array<{ message_id: string; payload: unknown }>> {
  const result = await infrai.queue.consume({
    queue: "moderation",
    max_messages: maxMessages,
    visibility_timeout: 30
  });

  const messages = result.messages || [];
  for (const message of messages) {
    await infrai.queue.ack({ queue: "moderation", message_id: message.message_id });
  }
  return messages;
}
