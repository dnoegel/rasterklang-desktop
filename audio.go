package main

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"sync"
	"time"

	sid "github.com/dnoegel/zmk-sid"
	"github.com/ebitengine/oto/v3"
)

const (
	audioSampleRate        = 44100
	audioPlayerBufferBytes = 2048
	audioContextBuffer     = 40 * time.Millisecond
	audioReadSamples       = 1024
)

type EQSettings struct {
	Enabled bool
	Bass    float64
	Mid     float64
	Treble  float64
}

type AudioEngine struct {
	controlMu   sync.Mutex
	mu          sync.RWMutex
	ctx         *oto.Context
	player      *oto.Player
	reader      *sidReader
	current     *Track
	currentPath string
	subtune     int
	volume      float64
	muted       bool
	playing     bool
	paused      bool
	lastError   string
	eq          EQSettings
	controls    sid.AudioControls
}

type PlayerSnapshot struct {
	Ready       bool
	Track       *Track
	Subtune     int
	Subtunes    int
	Elapsed     float64
	Duration    float64
	Playing     bool
	Paused      bool
	Volume      float64
	Muted       bool
	Error       string
	HasSnapshot bool
	Debug       sid.DebugSnapshot
}

func NewAudioEngine() *AudioEngine {
	return &AudioEngine{
		volume: 0.78,
		eq:     EQSettings{Enabled: true, Bass: 0, Mid: 0, Treble: 0},
		controls: sid.AudioControls{
			VoiceMask:    0x07,
			FilterBypass: false,
		},
	}
}

func (e *AudioEngine) EQ() EQSettings {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.eq
}

func (e *AudioEngine) SetEQ(settings EQSettings) {
	e.mu.Lock()
	e.eq = settings
	reader := e.reader
	e.mu.Unlock()
	if reader != nil {
		reader.SetEQ(settings)
	}
}

func (e *AudioEngine) AudioControls() sid.AudioControls {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.controls
}

func (e *AudioEngine) SetAudioControls(controls sid.AudioControls) {
	if controls.VoiceMask > 0x07 {
		controls.VoiceMask = 0x07
	}
	e.mu.Lock()
	e.controls = controls
	reader := e.reader
	e.mu.Unlock()
	if reader != nil {
		reader.SetAudioControls(controls)
	}
}

func (e *AudioEngine) PlayTrack(track *Track, path string, subtune int, startAt float64) error {
	if track == nil {
		return fmt.Errorf("no track selected")
	}
	e.controlMu.Lock()
	defer e.controlMu.Unlock()

	e.stop()

	tune, err := sid.LoadFile(path)
	if err != nil {
		e.setError(err)
		return err
	}
	if subtune <= 0 {
		subtune = track.DefaultSubtune
	}
	if subtune <= 0 {
		subtune = int(tune.StartSong)
	}
	stream, err := sid.NewDebugStream(tune, sid.DebugOptions{
		Subtune:      subtune,
		SampleRate:   audioSampleRate,
		TraceMask:    0,
		SoundProfile: nil,
	})
	if err != nil {
		e.setError(err)
		return err
	}
	e.mu.RLock()
	controls := e.controls
	eq := e.eq
	e.mu.RUnlock()
	stream.SetAudioControls(controls)

	reader := newSIDReader(stream, audioSampleRate)
	reader.SetEQ(eq)
	if startAt > 0 {
		if err := reader.SkipSeconds(startAt); err != nil {
			e.setError(err)
			return err
		}
	}
	ctx, err := e.ensureContext()
	if err != nil {
		e.setError(err)
		return err
	}
	player := ctx.NewPlayer(reader)
	player.SetBufferSize(audioPlayerBufferBytes)

	e.mu.Lock()
	e.player = player
	e.reader = reader
	e.current = track
	e.currentPath = path
	e.subtune = subtune
	e.playing = true
	e.paused = false
	e.lastError = ""
	volume := e.volume
	muted := e.muted
	e.mu.Unlock()

	if muted {
		player.SetVolume(0)
	} else {
		player.SetVolume(volume)
	}
	player.Play()
	return nil
}

func (e *AudioEngine) TogglePlay() bool {
	e.controlMu.Lock()
	defer e.controlMu.Unlock()

	e.mu.Lock()
	player := e.player
	if player == nil {
		e.mu.Unlock()
		return false
	}
	shouldPlay := true
	if e.playing && !e.paused {
		shouldPlay = false
		e.paused = true
		e.playing = false
	} else {
		e.paused = false
		e.playing = true
	}
	e.mu.Unlock()

	if shouldPlay {
		player.Play()
	} else {
		player.Pause()
	}
	if err := player.Err(); err != nil {
		e.setError(err)
	}
	return true
}

func (e *AudioEngine) Stop() {
	e.controlMu.Lock()
	defer e.controlMu.Unlock()
	e.stop()
}

func (e *AudioEngine) SetVolume(volume float64) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.volume = clamp01(volume)
	if e.player != nil {
		if e.muted {
			e.player.SetVolume(0)
		} else {
			e.player.SetVolume(e.volume)
		}
	}
}

func (e *AudioEngine) ToggleMute() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.muted = !e.muted
	if e.player != nil {
		if e.muted {
			e.player.SetVolume(0)
		} else {
			e.player.SetVolume(e.volume)
		}
	}
}

func (e *AudioEngine) Snapshot() PlayerSnapshot {
	e.mu.RLock()
	reader := e.reader
	track := e.current
	subtune := e.subtune
	playing := e.playing
	paused := e.paused
	volume := e.volume
	muted := e.muted
	errText := e.lastError
	e.mu.RUnlock()

	snap := PlayerSnapshot{
		Ready:    true,
		Track:    track,
		Subtune:  subtune,
		Playing:  playing,
		Paused:   paused,
		Volume:   volume,
		Muted:    muted,
		Error:    errText,
		Subtunes: 1,
	}
	if track != nil {
		snap.Subtunes = max(1, track.Subtunes)
		if subtune > 0 && subtune <= len(track.Durations) {
			snap.Duration = track.Durations[subtune-1]
		}
		if snap.Duration <= 0 {
			snap.Duration = track.Duration
		}
	}
	if reader != nil {
		snap.Elapsed = reader.Elapsed()
		if debug, ok := reader.DebugSnapshot(); ok {
			snap.Debug = debug
			snap.HasSnapshot = true
		}
		if err := reader.Err(); err != nil && !errors.Is(err, io.EOF) {
			snap.Error = err.Error()
		}
	}
	return snap
}

func (e *AudioEngine) ScopeSamples() []int16 {
	e.mu.RLock()
	reader := e.reader
	e.mu.RUnlock()
	if reader == nil {
		return nil
	}
	return reader.ScopeSamples()
}

func (e *AudioEngine) SpectrumSamples() []int16 {
	e.mu.RLock()
	reader := e.reader
	e.mu.RUnlock()
	if reader == nil {
		return nil
	}
	return reader.SpectrumSamples()
}

func (e *AudioEngine) CurrentForReplay() (*Track, string, int) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.current, e.currentPath, e.subtune
}

func (e *AudioEngine) ensureContext() (*oto.Context, error) {
	e.mu.RLock()
	ctx := e.ctx
	e.mu.RUnlock()
	if ctx != nil {
		return ctx, nil
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.ctx != nil {
		return e.ctx, nil
	}
	ctx, ready, err := oto.NewContext(&oto.NewContextOptions{
		SampleRate:   audioSampleRate,
		ChannelCount: 1,
		Format:       oto.FormatSignedInt16LE,
		BufferSize:   audioContextBuffer,
	})
	if err != nil {
		return nil, fmt.Errorf("open audio device: %w", err)
	}
	<-ready
	e.ctx = ctx
	return ctx, nil
}

func (e *AudioEngine) stop() {
	e.mu.Lock()
	player := e.player
	reader := e.reader
	e.player = nil
	e.reader = nil
	e.playing = false
	e.paused = false
	e.mu.Unlock()

	if player != nil {
		player.Pause()
	}
	if reader != nil {
		reader.Stop()
	}
}

func (e *AudioEngine) setError(err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err != nil {
		e.lastError = err.Error()
	}
}

type sidReader struct {
	stream     *sid.DebugStream
	sampleRate int
	stop       chan struct{}
	stopOnce   sync.Once

	readMu  sync.Mutex
	pending []byte

	mu           sync.RWMutex
	scope        []int16
	scopePos     int
	spectrum     []int16
	spectrumPos  int
	samplesRead  int64
	lastSnapshot sid.DebugSnapshot
	hasSnapshot  bool
	err          error

	eqMu   sync.RWMutex
	eq     EQSettings
	bass   biquad
	mid    biquad
	treble biquad
}

func newSIDReader(stream *sid.DebugStream, sampleRate int) *sidReader {
	r := &sidReader{
		stream:     stream,
		sampleRate: sampleRate,
		stop:       make(chan struct{}),
		scope:      make([]int16, 1024),
		spectrum:   make([]int16, 4096),
	}
	r.bass = newLowShelf(120, float64(sampleRate), 0)
	r.mid = newPeaking(1100, float64(sampleRate), 0.9, 0)
	r.treble = newHighShelf(8000, float64(sampleRate), 0)
	return r
}

func (r *sidReader) SetEQ(settings EQSettings) {
	r.eqMu.Lock()
	defer r.eqMu.Unlock()
	r.eq = settings
	if !settings.Enabled {
		r.bass.reset()
		r.mid.reset()
		r.treble.reset()
		return
	}
	r.bass.setLowShelf(120, float64(r.sampleRate), settings.Bass)
	r.mid.setPeaking(1100, float64(r.sampleRate), 0.9, settings.Mid)
	r.treble.setHighShelf(8000, float64(r.sampleRate), settings.Treble)
}

func (r *sidReader) SetAudioControls(controls sid.AudioControls) {
	r.readMu.Lock()
	defer r.readMu.Unlock()
	r.stream.SetAudioControls(controls)
}

func (r *sidReader) applyEQ(samples []int16) {
	r.eqMu.RLock()
	enabled := r.eq.Enabled
	r.eqMu.RUnlock()
	if !enabled {
		return
	}
	r.eqMu.Lock()
	defer r.eqMu.Unlock()
	for i, s := range samples {
		v := float64(s)
		v = r.bass.process(v)
		v = r.mid.process(v)
		v = r.treble.process(v)
		if v > 32767 {
			v = 32767
		} else if v < -32768 {
			v = -32768
		}
		samples[i] = int16(v)
	}
}

func (r *sidReader) Read(dst []byte) (int, error) {
	r.readMu.Lock()
	defer r.readMu.Unlock()

	total := 0
	for total < len(dst) {
		select {
		case <-r.stop:
			if total > 0 {
				return total, nil
			}
			return 0, io.EOF
		default:
		}
		if len(r.pending) == 0 {
			if err := r.fill(); err != nil {
				if total > 0 {
					return total, nil
				}
				return 0, err
			}
			if len(r.pending) == 0 {
				if total > 0 {
					return total, nil
				}
				return 0, nil
			}
		}
		n := copy(dst[total:], r.pending)
		r.pending = r.pending[n:]
		total += n
	}
	return total, nil
}

func (r *sidReader) Stop() {
	r.stopOnce.Do(func() {
		close(r.stop)
	})
}

func (r *sidReader) SkipSeconds(seconds float64) error {
	if seconds <= 0 {
		return nil
	}
	samples := int(seconds * float64(r.sampleRate))
	buf := make([]int16, 4096)
	for samples > 0 {
		chunk := min(samples, len(buf))
		n, err := r.stream.ReadSamples(buf[:chunk])
		r.mu.Lock()
		r.samplesRead += int64(n)
		if n > 0 {
			r.lastSnapshot = r.stream.Snapshot()
			r.hasSnapshot = true
		}
		r.mu.Unlock()
		samples -= n
		if err != nil {
			r.storeErr(err)
			return err
		}
		if n == 0 {
			return io.EOF
		}
	}
	return nil
}

func (r *sidReader) Elapsed() float64 {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return float64(r.samplesRead) / float64(r.sampleRate)
}

func (r *sidReader) Err() error {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.err
}

func (r *sidReader) ScopeSamples() []int16 {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]int16, len(r.scope))
	copy(out, r.scope[r.scopePos:])
	copy(out[len(r.scope)-r.scopePos:], r.scope[:r.scopePos])
	return out
}

func (r *sidReader) SpectrumSamples() []int16 {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]int16, len(r.spectrum))
	copy(out, r.spectrum[r.spectrumPos:])
	copy(out[len(r.spectrum)-r.spectrumPos:], r.spectrum[:r.spectrumPos])
	return out
}

func (r *sidReader) DebugSnapshot() (sid.DebugSnapshot, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.lastSnapshot, r.hasSnapshot
}

func (r *sidReader) fill() error {
	samples := make([]int16, audioReadSamples)
	n, err := r.stream.ReadSamples(samples)
	if n > 0 {
		r.applyEQ(samples[:n])
		r.pending = pcm16LE(samples[:n])
		r.mu.Lock()
		r.samplesRead += int64(n)
		for _, sample := range samples[:n] {
			r.scope[r.scopePos] = sample
			r.scopePos = (r.scopePos + 1) % len(r.scope)
			r.spectrum[r.spectrumPos] = sample
			r.spectrumPos = (r.spectrumPos + 1) % len(r.spectrum)
		}
		r.lastSnapshot = r.stream.Snapshot()
		r.hasSnapshot = true
		r.mu.Unlock()
	}
	if err != nil {
		r.storeErr(err)
		return err
	}
	return nil
}

func (r *sidReader) storeErr(err error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.err = err
}

func pcm16LE(samples []int16) []byte {
	out := make([]byte, len(samples)*2)
	for i, sample := range samples {
		binary.LittleEndian.PutUint16(out[i*2:], uint16(sample))
	}
	return out
}
