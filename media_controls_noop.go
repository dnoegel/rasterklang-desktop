//go:build !darwin

package main

func startNativeMediaControls(func(mediaControlCommand)) func() {
	return func() {}
}

func setNativeMediaPlaybackState(mediaControlPlaybackState) {}
