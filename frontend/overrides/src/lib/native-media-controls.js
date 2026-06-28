import { playNextTrack, playPrevTrack } from "./catalog.js?v=dev";

export const NATIVE_MEDIA_CONTROL_EVENT = "native.media-control";

export function mountNativeMediaControls(ctx, runtime = globalThis.window?.runtime || globalThis.runtime) {
  if (!ctx?.native || typeof runtime?.EventsOn !== "function") return () => {};
  const stop = runtime.EventsOn(NATIVE_MEDIA_CONTROL_EVENT, (command) => {
    handleNativeMediaControl(ctx, command).catch((error) => {
      ctx.toast?.error?.(`Media key failed: ${error.message || error}`);
    });
  });
  return typeof stop === "function" ? stop : () => {};
}

export async function handleNativeMediaControl(ctx, rawCommand) {
  const command = String(rawCommand || "").toLowerCase();
  const transport = ctx.transport || createNativeMediaTransport(ctx);
  switch (command) {
    case "play":
      await transport.play();
      return true;
    case "pause":
      await transport.pause();
      return true;
    case "toggle":
      await transport.togglePlay();
      return true;
    case "next":
      await transport.next();
      return true;
    case "previous":
      await transport.previous();
      return true;
    default:
      return false;
  }
}

function createNativeMediaTransport(ctx) {
  return {
    play: () => playFromMediaKey(ctx),
    pause: () => pauseFromMediaKey(ctx),
    togglePlay: () => toggleFromMediaKey(ctx),
    next: () => nextFromMediaKey(ctx),
    previous: () => previousFromMediaKey(ctx),
  };
}

async function playFromMediaKey(ctx) {
  if (!ctx.engine?.getCurrentTune?.()) {
    ctx.toast?.warn?.("No track loaded.");
    return false;
  }
  if (ctx.engine.isPlaying?.()) return true;
  if (ctx.engine.isPaused?.()) {
    await ctx.engine.pause();
    return true;
  }
  await ctx.engine.play({ subtune: ctx.engine.getSubtune?.() || 1 });
  return true;
}

async function pauseFromMediaKey(ctx) {
  if (!ctx.engine?.isPlaying?.()) return false;
  await ctx.engine.pause();
  return true;
}

async function toggleFromMediaKey(ctx) {
  if (!ctx.engine?.getCurrentTune?.()) {
    ctx.toast?.warn?.("No track loaded.");
    return false;
  }
  if (ctx.engine.isPlaying?.() || ctx.engine.isPaused?.()) {
    await ctx.engine.pause();
    return true;
  }
  await ctx.engine.play({ subtune: ctx.engine.getSubtune?.() || 1 });
  return true;
}

async function nextFromMediaKey(ctx) {
  const ok = await playNextTrack(ctx);
  if (!ok) ctx.toast?.warn?.("No active queue.");
  return ok;
}

async function previousFromMediaKey(ctx) {
  const ok = await playPrevTrack(ctx);
  if (!ok) ctx.toast?.warn?.("No active queue.");
  return ok;
}
