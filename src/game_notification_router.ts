import { z } from "zod";

export const AssetCreatedEventSchema = z.object({
  eventId: z.string().min(1),
  playerId: z.string().min(1),
  assetId: z.string().min(1),
  assetKind: z.enum(["map", "skin", "spray"]),
  visibility: z.enum(["private", "friends", "public"]),
  tags: z.array(z.string()).default([]),
  createdAt: z.string().min(1)
});

export const LiveMatchEventSchema = z.object({
  eventId: z.string().min(1),
  matchId: z.string().min(1),
  playerId: z.string().min(1),
  eventType: z.enum(["kill", "assist", "objective", "chat"]),
  importance: z.enum(["low", "high"]),
  createdAt: z.string().min(1)
});

export const ModerationFlagEventSchema = z.object({
  eventId: z.string().min(1),
  playerId: z.string().min(1),
  assetId: z.string().min(1).optional(),
  reason: z.enum(["hate_speech", "harassment", "cheat_ad", "sexual_content"]),
  severity: z.enum(["review", "urgent"]),
  createdAt: z.string().min(1)
});

export const GameDomainEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("asset.created"), payload: AssetCreatedEventSchema }),
  z.object({ kind: z.literal("match.live_event"), payload: LiveMatchEventSchema }),
  z.object({ kind: z.literal("moderation.flagged"), payload: ModerationFlagEventSchema })
]);

export type GameDomainEvent = z.infer<typeof GameDomainEventSchema>;

export type FanoutMessage = {
  subscriber: "asset-feed" | "live-ops" | "moderation";
  dedupeKey: string;
  payload: Record<string, unknown>;
};

export function routeGameNotification(input: unknown): FanoutMessage[] {
  const event = GameDomainEventSchema.parse(input);

  if (event.kind === "asset.created") {
    const messages: FanoutMessage[] = [];

    if (event.payload.visibility === "public") {
      messages.push({
        subscriber: "asset-feed",
        dedupeKey: `asset-feed:${event.payload.eventId}`,
        payload: {
          kind: event.kind,
          assetId: event.payload.assetId,
          playerId: event.payload.playerId,
          assetKind: event.payload.assetKind,
          createdAt: event.payload.createdAt
        }
      });
    }

    const requiresReview = event.payload.tags.includes("ugc-report") || event.payload.assetKind === "spray";
    if (requiresReview) {
      messages.push({
        subscriber: "moderation",
        dedupeKey: `moderation:${event.payload.eventId}`,
        payload: {
          kind: "moderation.asset_review_requested",
          assetId: event.payload.assetId,
          playerId: event.payload.playerId,
          reason: event.payload.tags.includes("ugc-report") ? "player_report" : "spray_review",
          createdAt: event.payload.createdAt
        }
      });
    }

    return messages;
  }

  if (event.kind === "match.live_event") {
    if (event.payload.importance === "high") {
      return [
        {
          subscriber: "live-ops",
          dedupeKey: `live-ops:${event.payload.eventId}`,
          payload: {
            kind: event.kind,
            matchId: event.payload.matchId,
            playerId: event.payload.playerId,
            eventType: event.payload.eventType,
            importance: event.payload.importance,
            createdAt: event.payload.createdAt
          }
        }
      ];
    }

    return [];
  }

  return [
    {
      subscriber: "moderation",
      dedupeKey: `moderation:${event.payload.eventId}`,
      payload: {
        kind: event.kind,
        playerId: event.payload.playerId,
        assetId: event.payload.assetId,
        reason: event.payload.reason,
        severity: event.payload.severity,
        createdAt: event.payload.createdAt
      }
    }
  ];
}
