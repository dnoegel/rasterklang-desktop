WAILS_TAGS ?= desktop,production
APP_NAME ?= Rasterklang
BINARY_NAME ?= rasterklang-desktop
INSTALL_BINARY_NAME ?= rasterklang-desktop
VERSION ?= dev
BUILD_NUMBER ?= 1
ASSET_VERSION ?= $(VERSION)
WEBPLAYER_ARTIFACT ?=
WEBPLAYER_ARTIFACT_SHA256 ?=
BUILD_VERSION ?= $(if $(filter dev,$(VERSION)),$(shell git describe --tags --dirty --always 2>/dev/null || echo dev),$(VERSION))
COMMIT ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo unknown)
DATE ?= $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
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
DIST_OS ?= $(shell uname -s | tr '[:upper:]' '[:lower:]')
DIST_ARCH ?= $(shell uname -m)
DIST_DIR ?= dist
DIST_WORK_ROOT := build/dist
DIST_BASENAME := rasterklang-desktop_$(VERSION)_$(DIST_OS)_$(DIST_ARCH)
DIST_ARCHIVE := $(DIST_DIR)/$(DIST_BASENAME).tar.gz
DIST_APP_ZIP := $(DIST_DIR)/$(DIST_BASENAME).app.zip
DEB_WORK_ROOT := build/deb
LICENSE_REPORT := $(DIST_DIR)/THIRD_PARTY_LICENSE_REPORT.md
LICENSE_REPORT_FLAGS ?= --fail-on-unknown
PROVENANCE := $(DIST_DIR)/RELEASE_PROVENANCE.json
PLIST_VERSION := $(patsubst v%,%,$(VERSION))
LDFLAGS := -s -w -X main.version=$(BUILD_VERSION) -X main.commit=$(COMMIT) -X main.date=$(DATE)
RUN_ENV :=

ifeq ($(UNAME_S),Darwin)
WAILS_CGO_LDFLAGS := -framework UniformTypeIdentifiers -mmacosx-version-min=10.13
ifneq ($(strip $(CGO_LDFLAGS)),)
WAILS_CGO_LDFLAGS := $(CGO_LDFLAGS) $(WAILS_CGO_LDFLAGS)
endif
RUN_ENV := CGO_LDFLAGS="$(WAILS_CGO_LDFLAGS)"
endif

.PHONY: check icon sync-webplayer run build smoke license-report release-provenance identity-preflight standalone-preflight webplayer-lock-preflight bundle bundle-darwin dist dist-linux dist-deb dist-darwin checksum install install-darwin install-linux tidy deps-debian release release-preflight

check:
	@fmt="$$(gofmt -l .)"; \
	if [ -n "$$fmt" ]; then \
		echo "gofmt needed:"; \
		echo "$$fmt"; \
		exit 1; \
	fi
	bash -n scripts/sync-webplayer.sh scripts/test-sync-webplayer.sh scripts/check-release-docs.sh
	node --check scripts/generate-license-report.mjs
	node --check scripts/write-release-provenance.mjs
	node --check scripts/check-release-identity.mjs
	node --check scripts/check-standalone-release.mjs
	node --check scripts/check-webplayer-lock-release.mjs
	node --check scripts/test-webplayer-lock-release.mjs
	node --check scripts/build-deb-package.mjs
	node --check scripts/test-deb-package.mjs
	node --check scripts/check-generated-frontend-policy.mjs
	bash scripts/check-release-docs.sh
	$(MAKE) license-report
	node scripts/check-generated-frontend-policy.mjs
	node --check scripts/check-frontend-contract.mjs
	node --check scripts/check-release-workflows.mjs
	node scripts/test-deb-package.mjs
	bash scripts/test-sync-webplayer.sh
	node scripts/check-frontend-contract.mjs
	node scripts/check-release-workflows.mjs
	node scripts/test-webplayer-lock-release.mjs
	go vet ./...
	go test ./...
	$(MAKE) smoke

icon:
	go run ./scripts/generate-icon.go

sync-webplayer:
	WEBPLAYER_ARTIFACT="$(WEBPLAYER_ARTIFACT)" WEBPLAYER_ARTIFACT_SHA256="$(WEBPLAYER_ARTIFACT_SHA256)" ASSET_VERSION="$(ASSET_VERSION)" ./scripts/sync-webplayer.sh

run: icon sync-webplayer
	$(RUN_ENV) go run -tags "$(WAILS_TAGS)" -ldflags="$(LDFLAGS)" .

build: icon sync-webplayer
	$(RUN_ENV) go build -tags "$(WAILS_TAGS)" -ldflags="$(LDFLAGS)" -o bin/$(BINARY_NAME) .

smoke: build
	./bin/$(BINARY_NAME) --smoke

license-report:
	mkdir -p "$(DIST_DIR)"
	node scripts/generate-license-report.mjs --project . --out "$(LICENSE_REPORT)" $(LICENSE_REPORT_FLAGS)

release-provenance:
	mkdir -p "$(DIST_DIR)"
	node scripts/write-release-provenance.mjs \
		--out "$(PROVENANCE)" \
		--name "$(BINARY_NAME)" \
		--version "$(BUILD_VERSION)" \
		--commit "$(COMMIT)" \
		--date "$(DATE)" \
		--source-repository "https://github.com/dnoegel/rasterklang-desktop" \
		--artifact-kind "desktop-artifact" \
		--artifact-name "$(DIST_BASENAME)" \
		--target-os "$(DIST_OS)" \
		--target-arch "$(DIST_ARCH)" \
		--asset-version "$(ASSET_VERSION)" \
		--webplayer-artifact-sha256 "$(WEBPLAYER_ARTIFACT_SHA256)" \
		--build-command "make dist VERSION=$(VERSION)"

identity-preflight:
	node scripts/check-release-identity.mjs

standalone-preflight:
	node scripts/check-standalone-release.mjs

webplayer-lock-preflight:
	node scripts/check-webplayer-lock-release.mjs

release-preflight: identity-preflight standalone-preflight webplayer-lock-preflight

release: release-preflight dist

ifeq ($(UNAME_S),Darwin)
bundle: bundle-darwin
bundle-darwin: build license-report release-provenance
	rm -rf "$(APP_BUNDLE)" "$(APP_ICONSET)" "$(APP_ICNS)"
	mkdir -p "$(APP_MACOS)" "$(APP_RESOURCES)" "$(APP_ICONSET)"
	for size in 16 32 128 256 512; do \
		sips -z $$size $$size build/appicon.png --out "$(APP_ICONSET)/icon_$${size}x$${size}.png" >/dev/null; \
		sips -z $$((size * 2)) $$((size * 2)) build/appicon.png --out "$(APP_ICONSET)/icon_$${size}x$${size}@2x.png" >/dev/null; \
	done
	iconutil -c icns "$(APP_ICONSET)" -o "$(APP_ICNS)"
	cp bin/$(BINARY_NAME) "$(APP_MACOS)/$(BINARY_NAME)"
	cp "$(APP_ICNS)" "$(APP_RESOURCES)/iconfile.icns"
	cp CHANGELOG.md CONTRIBUTING.md LICENSE SECURITY.md THIRD_PARTY_NOTICES.md "$(LICENSE_REPORT)" "$(PROVENANCE)" "$(APP_RESOURCES)/"
	perl -0pe 's|(<key>CFBundleShortVersionString</key>\s*<string>)[^<]+(</string>)|$${1}$(PLIST_VERSION)$${2}|; s|(<key>CFBundleVersion</key>\s*<string>)[^<]+(</string>)|$${1}$(BUILD_NUMBER)$${2}|' packaging/darwin/Info.plist > "$(APP_CONTENTS)/Info.plist"
else
bundle bundle-darwin:
	@echo "bundle-darwin is only supported on macOS"
	@exit 1
endif

ifeq ($(UNAME_S),Darwin)
dist: dist-darwin
else
dist: dist-linux
endif

dist-linux: build license-report release-provenance
	rm -rf "$(DIST_WORK_ROOT)/$(DIST_BASENAME)"
	mkdir -p "$(DIST_WORK_ROOT)/$(DIST_BASENAME)/bin"
	mkdir -p "$(DIST_WORK_ROOT)/$(DIST_BASENAME)/share/applications"
	mkdir -p "$(DIST_WORK_ROOT)/$(DIST_BASENAME)/share/icons/hicolor/1024x1024/apps"
	install -m 0755 "bin/$(BINARY_NAME)" "$(DIST_WORK_ROOT)/$(DIST_BASENAME)/bin/$(INSTALL_BINARY_NAME)"
	install -m 0644 "packaging/linux/rasterklang.desktop" "$(DIST_WORK_ROOT)/$(DIST_BASENAME)/share/applications/rasterklang.desktop"
	install -m 0644 "build/appicon.png" "$(DIST_WORK_ROOT)/$(DIST_BASENAME)/share/icons/hicolor/1024x1024/apps/rasterklang.png"
	cp README.md CHANGELOG.md CONTRIBUTING.md LICENSE SECURITY.md THIRD_PARTY_NOTICES.md "$(LICENSE_REPORT)" "$(PROVENANCE)" "$(DIST_WORK_ROOT)/$(DIST_BASENAME)/"
	mkdir -p "$(DIST_DIR)"
	tar -C "$(DIST_WORK_ROOT)" -czf "$(DIST_ARCHIVE)" "$(DIST_BASENAME)"
	$(MAKE) checksum FILE="$(DIST_ARCHIVE)"
	$(MAKE) dist-deb

dist-deb: build license-report release-provenance
	node scripts/build-deb-package.mjs \
		--version "$(VERSION)" \
		--arch "$(DIST_ARCH)" \
		--binary "bin/$(BINARY_NAME)" \
		--icon "build/appicon.png" \
		--desktop-entry "packaging/linux/rasterklang.desktop" \
		--license-report "$(LICENSE_REPORT)" \
		--provenance "$(PROVENANCE)" \
		--out-dir "$(DIST_DIR)" \
		--work-root "$(DEB_WORK_ROOT)"

dist-darwin: bundle-darwin
	mkdir -p "$(DIST_DIR)"
	ditto -c -k --keepParent "$(APP_BUNDLE)" "$(DIST_APP_ZIP)"
	$(MAKE) checksum FILE="$(DIST_APP_ZIP)"

checksum:
	@if [ -z "$(FILE)" ]; then \
		echo "FILE is required"; \
		exit 1; \
	fi
	@if command -v sha256sum >/dev/null 2>&1; then \
		sha256sum "$(FILE)" > "$(FILE).sha256"; \
	else \
		shasum -a 256 "$(FILE)" > "$(FILE).sha256"; \
	fi

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
