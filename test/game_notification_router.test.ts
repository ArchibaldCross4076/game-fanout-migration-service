import test from "node:test";
import assert from "node:assert/strict";
import { routeGameNotification } from "../src/game_notification_router.js";

test("public spray asset goes to player-facing feed and moderation queue", () => {
  const result = routeGameNotification({
    kind: "asset.created",
    payload: {
      eventId: "evt_123",
      playerId: "player_alpha",
      assetId: "asset_spray_fire",
      assetKind: "spray",
      visibility: "public",
      tags: [],
      createdAt: "2026-01-05T12:00:00Z"
    }
  });

  assert.deepEqual(result, [
    {
      subscriber: "asset-feed",
      dedupeKey: "asset-feed:evt_123",
      payload: {
        kind: "asset.created",
        assetId: "asset_spray_fire",
        playerId: "player_alpha",
        assetKind: "spray",
        createdAt: "2026-01-05T12:00:00Z"
      }
    },
    {
      subscriber: "moderation",
      dedupeKey: "moderation:evt_123",
      payload: {
        kind: "moderation.asset_review_requested",
        assetId: "asset_spray_fire",
        playerId: "player_alpha",
        reason: "spray_review",
        createdAt: "2026-01-05T12:00:00Z"
      }
    }
  ]);
});
