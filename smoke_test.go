package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
)

func TestRunDesktopSmokeValidatesEmbeddedAssetsAndNativeApp(t *testing.T) {
	configHome := t.TempDir()
	t.Setenv("HOME", configHome)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(configHome, ".config"))

	manifest := Library{
		GeneratedAt:  "2026-06-24T00:00:00Z",
		HVSCRoot:     "",
		BasePath:     "",
		TrackCount:   1,
		ArtistCount:  1,
		ReleaseCount: 1,
		Tracks: []*Track{{
			ID:             "track:test",
			File:           "MUSICIANS/T/Test.sid",
			Title:          "Test Tune",
			ArtistID:       "artist:test",
			Artist:         "Test Artist",
			ArtistType:     "artist",
			ReleaseID:      "release:test",
			Release:        "Test Release",
			Author:         "Test Artist",
			Subtunes:       1,
			DefaultSubtune: 1,
			Duration:       12,
		}},
		Artists: []*Artist{{
			ID:             "artist:test",
			Name:           "Test Artist",
			SortName:       "Test Artist",
			Type:           "artist",
			TrackCount:     1,
			ReleaseCount:   1,
			SampleTrackIDs: []string{"track:test"},
		}},
	}
	manifestBytes, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}

	assets := fstest.MapFS{
		"frontend/dist/index.html":                  &fstest.MapFile{Data: []byte("<main></main>")},
		"frontend/dist/app.js":                      &fstest.MapFile{Data: []byte("export {};")},
		"frontend/dist/styles.css":                  &fstest.MapFile{Data: []byte(":root{}")},
		"frontend/dist/rasterklang-webplayer.json":  &fstest.MapFile{Data: []byte(`{"bridgeApiVersion":"1"}`)},
		"frontend/dist/assets/hvsc-library.json":    &fstest.MapFile{Data: manifestBytes},
		"frontend/dist/wailsjs/go/main/App.js":      &fstest.MapFile{Data: []byte("export function GetPlaybackState(){}")},
		"frontend/dist/src/lib/native-engine.js":    &fstest.MapFile{Data: []byte("export {};")},
		"frontend/dist/src/lib/native-favorites.js": &fstest.MapFile{Data: []byte("export {};")},
	}

	var out bytes.Buffer
	if err := runDesktopSmoke(assets, &out); err != nil {
		t.Fatalf("runDesktopSmoke returned error: %v", err)
	}

	got := out.String()
	for _, want := range []string{
		"desktop smoke ok",
		"tracks=1",
		"artists=1",
		"ready=true",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("smoke output %q should contain %q", got, want)
		}
	}

	if _, err := os.Stat(filepath.Join(configHome, ".config", "rasterklang", "favorites.json")); !os.IsNotExist(err) {
		t.Fatalf("smoke should not create favorites file, stat err=%v", err)
	}
}
