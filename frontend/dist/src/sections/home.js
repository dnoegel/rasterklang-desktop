import { el, svg } from "../lib/ui.js";
import { playTrack } from "../lib/catalog.js?v=2026-05-01-084125";
import { entityCard, sectionHead, trackTable, typeLabel } from "../lib/view-components.js?v=2026-05-01-084125";

export function mount(host, ctx) {
  const classics = ctx.catalog.featuredTracks;
  host.append(hero(ctx, classics));

  host.append(sectionHead("HVSC Picks", "Direkt abspielbare Klassiker aus der lokalen Sammlung"));
  host.append(trackTable(ctx, classics, { limit: 18, queue: classics }));

  host.append(sectionHead("Interpreten", "Komponisten und Crews mit grossem HVSC-Katalog"));
  const artistGrid = el("div", { class: "entity-grid" });
  for (const artist of ctx.catalog.topArtists.slice(0, 18)) {
    artistGrid.append(entityCard({
      title: artist.name,
      subtitle: `${artist.trackCount.toLocaleString("de-DE")} Tracks`,
      kind: typeLabel(artist.type),
      seed: artist.id,
      onclick: () => ctx.router.navigate("artist", { id: artist.id }),
    }));
  }
  host.append(artistGrid);

  host.append(sectionHead("Games", "Spiele als eigene Profile"));
  const gameGrid = el("div", { class: "entity-grid" });
  for (const artist of ctx.catalog.topGames.slice(0, 12)) {
    gameGrid.append(entityCard({
      title: artist.name,
      subtitle: `${artist.trackCount.toLocaleString("de-DE")} Tracks`,
      kind: "Game",
      seed: artist.id,
      onclick: () => ctx.router.navigate("artist", { id: artist.id }),
    }));
  }
  host.append(gameGrid);
}

function hero(ctx, classics) {
  const first = classics[0];
  const brandName = ctx.brandName || "zmk-webplayer";
  return el("section", { class: "web-hero" }, [
    el("div", { class: "web-hero__copy" }, [
      el("p", { class: "kicker" }, "High Voltage SID Collection"),
      el("h1", {}, brandName),
      el("p", {}, "Die lokale HVSC als Player-Bibliothek mit Suche, Interpreten, Games, Demos, Favoriten und Live-Insight."),
      el("div", { class: "hero-actions" }, [
        el("button", { class: "btn btn--accent", onclick: () => first && playTrack(ctx, first, classics) }, [svg("play", 16), "Abspielen"]),
        el("button", { class: "btn btn--ghost", onclick: () => ctx.router.navigate("search") }, [svg("search", 16), "Suchen"]),
      ]),
    ]),
    el("div", { class: "hero-metrics" }, [
      metric("Tracks", ctx.library.trackCount.toLocaleString("de-DE")),
      metric("Interpreten", ctx.catalog.artists.filter((artist) => artist.type === "artist").length.toLocaleString("de-DE")),
      metric("Games", ctx.catalog.games.length.toLocaleString("de-DE")),
    ]),
  ]);
}

function metric(label, value) {
  return el("div", { class: "hero-metric" }, [
    el("strong", {}, value),
    el("span", {}, label),
  ]);
}
