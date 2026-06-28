package main

import (
	"log"
	"sync"
	"sync/atomic"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const nativeMediaControlEvent = "native.media-control"

type mediaControlCommand string
type mediaControlPlaybackState int

const (
	mediaControlCommandPlay     mediaControlCommand = "play"
	mediaControlCommandPause    mediaControlCommand = "pause"
	mediaControlCommandToggle   mediaControlCommand = "toggle"
	mediaControlCommandNext     mediaControlCommand = "next"
	mediaControlCommandPrevious mediaControlCommand = "previous"
)

const (
	mediaControlCodePlay = iota + 1
	mediaControlCodePause
	mediaControlCodeToggle
	mediaControlCodeNext
	mediaControlCodePrevious
)

const (
	mediaControlPlaybackStopped mediaControlPlaybackState = iota
	mediaControlPlaybackPlaying
	mediaControlPlaybackPaused
)

func mediaControlCommandFromCode(code int) (mediaControlCommand, bool) {
	switch code {
	case mediaControlCodePlay:
		return mediaControlCommandPlay, true
	case mediaControlCodePause:
		return mediaControlCommandPause, true
	case mediaControlCodeToggle:
		return mediaControlCommandToggle, true
	case mediaControlCodeNext:
		return mediaControlCommandNext, true
	case mediaControlCodePrevious:
		return mediaControlCommandPrevious, true
	default:
		return "", false
	}
}

func mediaControlPlaybackStateFromPlayback(state *PlaybackState) mediaControlPlaybackState {
	if state == nil || state.Tune == nil {
		return mediaControlPlaybackStopped
	}
	if state.Playing {
		return mediaControlPlaybackPlaying
	}
	if state.Paused {
		return mediaControlPlaybackPaused
	}
	return mediaControlPlaybackStopped
}

func (a *App) startMediaControls() {
	if a.stopMediaControls != nil {
		a.stopMediaControls()
		a.stopMediaControls = nil
	}
	dispatch, stopDispatch := newMediaControlCommandDispatcher(func(command string) {
		if a.ctx == nil {
			return
		}
		log.Printf("rasterklang-desktop: media command=%s", command)
		runtime.EventsEmit(a.ctx, nativeMediaControlEvent, command)
	})
	stopNative := startNativeMediaControls(dispatch)
	a.stopMediaControls = func() {
		stopNative()
		stopDispatch()
	}
	a.updateMediaControlPlaybackState(nil)
}

func (a *App) stopMediaControlsIfRunning() {
	if a.stopMediaControls == nil {
		return
	}
	a.stopMediaControls()
	a.stopMediaControls = nil
}

func (a *App) updateMediaControlPlaybackState(state *PlaybackState) {
	setNativeMediaPlaybackState(mediaControlPlaybackStateFromPlayback(state))
}

func newMediaControlCommandDispatcher(emit func(string)) (func(mediaControlCommand), func()) {
	commands := make(chan mediaControlCommand, 8)
	done := make(chan struct{})
	var stopOnce sync.Once
	var stopped atomic.Bool

	go func() {
		for {
			select {
			case command := <-commands:
				if emit != nil {
					emit(string(command))
				}
			case <-done:
				return
			}
		}
	}()

	dispatch := func(command mediaControlCommand) {
		if command == "" || stopped.Load() {
			return
		}
		select {
		case commands <- command:
		case <-done:
		default:
			log.Printf("rasterklang-desktop: dropped media command=%s", command)
		}
	}
	stop := func() {
		stopOnce.Do(func() {
			stopped.Store(true)
			close(done)
		})
	}
	return dispatch, stop
}
