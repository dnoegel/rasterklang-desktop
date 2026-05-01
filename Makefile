WAILS_TAGS ?= desktop,production
APP_NAME ?= Rasterklang
BINARY_NAME ?= rasterklang
INSTALL_BINARY_NAME ?= rasterklang
PREFIX ?= /usr/local
DESTDIR ?=
INSTALL_APP_DIR ?= /Applications
APP_BUNDLE := build/$(APP_NAME).app
APP_CONTENTS := $(APP_BUNDLE)/Contents
APP_MACOS := $(APP_CONTENTS)/MacOS
APP_RESOURCES := $(APP_CONTENTS)/Resources
APP_ICONSET := build/appicon.iconset
APP_ICNS := build/iconfile.icns
UNAME_S := $(shell uname -s)
RUN_ENV :=

ifeq ($(UNAME_S),Darwin)
WAILS_CGO_LDFLAGS := -framework UniformTypeIdentifiers -mmacosx-version-min=10.13
ifneq ($(strip $(CGO_LDFLAGS)),)
WAILS_CGO_LDFLAGS := $(CGO_LDFLAGS) $(WAILS_CGO_LDFLAGS)
endif
RUN_ENV := CGO_LDFLAGS="$(WAILS_CGO_LDFLAGS)"
endif

.PHONY: icon sync-webplayer run build bundle bundle-darwin install install-darwin install-linux tidy deps-debian

icon:
	go run ./scripts/generate-icon.go

sync-webplayer:
	./scripts/sync-webplayer.sh

run: icon sync-webplayer
	$(RUN_ENV) go run -tags "$(WAILS_TAGS)" .

build: icon sync-webplayer
	$(RUN_ENV) go build -tags "$(WAILS_TAGS)" -o bin/$(BINARY_NAME) .

ifeq ($(UNAME_S),Darwin)
bundle: bundle-darwin
bundle-darwin: build
	rm -rf "$(APP_BUNDLE)" "$(APP_ICONSET)" "$(APP_ICNS)"
	mkdir -p "$(APP_MACOS)" "$(APP_RESOURCES)" "$(APP_ICONSET)"
	for size in 16 32 128 256 512; do \
		sips -z $$size $$size build/appicon.png --out "$(APP_ICONSET)/icon_$${size}x$${size}.png" >/dev/null; \
		sips -z $$((size * 2)) $$((size * 2)) build/appicon.png --out "$(APP_ICONSET)/icon_$${size}x$${size}@2x.png" >/dev/null; \
	done
	iconutil -c icns "$(APP_ICONSET)" -o "$(APP_ICNS)"
	cp bin/$(BINARY_NAME) "$(APP_MACOS)/$(BINARY_NAME)"
	cp "$(APP_ICNS)" "$(APP_RESOURCES)/iconfile.icns"
	cp packaging/darwin/Info.plist "$(APP_CONTENTS)/Info.plist"
else
bundle bundle-darwin:
	@echo "bundle-darwin is only supported on macOS"
	@exit 1
endif

install:
ifeq ($(UNAME_S),Darwin)
	$(MAKE) install-darwin
else
	$(MAKE) install-linux
endif

install-darwin: bundle-darwin
	mkdir -p "$(INSTALL_APP_DIR)"
	rm -rf "$(INSTALL_APP_DIR)/$(APP_NAME).app"
	cp -R "$(APP_BUNDLE)" "$(INSTALL_APP_DIR)/"
	@echo "Installed $(APP_NAME) to $(INSTALL_APP_DIR)/$(APP_NAME).app"

install-linux: build
	install -d "$(DESTDIR)$(PREFIX)/bin"
	install -d "$(DESTDIR)$(PREFIX)/share/applications"
	install -d "$(DESTDIR)$(PREFIX)/share/icons/hicolor/1024x1024/apps"
	install -m 0755 "bin/$(BINARY_NAME)" "$(DESTDIR)$(PREFIX)/bin/$(INSTALL_BINARY_NAME)"
	install -m 0644 "packaging/linux/rasterklang.desktop" "$(DESTDIR)$(PREFIX)/share/applications/rasterklang.desktop"
	install -m 0644 "build/appicon.png" "$(DESTDIR)$(PREFIX)/share/icons/hicolor/1024x1024/apps/rasterklang.png"

tidy:
	go mod tidy

deps-debian:
	sudo apt-get install build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.0-dev libasound2-dev
