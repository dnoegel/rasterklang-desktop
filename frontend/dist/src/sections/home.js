import { el, svg } from "../lib/ui.js";
import { playTrack } from "../lib/catalog.js?v=dev";
import { entityCard, sectionHead, trackTable, typeLabel } from "../lib/view-components.js?v=dev";

export function mount(host, ctx) {
  const classics = ctx.catalog.featuredTracks;
  host.append(hero(ctx, classics));

  host.append(sectionHead("HVSC Picks", "Directly playable classics from the local collection"));
  host.append(trackTable(ctx, classics, { limit: 18, queue: classics }));

  host.append(sectionHead("Artists", "Composers and crews with large HVSC catalogs"));
  const artistGrid = el("div", { class: "entity-grid" });
  for (const artist of ctx.catalog.topArtists.slice(0, 18)) {
    artistGrid.append(entityCard({
      title: artist.name,
      subtitle: `${artist.trackCount.toLocaleString("en-US")} Tracks`,
      kind: typeLabel(artist.type),
      seed: artist.id,
      onclick: () => ctx.router.navigate("artist", { id: artist.id }),
    }));
  }
  host.append(artistGrid);

  host.append(sectionHead("Games", "Games as first-class profiles"));
  const gameGrid = el("div", { class: "entity-grid" });
  for (const artist of ctx.catalog.topGames.slice(0, 12)) {
    gameGrid.append(entityCard({
      title: artist.name,
      subtitle: `${artist.trackCount.toLocaleString("en-US")} Tracks`,
      kind: "Game",
      seed: artist.id,
      onclick: () => ctx.router.navigate("artist", { id: artist.id }),
    }));
  }
  host.append(gameGrid);
}

function hero(ctx, classics) {
  const first = classics[0];
  const brandName = ctx.brandName || "Rasterklang";
  return el("section", { class: "web-hero" }, [
    el("div", { class: "web-hero__copy" }, [
      el("p", { class: "kicker" }, "High Voltage SID Collection"),
      el("h1", {}, brandName),
      el("p", {}, "Your local HVSC as a player library with search, artists, games, demos, favorites, and live Insight."),
      el("div", { class: "hero-actions" }, [
        el("button", { class: "btn btn--accent", onclick: () => first && playTrack(ctx, first, classics) }, [svg("play", 16), "Play"]),
        el("button", { class: "btn btn--ghost", onclick: () => ctx.router.navigate("search") }, [svg("search", 16), "Search"]),
      ]),
    ]),
    el("div", { class: "hero-metrics" }, [
      metric("Tracks", ctx.library.trackCount.toLocaleString("en-US")),
      metric("Artists", ctx.catalog.artists.filter((artist) => artist.type === "artist").length.toLocaleString("en-US")),
      metric("Games", ctx.catalog.games.length.toLocaleString("en-US")),
    ]),
  ]);
}

function metric(label, value) {
  return el("div", { class: "hero-metric" }, [
    el("strong", {}, value),
    el("span", {}, label),
  ]);
}
