//go:build darwin

package main

import (
	"fmt"
	"log"
	"sync"

	"github.com/ebitengine/purego"
	"github.com/ebitengine/purego/objc"
)

const mediaCommandSuccess int64 = 0

type darwinMediaControls struct {
	commands []objc.ID
	targets  []objc.ID
	blocks   []objc.Block
}

var (
	mediaControlFrameworksOnce sync.Once
	mediaControlFrameworksErr  error
)

func startNativeMediaControls(emit func(mediaControlCommand)) func() {
	controls, err := newDarwinMediaControls(emit)
	if err != nil {
		log.Printf("rasterklang-desktop: media controls unavailable: %v", err)
		return func() {}
	}
	return controls.stop
}

func newDarwinMediaControls(emit func(mediaControlCommand)) (*darwinMediaControls, error) {
	if emit == nil {
		return nil, fmt.Errorf("media command callback is nil")
	}
	if err := loadMediaControlFrameworks(); err != nil {
		return nil, err
	}

	centerClass := objc.GetClass("MPRemoteCommandCenter")
	if centerClass == 0 {
		return nil, fmt.Errorf("MPRemoteCommandCenter class is unavailable")
	}

	center := objc.ID(centerClass).Send(objc.RegisterName("sharedCommandCenter"))
	if center == 0 {
		return nil, fmt.Errorf("MPRemoteCommandCenter sharedCommandCenter returned nil")
	}

	controls := &darwinMediaControls{}
	controls.register(center.Send(objc.RegisterName("playCommand")), mediaControlCodePlay, emit)
	controls.register(center.Send(objc.RegisterName("pauseCommand")), mediaControlCodePause, emit)
	controls.register(center.Send(objc.RegisterName("togglePlayPauseCommand")), mediaControlCodeToggle, emit)
	controls.register(center.Send(objc.RegisterName("nextTrackCommand")), mediaControlCodeNext, emit)
	controls.register(center.Send(objc.RegisterName("previousTrackCommand")), mediaControlCodePrevious, emit)
	return controls, nil
}

func (c *darwinMediaControls) register(command objc.ID, code int, emit func(mediaControlCommand)) {
	if command == 0 {
		return
	}
	command.Send(objc.RegisterName("setEnabled:"), true)
	block := objc.NewBlock(func(_ objc.Block, _ objc.ID) int64 {
		if command, ok := mediaControlCommandFromCode(code); ok {
			emit(command)
		}
		return mediaCommandSuccess
	})
	target := command.Send(objc.RegisterName("addTargetWithHandler:"), block)
	c.commands = append(c.commands, command)
	c.targets = append(c.targets, target)
	c.blocks = append(c.blocks, block)
}

func (c *darwinMediaControls) stop() {
	removeTarget := objc.RegisterName("removeTarget:")
	for index, command := range c.commands {
		if command == 0 || index >= len(c.targets) || c.targets[index] == 0 {
			continue
		}
		command.Send(removeTarget, c.targets[index])
	}
	for _, block := range c.blocks {
		if block != 0 {
			block.Release()
		}
	}
	c.commands = nil
	c.targets = nil
	c.blocks = nil
}

func setNativeMediaPlaybackState(state mediaControlPlaybackState) {
	if err := loadMediaControlFrameworks(); err != nil {
		log.Printf("rasterklang-desktop: media playback state unavailable: %v", err)
		return
	}
	centerClass := objc.GetClass("MPNowPlayingInfoCenter")
	if centerClass == 0 {
		return
	}
	center := objc.ID(centerClass).Send(objc.RegisterName("defaultCenter"))
	if center == 0 {
		return
	}
	center.Send(objc.RegisterName("setPlaybackState:"), int(state))
}

func loadMediaControlFrameworks() error {
	mediaControlFrameworksOnce.Do(func() {
		if _, err := purego.Dlopen("/System/Library/Frameworks/Foundation.framework/Foundation", purego.RTLD_GLOBAL|purego.RTLD_NOW); err != nil {
			mediaControlFrameworksErr = fmt.Errorf("load Foundation.framework: %w", err)
			return
		}
		if _, err := purego.Dlopen("/System/Library/Frameworks/MediaPlayer.framework/MediaPlayer", purego.RTLD_GLOBAL|purego.RTLD_NOW); err != nil {
			mediaControlFrameworksErr = fmt.Errorf("load MediaPlayer.framework: %w", err)
			return
		}
	})
	return mediaControlFrameworksErr
}
