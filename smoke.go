package main

import (
	"context"
	"fmt"
	"io"
	"io/fs"
)

var smokeRequiredAssets = []string{
	"frontend/dist/index.html",
	"frontend/dist/app.js",
	"frontend/dist/styles.css",
	"frontend/dist/rasterklang-webplayer.json",
	"frontend/dist/assets/hvsc-library.json",
	"frontend/dist/wailsjs/go/main/App.js",
	"frontend/dist/src/lib/native-engine.js",
	"frontend/dist/src/lib/native-favorites.js",
}

func runDesktopSmoke(assets fs.FS, out io.Writer) error {
	for _, path := range smokeRequiredAssets {
		info, err := fs.Stat(assets, path)
		if err != nil {
			return fmt.Errorf("missing embedded asset %s: %w", path, err)
		}
		if info.IsDir() || info.Size() == 0 {
			return fmt.Errorf("embedded asset %s is empty or not a file", path)
		}
	}

	manifest, err := fs.ReadFile(assets, "frontend/dist/assets/hvsc-library.json")
	if err != nil {
		return fmt.Errorf("read embedded HVSC manifest: %w", err)
	}
	app, err := NewApp(manifest)
	if err != nil {
		return fmt.Errorf("initialize native app: %w", err)
	}
	app.startup(context.Background())
	defer app.shutdown(context.Background())

	library, err := app.GetLibraryState()
	if err != nil {
		return fmt.Errorf("read library state: %w", err)
	}
	playback, err := app.GetPlaybackState()
	if err != nil {
		return fmt.Errorf("read playback state: %w", err)
	}
	favorites, err := app.GetFavorites()
	if err != nil {
		return fmt.Errorf("read favorites state: %w", err)
	}

	app.mu.RLock()
	trackCount := len(app.catalog.Tracks)
	artistCount := len(app.catalog.Artists)
	app.mu.RUnlock()
	if trackCount == 0 {
		return fmt.Errorf("embedded catalog has no tracks")
	}
	if artistCount == 0 {
		return fmt.Errorf("embedded catalog has no artists")
	}
	if !playback.Ready {
		return fmt.Errorf("playback state is not ready")
	}

	_, err = fmt.Fprintf(
		out,
		"desktop smoke ok tracks=%d artists=%d hvscConfigured=%t ready=%t favorites=%d\n",
		trackCount,
		artistCount,
		library.HVSCRootConfigured,
		playback.Ready,
		len(favorites.IDs),
	)
	return err
}
