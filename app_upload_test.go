package main

import (
	"encoding/binary"
	"testing"
)

func TestLoadUploadedTuneUsesNativeSIDMetadata(t *testing.T) {
	app := testApp(t)

	state, err := app.LoadUploadedTune("picked-name.sid", testPSID("Native Upload", "Test Author", 2, 2))
	if err != nil {
		t.Fatalf("LoadUploadedTune returned error: %v", err)
	}

	if state.Tune == nil {
		t.Fatal("expected loaded upload tune")
	}
	if state.Tune.Metadata.Title != "Native Upload" {
		t.Fatalf("title = %q, want Native Upload", state.Tune.Metadata.Title)
	}
	if state.Tune.Metadata.Author != "Test Author" {
		t.Fatalf("author = %q, want Test Author", state.Tune.Metadata.Author)
	}
	if state.Tune.Metadata.SubtuneCount != 2 {
		t.Fatalf("subtune count = %d, want 2", state.Tune.Metadata.SubtuneCount)
	}
	if state.Tune.Metadata.DefaultSubtune != 2 {
		t.Fatalf("default subtune = %d, want 2", state.Tune.Metadata.DefaultSubtune)
	}
	if state.Tune.Source.Kind != "upload" {
		t.Fatalf("source kind = %q, want upload", state.Tune.Source.Kind)
	}
	if state.Tune.Source.File != "picked-name.sid" {
		t.Fatalf("source file = %q, want picked-name.sid", state.Tune.Source.File)
	}
	if state.CurrentSubtune != 2 {
		t.Fatalf("current subtune = %d, want 2", state.CurrentSubtune)
	}
}

func TestPlayUploadedTuneRejectsPlaybackWithoutLoadedUpload(t *testing.T) {
	app := testApp(t)

	_, err := app.PlayUploadedTune(1, 0)
	if err == nil {
		t.Fatal("expected PlayUploadedTune to require a loaded upload")
	}
}

func testApp(t *testing.T) *App {
	t.Helper()
	app, err := NewApp(testManifest(t))
	if err != nil {
		t.Fatalf("NewApp returned error: %v", err)
	}
	return app
}

func testManifest(t *testing.T) []byte {
	t.Helper()
	return []byte(`{
		"generatedAt": "2026-06-25T00:00:00Z",
		"tracks": [],
		"artists": []
	}`)
}

func testPSID(title, author string, songs, defaultSong uint16) []byte {
	data := make([]byte, 0x7c+4)
	copy(data[0:4], "PSID")
	binary.BigEndian.PutUint16(data[4:6], 2)
	binary.BigEndian.PutUint16(data[6:8], 0x7c)
	binary.BigEndian.PutUint16(data[8:10], 0x1000)
	binary.BigEndian.PutUint16(data[10:12], 0x1000)
	binary.BigEndian.PutUint16(data[12:14], 0x1003)
	binary.BigEndian.PutUint16(data[14:16], songs)
	binary.BigEndian.PutUint16(data[16:18], defaultSong)
	copy(data[0x16:0x36], title)
	copy(data[0x36:0x56], author)
	copy(data[0x56:0x76], "2026")
	binary.BigEndian.PutUint16(data[0x76:0x78], 0x0014)
	copy(data[0x7c:], []byte{0xea, 0xea, 0x60, 0x60})
	return data
}
