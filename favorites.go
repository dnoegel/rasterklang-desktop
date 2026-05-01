package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

type Favorites struct {
	mu   sync.RWMutex
	path string
	set  map[string]bool
}

func LoadFavorites() *Favorites {
	f := &Favorites{set: map[string]bool{}}
	if dir, err := os.UserConfigDir(); err == nil {
		f.path = filepath.Join(dir, "zmk-nativeplayer", "favorites.json")
	}
	if f.path == "" {
		return f
	}
	data, err := os.ReadFile(f.path)
	if err != nil {
		return f
	}
	var ids []string
	if json.Unmarshal(data, &ids) == nil {
		for _, id := range ids {
			f.set[id] = true
		}
	}
	return f
}

func (f *Favorites) Toggle(id string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.set[id] {
		delete(f.set, id)
		f.saveLocked()
		return false
	}
	f.set[id] = true
	f.saveLocked()
	return true
}

func (f *Favorites) Has(id string) bool {
	f.mu.RLock()
	defer f.mu.RUnlock()
	return f.set[id]
}

func (f *Favorites) Count() int {
	f.mu.RLock()
	defer f.mu.RUnlock()
	return len(f.set)
}

func (f *Favorites) Tracks(catalog *Catalog) []*Track {
	f.mu.RLock()
	defer f.mu.RUnlock()
	out := make([]*Track, 0, len(f.set))
	for _, track := range catalog.Tracks {
		if f.set[track.ID] {
			out = append(out, track)
		}
	}
	return out
}

func (f *Favorites) saveLocked() {
	if f.path == "" {
		return
	}
	ids := make([]string, 0, len(f.set))
	for id := range f.set {
		ids = append(ids, id)
	}
	data, err := json.MarshalIndent(ids, "", "  ")
	if err != nil {
		return
	}
	if err := os.MkdirAll(filepath.Dir(f.path), 0o755); err != nil {
		return
	}
	_ = os.WriteFile(f.path, data, 0o644)
}
