package main

import (
	"testing"
	"time"
)

func TestMediaControlCommandFromCode(t *testing.T) {
	tests := []struct {
		code int
		want mediaControlCommand
		ok   bool
	}{
		{mediaControlCodePlay, mediaControlCommandPlay, true},
		{mediaControlCodePause, mediaControlCommandPause, true},
		{mediaControlCodeToggle, mediaControlCommandToggle, true},
		{mediaControlCodeNext, mediaControlCommandNext, true},
		{mediaControlCodePrevious, mediaControlCommandPrevious, true},
		{0, "", false},
		{99, "", false},
	}

	for _, tt := range tests {
		got, ok := mediaControlCommandFromCode(tt.code)
		if ok != tt.ok || got != tt.want {
			t.Fatalf("mediaControlCommandFromCode(%d) = %q, %t; want %q, %t", tt.code, got, ok, tt.want, tt.ok)
		}
	}
}

func TestMediaControlPlaybackStateFromPlayback(t *testing.T) {
	tests := []struct {
		name  string
		state *PlaybackState
		want  mediaControlPlaybackState
	}{
		{name: "nil", state: nil, want: mediaControlPlaybackStopped},
		{name: "no tune", state: &PlaybackState{Playing: true}, want: mediaControlPlaybackStopped},
		{name: "playing", state: &PlaybackState{Tune: &NativeTune{}, Playing: true}, want: mediaControlPlaybackPlaying},
		{name: "paused", state: &PlaybackState{Tune: &NativeTune{}, Paused: true}, want: mediaControlPlaybackPaused},
		{name: "loaded stopped", state: &PlaybackState{Tune: &NativeTune{}}, want: mediaControlPlaybackStopped},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := mediaControlPlaybackStateFromPlayback(tt.state); got != tt.want {
				t.Fatalf("mediaControlPlaybackStateFromPlayback() = %d; want %d", got, tt.want)
			}
		})
	}
}

func TestMediaControlCommandDispatcherEmitsAsynchronously(t *testing.T) {
	emitted := make(chan string, 1)
	dispatch, stop := newMediaControlCommandDispatcher(func(command string) {
		emitted <- command
	})
	defer stop()

	dispatch(mediaControlCommandToggle)

	select {
	case got := <-emitted:
		if got != string(mediaControlCommandToggle) {
			t.Fatalf("emitted command = %q; want %q", got, mediaControlCommandToggle)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for media command dispatch")
	}
}

func TestMediaControlCommandDispatcherDropsAfterStop(t *testing.T) {
	emitted := make(chan string, 1)
	dispatch, stop := newMediaControlCommandDispatcher(func(command string) {
		emitted <- command
	})

	stop()
	dispatch(mediaControlCommandPlay)

	select {
	case got := <-emitted:
		t.Fatalf("emitted command after stop: %q", got)
	case <-time.After(20 * time.Millisecond):
	}
}
