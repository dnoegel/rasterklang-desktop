import { clear, el, svg } from "../lib/ui.js";
import { playTrack } from "../lib/catalog.js?v=dev";
import { cover, pill, sectionHead, trackTable, tuneTypeSelect, typeLabel } from "../lib/view-components.js?v=dev";

export function mount(host, ctx, params = {}) {
  const artist = ctx.catalog.artistById.get(params.id);
  if (!artist) {
    host.append(el("div", { class: "empty-state" }, "Profile not found."));
    return;
  }
  const tracks = ctx.catalog.artistTracks(artist.id);
  const artistInfoUrl = artist.type === "artist" ? bestArtistInfoUrl(tracks) : "";
  const state = { tuneType: "" };
  const tableHost = el("div", {});
  const typeSelect = tuneTypeSelect(ctx, {
    onchange: (value) => {
      state.tuneType = value;
      renderTracks();
    },
  });
  host.append(el("section", { class: "detail-hero" }, [
    el("div", { class: "detail-hero__art" }, [cover(artist.id, artist.name)]),
    el("div", { class: "detail-hero__copy" }, [
      el("p", { class: "kicker" }, typeLabel(artist.type)),
      el("h1", {}, artist.name),
      el("div", { class: "pill-row" }, [
        pill("Tracks", tracks.length.toLocaleString("en-US")),
        pill("Type", typeLabel(artist.type)),
      ]),
      el("div", { class: "hero-actions" }, [
        el("button", { class: "btn btn--accent", onclick: () => tracks[0] && playTrack(ctx, tracks[0], tracks) }, [svg("play", 16), "Play"]),
        artistInfoUrl ? el("a", {
          class: "btn btn--ghost",
          href: artistInfoUrl,
          target: "_blank",
          rel: "noopener noreferrer",
          title: "Open artist info in a new tab",
        }, [svg("external", 16), "Artist Info"]) : null,
      ]),
    ]),
  ]));

  host.append(sectionHead("Tracks", "SID files for this profile"));
  host.append(el("section", { class: "search-panel" }, [typeSelect]), tableHost);
  renderTracks();

  function renderTracks() {
    const filtered = tracks.filter((track) => ctx.catalog.trackMatchesTuneType(track, state.tuneType));
    clear(tableHost);
    tableHost.append(trackTable(ctx, filtered, { pageSize: 200, queue: filtered }));
  }
}

function bestArtistInfoUrl(tracks) {
  const track = tracks.find((item) => String(item.file || "").startsWith("MUSICIANS/")) || tracks[0];
  if (!track?.file) return "";
  const folder = track.file.split("/").slice(0, -1).join("/");
  return `https://deepsid.chordian.net/?file=${encodeURIComponent(folder || track.file)}`;
}
