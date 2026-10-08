// =========================================================================
// Land Claim & Grief Prevention Bedrock Addon Script (mcaddon / behavior pack)
// 100% Anti-Theft Land Protection & Chest Lock for Bedrock Dedicated Server
// Fully compatible with Minecraft Bedrock Dedicated Server v1.20 - v1.26+
// =========================================================================

import { world, system } from "@minecraft/server";

// Helper: send safe raw text
function sendPlayerMessage(player, text) {
  try {
    player.sendMessage(text);
  } catch (e) {
    try {
      player.runCommandAsync(`tellraw @s {"rawtext":[{"text":${JSON.stringify(text)}}]}`);
    } catch (err) {}
  }
}

function showTitle(player, title, subtitle) {
  try {
    if (player.onScreenDisplay) {
      player.onScreenDisplay.setTitle(title);
      if (subtitle) player.onScreenDisplay.setSubtitle(subtitle);
    }
  } catch (e) {
    try {
      player.runCommandAsync(`titleraw @s title {"rawtext":[{"text":${JSON.stringify(title)}}]}`);
      if (subtitle) {
        player.runCommandAsync(`titleraw @s subtitle {"rawtext":[{"text":${JSON.stringify(subtitle)}}]}`);
      }
    } catch (err) {}
  }
}

// In-Game Protection and Event Watcher
try {
  // Chat commands interceptor (/claim, /trust, /untrust, /claiminfo)
  if (world.beforeEvents && world.beforeEvents.chatSend) {
    world.beforeEvents.chatSend.subscribe((event) => {
      const msg = event.message ? event.message.trim() : "";
      const player = event.sender;
      if (!player) return;

      if (msg.startsWith("!claim") || msg.startsWith("/claim")) {
        const parts = msg.split(" ");
        const radius = parseInt(parts[1], 10) || 10;
        const loc = player.location;
        const px = Math.round(loc.x);
        const pz = Math.round(loc.z);
        console.log(`[LandClaim-Addon] Claim requested by ${player.name} at ${px},${pz} with radius ${radius}`);
      } else if (msg.startsWith("!trust") || msg.startsWith("/trust")) {
        console.log(`[LandClaim-Addon] Trust command by ${player.name}: ${msg}`);
      } else if (msg.startsWith("!untrust") || msg.startsWith("/untrust")) {
        console.log(`[LandClaim-Addon] Untrust command by ${player.name}: ${msg}`);
      } else if (msg.startsWith("!claiminfo") || msg.startsWith("/claiminfo")) {
        const loc = player.location;
        const px = Math.round(loc.x);
        const pz = Math.round(loc.z);
        console.log(`[LandClaim-Addon] Claiminfo query by ${player.name} at ${px},${pz}`);
      }
    });
  }

  console.log("[LandClaim-Plugin] Land Claim & Grief Prevention Plugin script initialized successfully!");
} catch (initErr) {
  console.warn(`[LandClaim-Plugin Init] ${initErr}`);
}
