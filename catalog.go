package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type Library struct {
	GeneratedAt  string    `json:"generatedAt"`
	HVSCRoot     string    `json:"hvscRoot"`
	BasePath     string    `json:"basePath"`
	TrackCount   int       `json:"trackCount"`
	ArtistCount  int       `json:"artistCount"`
	ReleaseCount int       `json:"releaseCount"`
	Tracks       []*Track  `json:"tracks"`
	Artists      []*Artist `json:"artists"`
}

type Track struct {
	ID              string    `json:"id"`
	File            string    `json:"file"`
	Title           string    `json:"title"`
	ArtistID        string    `json:"artistId"`
	Artist          string    `json:"artist"`
	ArtistType      string    `json:"artistType"`
	ReleaseID       string    `json:"releaseId"`
	Release         string    `json:"release"`
	Author          string    `json:"author"`
	OriginalArtist  string    `json:"originalArtist"`
	Released        string    `json:"released"`
	Format          string    `json:"format"`
	Version         int       `json:"version"`
	TuneTypes       []string  `json:"tuneTypes"`
	PrimaryTuneType string    `json:"primaryTuneType"`
	Subtunes        int       `json:"subtunes"`
	DefaultSubtune  int       `json:"defaultSubtune"`
	Clock           string    `json:"clock"`
	Model           string    `json:"model"`
	Duration        float64   `json:"duration"`
	Durations       []float64 `json:"durations"`
	STIL            string    `json:"stil"`
	HVSCPath        string    `json:"-"`
	SearchText      string    `json:"-"`
}

type Artist struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	SortName        string   `json:"sortName"`
	Type            string   `json:"type"`
	Grouping        string   `json:"grouping"`
	TrackCount      int      `json:"trackCount"`
	ReleaseCount    int      `json:"releaseCount"`
	Duration        float64  `json:"duration"`
	SampleTrackIDs  []string `json:"sampleTrackIds"`
	TuneTypes       []string `json:"-"`
	PrimaryTuneType string   `json:"-"`
	SearchText      string   `json:"-"`
}

type Catalog struct {
	Library      *Library
	ManifestPath string
	HVSCRoot     string
	Tracks       []*Track
	Artists      []*Artist
	TrackByID    map[string]*Track
	TrackByFile  map[string]*Track
	ArtistByID   map[string]*Artist
	Featured     []*Track
	TopArtists   []*Artist
	TopGames     []*Artist
	TopDemos     []*Artist
	Games        []*Track
	Demos        []*Track
}

func LoadCatalog(manifestPath, hvscRoot string) (*Catalog, error) {
	resolvedManifest, err := resolveManifest(manifestPath)
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(resolvedManifest)
	if err != nil {
		return nil, fmt.Errorf("read manifest: %w", err)
	}
	var lib Library
	if err := json.Unmarshal(data, &lib); err != nil {
		return nil, fmt.Errorf("parse manifest: %w", err)
	}
	if lib.TrackCount == 0 {
		lib.TrackCount = len(lib.Tracks)
	}
	if lib.ArtistCount == 0 {
		lib.ArtistCount = len(lib.Artists)
	}
	resolvedHVSC, err := resolveHVSCRoot(resolvedManifest, lib.BasePath, hvscRoot)
	if err != nil {
		return nil, err
	}
	return NewCatalog(&lib, resolvedManifest, resolvedHVSC), nil
}

func LoadCatalogBytes(data []byte, manifestLabel, hvscRoot string) (*Catalog, error) {
	var lib Library
	if err := json.Unmarshal(data, &lib); err != nil {
		return nil, fmt.Errorf("parse manifest: %w", err)
	}
	if lib.TrackCount == 0 {
		lib.TrackCount = len(lib.Tracks)
	}
	if lib.ArtistCount == 0 {
		lib.ArtistCount = len(lib.Artists)
	}
	return NewCatalog(&lib, manifestLabel, hvscRoot), nil
}

func NewCatalog(lib *Library, manifestPath, hvscRoot string) *Catalog {
	normalizeTuneTypes(lib.Tracks)
	annotateArtistTuneTypes(lib.Artists, lib.Tracks)

	cat := &Catalog{
		Library:      lib,
		ManifestPath: manifestPath,
		HVSCRoot:     hvscRoot,
		Tracks:       lib.Tracks,
		Artists:      lib.Artists,
		TrackByID:    make(map[string]*Track, len(lib.Tracks)),
		TrackByFile:  make(map[string]*Track, len(lib.Tracks)),
		ArtistByID:   make(map[string]*Artist, len(lib.Artists)),
	}
	for _, track := range lib.Tracks {
		track.HVSCPath = "/" + strings.TrimLeft(track.File, "/")
		track.SearchText = strings.ToLower(strings.Join(nonEmpty(
			track.Title,
			track.Artist,
			track.Author,
			track.Release,
			track.Released,
			track.HVSCPath,
			track.OriginalArtist,
			track.PrimaryTuneType,
			strings.Join(track.TuneTypes, " "),
		), " "))
		cat.TrackByID[track.ID] = track
		cat.TrackByFile[track.File] = track
		if track.ArtistType == "game" {
			cat.Games = append(cat.Games, track)
		}
		if track.ArtistType == "demo" {
			cat.Demos = append(cat.Demos, track)
		}
	}
	for _, artist := range lib.Artists {
		artist.SearchText = strings.ToLower(strings.Join(nonEmpty(
			artist.Name,
			artist.Type,
			artist.Grouping,
			strings.Join(artist.TuneTypes, " "),
		), " "))
		cat.ArtistByID[artist.ID] = artist
		switch artist.Type {
		case "artist":
			cat.TopArtists = append(cat.TopArtists, artist)
		case "game":
			cat.TopGames = append(cat.TopGames, artist)
		case "demo":
			cat.TopDemos = append(cat.TopDemos, artist)
		}
	}
	sortArtists(cat.TopArtists)
	sortArtists(cat.TopGames)
	sortArtists(cat.TopDemos)
	cat.Featured = pickFeaturedTracks(cat.Tracks)
	return cat
}

func (c *Catalog) TrackPath(track *Track) string {
	if track == nil {
		return ""
	}
	return filepath.Join(c.HVSCRoot, filepath.FromSlash(track.File))
}

func (c *Catalog) ArtistTracks(artistID string) []*Track {
	var out []*Track
	for _, track := range c.Tracks {
		if track.ArtistID == artistID {
			out = append(out, track)
		}
	}
	return out
}

func (c *Catalog) Search(query string, limit int) ([]*Track, []*Artist) {
	q := strings.TrimSpace(strings.ToLower(query))
	if limit <= 0 {
		limit = 80
	}
	if q == "" {
		return firstTracks(c.Tracks, limit), nil
	}
	terms := strings.Fields(q)
	type scoredTrack struct {
		track *Track
		score int
	}
	var tracks []scoredTrack
	for _, track := range c.Tracks {
		score := searchScore(track.SearchText, track.Title, track.Artist, q, terms)
		if score > 0 {
			tracks = append(tracks, scoredTrack{track: track, score: score})
		}
	}
	sort.Slice(tracks, func(i, j int) bool {
		if tracks[i].score != tracks[j].score {
			return tracks[i].score > tracks[j].score
		}
		return tracks[i].track.Title < tracks[j].track.Title
	})
	type scoredArtist struct {
		artist *Artist
		score  int
	}
	var artists []scoredArtist
	for _, artist := range c.Artists {
		score := searchScore(artist.SearchText, artist.Name, artist.Type, q, terms)
		if score > 0 {
			score += min(18, artist.TrackCount/20)
			artists = append(artists, scoredArtist{artist: artist, score: score})
		}
	}
	sort.Slice(artists, func(i, j int) bool {
		if artists[i].score != artists[j].score {
			return artists[i].score > artists[j].score
		}
		return artists[i].artist.Name < artists[j].artist.Name
	})
	outTracks := make([]*Track, 0, min(limit, len(tracks)))
	for i := 0; i < len(tracks) && i < limit; i++ {
		outTracks = append(outTracks, tracks[i].track)
	}
	outArtists := make([]*Artist, 0, min(24, len(artists)))
	for i := 0; i < len(artists) && i < 24; i++ {
		outArtists = append(outArtists, artists[i].artist)
	}
	return outTracks, outArtists
}

func resolveManifest(manifestPath string) (string, error) {
	if manifestPath != "" {
		return absExisting(manifestPath, "manifest")
	}
	candidates := []string{
		"../rasterklang-webplayer/assets/hvsc-library.json",
		"rasterklang-webplayer/assets/hvsc-library.json",
		"./assets/hvsc-library.json",
	}
	if exe, err := os.Executable(); err == nil {
		dir := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(dir, "../rasterklang-webplayer/assets/hvsc-library.json"),
			filepath.Join(dir, "assets/hvsc-library.json"),
		)
	}
	for _, candidate := range candidates {
		if path, err := absExisting(candidate, "manifest"); err == nil {
			return path, nil
		}
	}
	return "", fmt.Errorf("manifest not found; pass -manifest")
}

func resolveHVSCRoot(manifestPath, basePath, override string) (string, error) {
	if override != "" {
		return absExisting(override, "HVSC root")
	}
	var candidates []string
	if basePath != "" {
		candidates = append(candidates, filepath.Join(filepath.Dir(manifestPath), filepath.FromSlash(basePath)))
	}
	candidates = append(candidates,
		"../test_tunes/C64Music",
		"test_tunes/C64Music",
		"../../test_tunes/C64Music",
	)
	for _, candidate := range candidates {
		if path, err := absExisting(candidate, "HVSC root"); err == nil {
			return path, nil
		}
	}
	return "", fmt.Errorf("HVSC root not found; pass -hvsc")
}

func absExisting(path, label string) (string, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", fmt.Errorf("resolve %s: %w", label, err)
	}
	if _, err := os.Stat(abs); err != nil {
		return "", fmt.Errorf("%s %q: %w", label, abs, err)
	}
	return abs, nil
}

func normalizeTuneTypes(tracks []*Track) {
	for _, track := range tracks {
		if len(track.TuneTypes) == 0 && track.Format != "" {
			track.TuneTypes = []string{track.Format}
		}
		track.TuneTypes = uniqueStrings(track.TuneTypes)
		if track.PrimaryTuneType == "" {
			track.PrimaryTuneType = primaryTuneType(track.TuneTypes, track.Format)
		}
	}
}

func annotateArtistTuneTypes(artists []*Artist, tracks []*Track) {
	byArtist := map[string]map[string]bool{}
	for _, track := range tracks {
		if byArtist[track.ArtistID] == nil {
			byArtist[track.ArtistID] = map[string]bool{}
		}
		for _, typ := range track.TuneTypes {
			byArtist[track.ArtistID][typ] = true
		}
	}
	for _, artist := range artists {
		for typ := range byArtist[artist.ID] {
			artist.TuneTypes = append(artist.TuneTypes, typ)
		}
		sort.Strings(artist.TuneTypes)
		artist.PrimaryTuneType = primaryTuneType(artist.TuneTypes, artist.Type)
	}
}

func pickFeaturedTracks(tracks []*Track) []*Track {
	wanted := []string{
		"Arkanoid.sid",
		"Commando.sid",
		"Monty_on_the_Run.sid",
		"Rambo_First_Blood_Part_II.sid",
		"International_Karate.sid",
		"Last_Ninja",
		"Comic_Bakery.sid",
		"Lightforce.sid",
		"Sanxion.sid",
		"Wizball.sid",
		"Delta.sid",
		"Airwolf_Title.sid",
	}
	var out []*Track
	seen := map[string]bool{}
	for _, needle := range wanted {
		for _, track := range tracks {
			if strings.Contains(track.File, needle) && !seen[track.ID] {
				out = append(out, track)
				seen[track.ID] = true
				break
			}
		}
	}
	for _, track := range tracks {
		if len(out) >= 18 {
			break
		}
		if track.Duration > 90 && !seen[track.ID] {
			out = append(out, track)
			seen[track.ID] = true
		}
	}
	return out
}

func firstTracks(tracks []*Track, limit int) []*Track {
	if len(tracks) <= limit {
		return tracks
	}
	return tracks[:limit]
}

func sortArtists(items []*Artist) {
	sort.Slice(items, func(i, j int) bool {
		if items[i].TrackCount != items[j].TrackCount {
			return items[i].TrackCount > items[j].TrackCount
		}
		return items[i].Name < items[j].Name
	})
}

func searchScore(hay, primary, secondary, query string, terms []string) int {
	score := 0
	primary = strings.ToLower(primary)
	secondary = strings.ToLower(secondary)
	for _, term := range terms {
		idx := strings.Index(hay, term)
		if idx < 0 {
			return 0
		}
		if idx == 0 {
			score += 12
		} else {
			score += 4
		}
		if primary == term {
			score += 70
		} else if strings.HasPrefix(primary, term) {
			score += 34
		}
		if secondary == term {
			score += 28
		} else if strings.HasPrefix(secondary, term) {
			score += 14
		}
	}
	if primary == query {
		score += 180
	} else if strings.HasPrefix(primary, query) {
		score += 70
	}
	if secondary == query {
		score += 42
	} else if strings.HasPrefix(secondary, query) {
		score += 18
	}
	return score
}

func typeLabel(kind string) string {
	switch kind {
	case "game":
		return "Game"
	case "demo":
		return "Demo"
	default:
		return "Interpret"
	}
}

func tuneTypeSummary(track *Track) string {
	if track == nil {
		return "SID"
	}
	types := track.TuneTypes
	if len(types) == 0 && track.Format != "" {
		types = []string{track.Format}
	}
	if len(types) > 3 {
		types = types[:3]
	}
	if len(types) == 0 {
		return "SID"
	}
	return strings.Join(types, ", ")
}

func primaryTuneType(types []string, fallback string) string {
	for _, typ := range types {
		if typ != "" && typ != fallback {
			return typ
		}
	}
	if len(types) > 0 && types[0] != "" {
		return types[0]
	}
	if fallback != "" {
		return fallback
	}
	return "SID"
}

func uniqueStrings(items []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(items))
	for _, item := range items {
		if item == "" || seen[item] {
			continue
		}
		seen[item] = true
		out = append(out, item)
	}
	return out
}

func nonEmpty(items ...string) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		if strings.TrimSpace(item) != "" {
			out = append(out, item)
		}
	}
	return out
}
