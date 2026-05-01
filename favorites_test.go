package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestFavoritesReplaceSortsAndPersistsIDs(t *testing.T) {
	path := filepath.Join(t.TempDir(), "favorites.json")
	favorites := &Favorites{
		path: path,
		set:  map[string]bool{},
	}

	got := favorites.Replace([]string{"track:b", "", "track:a", "track:b"})
	want := []string{"track:a", "track:b"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Replace() = %#v, want %#v", got, want)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	var saved []string
	if err := json.Unmarshal(data, &saved); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if !reflect.DeepEqual(saved, want) {
		t.Fatalf("saved IDs = %#v, want %#v", saved, want)
	}
}

func TestFavoritesAddManyMergesWithExistingIDs(t *testing.T) {
	favorites := &Favorites{
		path: filepath.Join(t.TempDir(), "favorites.json"),
		set:  map[string]bool{"track:b": true},
	}

	got := favorites.AddMany([]string{"track:a", "track:b", "track:c"})
	want := []string{"track:a", "track:b", "track:c"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("AddMany() = %#v, want %#v", got, want)
	}
}
