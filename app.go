package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"

	sid "github.com/dnoegel/rasterklang-cli"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx context.Context

	mu      sync.RWMutex
	catalog *Catalog
	pending *Track
	upload  *uploadedTune
	config  appConfig

	configPath string
	engine     *AudioEngine
	favorites  *Favorites
}

type appConfig struct {
	HVSCRoot string `json:"hvscRoot"`
}

type FavoritesState struct {
	IDs []string `json:"ids"`
}

type LibraryState struct {
	HVSCRoot           string `json:"hvscRoot"`
	HVSCRootConfigured bool   `json:"hvscRootConfigured"`
	HVSCRootValid      bool   `json:"hvscRootValid"`
	HVSCRootLabel      string `json:"hvscRootLabel"`
	Message            string `json:"message,omitempty"`
}

type NativeSource struct {
	Kind      string  `json:"kind"`
	File      string  `json:"file"`
	Label     string  `json:"label"`
	TrackID   string  `json:"trackId"`
	ReleaseID string  `json:"releaseId"`
	ArtistID  string  `json:"artistId"`
	Duration  float64 `json:"duration"`
}

type NativeMetadata struct {
	Title          string `json:"title"`
	Author         string `json:"author"`
	SubtuneCount   int    `json:"subtuneCount"`
	DefaultSubtune int    `json:"defaultSubtune"`
	Clock          string `json:"clock"`
	SIDModel       string `json:"sidModel"`
}

type NativeTune struct {
	Metadata     NativeMetadata `json:"metadata"`
	Supported    bool           `json:"supported"`
	SupportError string         `json:"supportError,omitempty"`
	Source       NativeSource   `json:"source"`
}

type EQState struct {
	Enabled bool    `json:"enabled"`
	Bass    float64 `json:"bass"`
	Mid     float64 `json:"mid"`
	Treble  float64 `json:"treble"`
}

type AudioControlState struct {
	VoiceMask     int  `json:"voiceMask"`
	FilterBypass  bool `json:"filterBypass"`
	FilterEnabled bool `json:"filterEnabled"`
}

type PlaybackState struct {
	Ready          bool               `json:"ready"`
	Error          string             `json:"error,omitempty"`
	Tune           *NativeTune        `json:"tune,omitempty"`
	Playing        bool               `json:"playing"`
	Paused         bool               `json:"paused"`
	Seeking        bool               `json:"seeking"`
	CurrentSubtune int                `json:"currentSubtune"`
	Elapsed        float64            `json:"elapsed"`
	Duration       float64            `json:"duration"`
	Volume         float64            `json:"volume"`
	Muted          bool               `json:"muted"`
	Equalizer      EQState            `json:"equalizer"`
	AudioControls  AudioControlState  `json:"audioControls"`
	HasSnapshot    bool               `json:"hasSnapshot"`
	Snapshot       *sid.DebugSnapshot `json:"snapshot,omitempty"`
	Scope          []int16            `json:"scope,omitempty"`
	Spectrum       []int16            `json:"spectrum,omitempty"`
}

type uploadedTune struct {
	Track *Track
	Tune  *sid.Tune
}

const uploadedTrackID = "upload:current"

func NewApp(manifest []byte) (*App, error) {
	configPath := defaultConfigPath()
	config := loadConfig(configPath)
	root, _ := normalizeHVSCRoot(config.HVSCRoot)
	config.HVSCRoot = root

	catalog, err := LoadCatalogBytes(manifest, "embedded hvsc-library.json", root)
	if err != nil {
		return nil, err
	}
	return &App{
		catalog:    catalog,
		config:     config,
		configPath: configPath,
		engine:     NewAudioEngine(),
		favorites:  LoadFavorites(),
	}, nil
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) shutdown(context.Context) {
	a.engine.Stop()
}

func (a *App) GetLibraryState() (*LibraryState, error) {
	a.mu.RLock()
	root := a.catalog.HVSCRoot
	a.mu.RUnlock()
	return libraryState(root), nil
}

func (a *App) GetFavorites() (*FavoritesState, error) {
	return &FavoritesState{IDs: a.validFavoriteIDs(a.favorites.IDs())}, nil
}

func (a *App) SetFavorite(trackID string, active bool) (*FavoritesState, error) {
	ids := a.validFavoriteIDs([]string{trackID})
	if len(ids) == 0 {
		return nil, fmt.Errorf("track %q nicht gefunden", trackID)
	}
	a.favorites.Set(ids[0], active)
	return a.GetFavorites()
}

func (a *App) SetFavorites(trackIDs []string) (*FavoritesState, error) {
	ids := a.validFavoriteIDs(trackIDs)
	return &FavoritesState{IDs: a.favorites.Replace(ids)}, nil
}

func (a *App) ImportFavorites(trackIDs []string) (*FavoritesState, error) {
	ids := a.validFavoriteIDs(trackIDs)
	return &FavoritesState{IDs: a.favorites.AddMany(ids)}, nil
}

func (a *App) ChooseHVSCRoot() (*LibraryState, error) {
	if a.ctx == nil {
		return nil, fmt.Errorf("app context is not ready")
	}
	selection, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:                "HVSC Collection oder C64Music Ordner auswaehlen",
		CanCreateDirectories: false,
	})
	if err != nil {
		return nil, err
	}
	if selection == "" {
		return a.GetLibraryState()
	}
	root, err := normalizeHVSCRoot(selection)
	if err != nil {
		_, _ = runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
			Type:    runtime.WarningDialog,
			Title:   "HVSC nicht erkannt",
			Message: err.Error(),
		})
		return libraryState(""), err
	}

	a.mu.Lock()
	a.catalog.HVSCRoot = root
	a.config.HVSCRoot = root
	a.mu.Unlock()
	a.saveConfig()
	return libraryState(root), nil
}

func (a *App) LoadTrack(trackID string) (*PlaybackState, error) {
	track, err := a.findTrack(trackID)
	if err != nil {
		return nil, err
	}
	a.mu.Lock()
	a.pending = track
	a.mu.Unlock()
	return a.playbackState(true), nil
}

func (a *App) LoadUploadedTune(label string, data []byte) (*PlaybackState, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("SID upload is empty")
	}
	tune, err := sid.Parse(data)
	if err != nil {
		return nil, err
	}
	track := trackFromUploadedTune(label, tune)
	a.engine.Stop()
	a.mu.Lock()
	a.upload = &uploadedTune{
		Track: track,
		Tune:  tune,
	}
	a.pending = track
	a.mu.Unlock()
	return a.playbackState(true), nil
}

func (a *App) PlayTrack(trackID string, subtune int, startAt float64) (*PlaybackState, error) {
	track, err := a.resolvePlayableTrack(trackID)
	if err != nil {
		return nil, err
	}
	path, err := a.trackPath(track)
	if err != nil {
		return nil, err
	}
	log.Printf("rasterklang-desktop: play track id=%s title=%q file=%s", track.ID, track.Title, track.File)
	if err := a.engine.PlayTrack(track, path, subtune, startAt); err != nil {
		return a.playbackState(false), err
	}
	a.mu.Lock()
	a.pending = track
	a.mu.Unlock()
	return a.playbackState(true), nil
}

func (a *App) PlayUploadedTune(subtune int, startAt float64) (*PlaybackState, error) {
	a.mu.RLock()
	upload := a.upload
	a.mu.RUnlock()
	if upload == nil || upload.Track == nil || upload.Tune == nil {
		return nil, fmt.Errorf("kein Upload geladen")
	}
	if err := a.engine.PlayTune(upload.Track, upload.Tune, upload.Track.File, subtune, startAt); err != nil {
		return a.playbackState(false), err
	}
	a.mu.Lock()
	a.pending = upload.Track
	a.mu.Unlock()
	return a.playbackState(true), nil
}

func (a *App) TogglePause() (*PlaybackState, error) {
	if !a.engine.TogglePlay() {
		return a.playbackState(false), fmt.Errorf("kein Track geladen")
	}
	return a.playbackState(true), nil
}

func (a *App) Stop() (*PlaybackState, error) {
	a.engine.Stop()
	return a.playbackState(true), nil
}

func (a *App) Seek(seconds float64) (*PlaybackState, error) {
	snap := a.engine.Snapshot()
	if snap.Track == nil {
		return a.playbackState(false), fmt.Errorf("kein Track geladen")
	}
	wasPaused := snap.Paused || !snap.Playing
	if snap.Track.ID == uploadedTrackID {
		a.mu.RLock()
		upload := a.upload
		a.mu.RUnlock()
		if upload == nil || upload.Tune == nil {
			return nil, fmt.Errorf("kein Upload geladen")
		}
		if err := a.engine.PlayTune(upload.Track, upload.Tune, upload.Track.File, snap.Subtune, seconds); err != nil {
			return a.playbackState(false), err
		}
	} else {
		path, err := a.trackPath(snap.Track)
		if err != nil {
			return nil, err
		}
		if err := a.engine.PlayTrack(snap.Track, path, snap.Subtune, seconds); err != nil {
			return a.playbackState(false), err
		}
	}
	if wasPaused {
		a.engine.TogglePlay()
	}
	return a.playbackState(true), nil
}

func (a *App) SetVolume(volume float64) (*PlaybackState, error) {
	a.engine.SetVolume(volume)
	return a.playbackState(false), nil
}

func (a *App) ToggleMute() (*PlaybackState, error) {
	a.engine.ToggleMute()
	return a.playbackState(false), nil
}

func (a *App) SetEqualizer(patch map[string]interface{}) (*PlaybackState, error) {
	eq := a.engine.EQ()
	for key, value := range patch {
		switch key {
		case "enabled":
			if v, ok := value.(bool); ok {
				eq.Enabled = v
			}
		case "bass":
			eq.Bass = clampDB(numberValue(value))
		case "mid":
			eq.Mid = clampDB(numberValue(value))
		case "treble":
			eq.Treble = clampDB(numberValue(value))
		}
	}
	a.engine.SetEQ(eq)
	return a.playbackState(false), nil
}

func (a *App) ResetEqualizer() (*PlaybackState, error) {
	a.engine.SetEQ(EQSettings{Enabled: true})
	return a.playbackState(false), nil
}

func (a *App) SetAudioControls(patch map[string]interface{}) (*PlaybackState, error) {
	controls := a.engine.AudioControls()
	for key, value := range patch {
		switch key {
		case "voiceMask":
			controls.VoiceMask = byte(max(0, min(7, int(numberValue(value)))))
		case "filterBypass":
			if v, ok := value.(bool); ok {
				controls.FilterBypass = v
			}
		case "filterEnabled":
			if v, ok := value.(bool); ok {
				controls.FilterBypass = !v
			}
		}
	}
	a.engine.SetAudioControls(controls)
	return a.playbackState(false), nil
}

func (a *App) GetPlaybackState() (*PlaybackState, error) {
	return a.playbackState(true), nil
}

func (a *App) playbackState(includeSamples bool) *PlaybackState {
	snap := a.engine.Snapshot()
	track := snap.Track
	if track == nil {
		a.mu.RLock()
		track = a.pending
		a.mu.RUnlock()
	}

	eq := a.engine.EQ()
	controls := a.engine.AudioControls()
	state := &PlaybackState{
		Ready:          true,
		Error:          snap.Error,
		Playing:        snap.Playing,
		Paused:         snap.Paused,
		CurrentSubtune: snap.Subtune,
		Elapsed:        snap.Elapsed,
		Duration:       snap.Duration,
		Volume:         snap.Volume,
		Muted:          snap.Muted,
		Equalizer:      eqState(eq),
		AudioControls:  audioControlState(controls),
		HasSnapshot:    snap.HasSnapshot,
	}
	if track != nil {
		subtune := snap.Subtune
		if subtune <= 0 {
			subtune = track.DefaultSubtune
		}
		state.Tune = tuneFromTrack(track, subtune)
		if state.CurrentSubtune <= 0 {
			state.CurrentSubtune = subtune
		}
		if state.Duration <= 0 {
			state.Duration = durationForSubtune(track, subtune)
		}
	}
	if snap.HasSnapshot {
		debug := snap.Debug
		state.Snapshot = &debug
	}
	if includeSamples {
		state.Scope = a.engine.ScopeSamples()
		state.Spectrum = a.engine.SpectrumSamples()
	}
	return state
}

func (a *App) resolvePlayableTrack(trackID string) (*Track, error) {
	if strings.TrimSpace(trackID) == "" {
		return nil, fmt.Errorf("keine Track-ID uebergeben")
	}
	return a.findTrack(trackID)
}

func (a *App) findTrack(trackID string) (*Track, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	track := a.catalog.TrackByID[trackID]
	if track == nil {
		return nil, fmt.Errorf("track %q nicht gefunden", trackID)
	}
	return track, nil
}

func (a *App) trackPath(track *Track) (string, error) {
	a.mu.RLock()
	catalog := a.catalog
	root := catalog.HVSCRoot
	a.mu.RUnlock()
	if root == "" {
		return "", fmt.Errorf("Bitte zuerst die lokale HVSC Collection auswaehlen.")
	}
	path := catalog.TrackPath(track)
	if _, err := os.Stat(path); err != nil {
		return "", fmt.Errorf("SID-Datei nicht gefunden: %s", path)
	}
	return path, nil
}

func (a *App) validFavoriteIDs(trackIDs []string) []string {
	a.mu.RLock()
	defer a.mu.RUnlock()
	if a.catalog == nil {
		return nil
	}
	seen := map[string]bool{}
	ids := make([]string, 0, len(trackIDs))
	for _, id := range trackIDs {
		id = strings.TrimSpace(id)
		if id == "" || seen[id] || a.catalog.TrackByID[id] == nil {
			continue
		}
		seen[id] = true
		ids = append(ids, id)
	}
	return ids
}

func (a *App) saveConfig() {
	if a.configPath == "" {
		return
	}
	a.mu.RLock()
	config := a.config
	a.mu.RUnlock()
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return
	}
	if err := os.MkdirAll(filepath.Dir(a.configPath), 0o755); err != nil {
		return
	}
	_ = os.WriteFile(a.configPath, data, 0o644)
}

func defaultConfigPath() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		return ""
	}
	return filepath.Join(dir, "rasterklang", "config.json")
}

func loadConfig(path string) appConfig {
	if path == "" {
		return appConfig{}
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return appConfig{}
	}
	var config appConfig
	if json.Unmarshal(data, &config) != nil {
		return appConfig{}
	}
	return config
}

func normalizeHVSCRoot(path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", nil
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	candidates := []string{abs, filepath.Join(abs, "C64Music")}
	for _, candidate := range candidates {
		if isHVSCRoot(candidate) {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("%q sieht nicht wie eine HVSC Collection aus. Waehle den Ordner C64Music oder den Ordner, der C64Music enthaelt.", abs)
}

func isHVSCRoot(path string) bool {
	info, err := os.Stat(path)
	if err != nil || !info.IsDir() {
		return false
	}
	required := []string{"MUSICIANS", "DEMOS", "DOCUMENTS"}
	for _, name := range required {
		if info, err := os.Stat(filepath.Join(path, name)); err != nil || !info.IsDir() {
			return false
		}
	}
	return true
}

func libraryState(root string) *LibraryState {
	state := &LibraryState{
		HVSCRoot:           root,
		HVSCRootConfigured: root != "",
		HVSCRootValid:      isHVSCRoot(root),
		HVSCRootLabel:      "Keine HVSC gewaehlt",
	}
	if state.HVSCRootValid {
		state.HVSCRootLabel = filepath.Base(root)
		return state
	}
	if root != "" {
		state.Message = "Der gespeicherte HVSC Ordner ist nicht mehr verfuegbar."
	}
	return state
}

func tuneFromTrack(track *Track, subtune int) *NativeTune {
	total := max(1, track.Subtunes)
	if subtune <= 0 {
		subtune = track.DefaultSubtune
	}
	if subtune <= 0 {
		subtune = 1
	}
	return &NativeTune{
		Metadata: NativeMetadata{
			Title:          track.Title,
			Author:         track.Author,
			SubtuneCount:   total,
			DefaultSubtune: max(1, track.DefaultSubtune),
			Clock:          track.Clock,
			SIDModel:       track.Model,
		},
		Supported: true,
		Source: NativeSource{
			Kind:      sourceKindForTrack(track),
			File:      track.File,
			Label:     track.Title,
			TrackID:   track.ID,
			ReleaseID: track.ReleaseID,
			ArtistID:  track.ArtistID,
			Duration:  durationForSubtune(track, subtune),
		},
	}
}

func trackFromUploadedTune(label string, tune *sid.Tune) *Track {
	label = strings.TrimSpace(label)
	if label == "" {
		label = "Upload.sid"
	}
	title := strings.TrimSpace(tune.Title)
	if title == "" {
		title = strings.TrimSuffix(filepath.Base(label), filepath.Ext(label))
	}
	return &Track{
		ID:             uploadedTrackID,
		File:           filepath.Base(label),
		Title:          title,
		Author:         tune.Author,
		Subtunes:       int(tune.Songs),
		DefaultSubtune: int(tune.StartSong),
		Clock:          string(tune.Clock),
		Model:          string(tune.SIDModel),
	}
}

func sourceKindForTrack(track *Track) string {
	if track != nil && track.ID == uploadedTrackID {
		return "upload"
	}
	return "hvsc"
}

func durationForSubtune(track *Track, subtune int) float64 {
	if track == nil {
		return 0
	}
	if subtune > 0 && subtune <= len(track.Durations) {
		return track.Durations[subtune-1]
	}
	return track.Duration
}

func eqState(eq EQSettings) EQState {
	return EQState{
		Enabled: eq.Enabled,
		Bass:    eq.Bass,
		Mid:     eq.Mid,
		Treble:  eq.Treble,
	}
}

func audioControlState(controls sid.AudioControls) AudioControlState {
	mask := int(controls.VoiceMask)
	return AudioControlState{
		VoiceMask:     mask,
		FilterBypass:  controls.FilterBypass,
		FilterEnabled: !controls.FilterBypass,
	}
}

func numberValue(value interface{}) float64 {
	switch v := value.(type) {
	case float64:
		return v
	case float32:
		return float64(v)
	case int:
		return float64(v)
	case int64:
		return float64(v)
	case json.Number:
		n, _ := v.Float64()
		return n
	default:
		return 0
	}
}

func clampDB(value float64) float64 {
	if value < -12 {
		return -12
	}
	if value > 12 {
		return 12
	}
	return value
}
