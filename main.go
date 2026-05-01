package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var appIcon []byte

func main() {
	manifest, err := assets.ReadFile("frontend/dist/assets/hvsc-library.json")
	if err != nil {
		log.Fatal(err)
	}
	app, err := NewApp(manifest)
	if err != nil {
		log.Fatal(err)
	}

	err = wails.Run(&options.App{
		Title:     "Rasterklang",
		Width:     1280,
		Height:    820,
		MinWidth:  1020,
		MinHeight: 700,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 7, G: 9, B: 13, A: 255},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		Linux: &linux.Options{
			Icon:        appIcon,
			ProgramName: "rasterklang",
		},
		Mac: &mac.Options{
			Appearance: mac.NSAppearanceNameDarkAqua,
			About: &mac.AboutInfo{
				Title:   "Rasterklang",
				Message: "Lokaler HVSC SID Player mit nativer Go-Audioengine.",
				Icon:    appIcon,
			},
			TitleBar: &mac.TitleBar{
				TitlebarAppearsTransparent: true,
				HideTitle:                  true,
				HideTitleBar:               false,
				FullSizeContent:            true,
				UseToolbar:                 false,
				HideToolbarSeparator:       true,
			},
		},
		Bind: []interface{}{
			app,
		},
	})
	if err != nil {
		log.Fatal(err)
	}
}
