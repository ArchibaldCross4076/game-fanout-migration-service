import { ensureSubscriberQueues, fanoutEvent } from "./queue_fanout_service.js";

async function main(): Promise<void> {
  await ensureSubscriberQueues();

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

  console.log(JSON.stringify({ published }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
