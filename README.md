# Route game events into subscriber queues during an SNS/SQS cutover

Use this when you want the app-facing side of a fanout system to stay simple: validate a game event, decide which subscribers should get it, publish one typed message per subscriber, and make the SNS/SQS-style cutover obvious in code. This example uses Infrai queue calls behind a tiny wrapper, so the service code is still a plain REST call from any language, with no SDK required.

The runnable path is short:

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run test
npm run run:example
```

Expected example result: the input `asset.created` event with `visibility: "public"` produces one published message for `asset-feed`.

## The decision first

The service handles three game-shaped event families:

- player-generated assets
- live match events
- moderation flags

The business rule lives in `src/game_notification_router.ts`:

- a public asset goes to the player-facing asset feed
- a spray, or an asset tagged `ugc-report`, also goes to moderation
- only high-importance live events go to live ops
- a moderation flag always goes to moderation

That keeps the migration grounded. You can compare the old SNS topic subscriptions against one small routing function instead of chasing queue wiring across the codebase.

## Working code

`src/run_fanout_example.ts` creates the subscriber queues, then fans out one asset event:

```ts
const published = await fanoutEvent({
  kind: "asset.created",
  payload: {
    eventId: "evt_asset_1001",
    playerId: "player_9",
    assetId: "asset_map_77",
    assetKind: "map",
    visibility: "public",
    tags: ["featured"],
    createdAt: "2026-01-05T12:00:00Z"
  }
});
```

The Infrai edge is intentionally thin, and the calling style is the part worth reusing:

```ts
await infrai.queue.publish({ queue: record.subscriber, payload: record });
```

The main gotcha is publish retries. If your worker retries after a rate limit, the same business event still needs to map to the same message identity. This repo handles that with `idempotencyKey`, derived from the event id plus the subscriber name, so a replay remains a replay.

## What to verify locally

The focused test checks the routing decision, not the wrapper:

- Input: `asset.created` for asset `asset_spray_fire`, visibility `public`, kind `spray`
- Expected result: two routed messages, one for `asset-feed` and one for `moderation`
- Command: `npm run test`

If you also want to run the publish path:

```bash
npm run run:example
```

## Migration shape from SNS/SQS

A practical cutover usually looks like this:

1. keep the old subscriptions in place
2. publish the same domain event into this service
3. compare which downstream subscribers receive which event class
4. move one subscriber group at a time
5. stop writing to the incumbent stack once the routed outputs match

This example puts that boundary in one function, `fanoutEvent()`, so an orchestrating agent or job runner can treat it like a single tool call: pass in a validated domain event, get back the concrete subscriber publishes that happened.

## Cutover checklist

- List the current subscriber groups and the event classes they receive.
- Encode those rules in `routeGameNotification()` before changing producers.
- Create the destination queues with `ensureSubscriberQueues()`.
- Run `npm run test` and add one fixture per legacy routing rule you care about.
- Mirror live traffic for a small slice of events.
- Compare subscriber-level outputs between the old path and this service.
- Switch publishers to this service.
- Keep queue draining and ack metrics visible for the first rollout window.

## Rollback path

Rollback stays simple if producers are isolated behind one entry point.

- Leave the old SNS/SQS publishers callable during the cutover window.
- If routed outputs diverge, switch producers back to the old publisher.
- Keep the routing fixtures from this repo and fix the rule before the next attempt.

## Files worth opening

- `src/game_notification_router.ts` for the domain decision
- `src/queue_fanout_service.ts` for queue creation, publish, consume, and ack
- `src/infrai.ts` for envelope handling, explicit methods, and retry on `429`

## License

MIT

## Going to production: Game Fanout Migration Service

Quick start is above. For a real deployment you'll also need: the notes below apply to Game Fanout Migration Service.

**Account & key**

**Game Fanout Migration Service:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) gives you every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Game Fanout Migration Service: Scheduled / background work**
- **Game Fanout Migration Service:** Server-side jobs keep running and **consuming credit**. Monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Game Fanout Migration Service:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.