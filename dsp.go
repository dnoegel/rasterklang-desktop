package main

import "math"

type biquad struct {
	b0, b1, b2 float64
	a1, a2     float64
	z1, z2     float64
}

func (f *biquad) reset() {
	f.b0, f.b1, f.b2 = 1, 0, 0
	f.a1, f.a2 = 0, 0
	f.z1, f.z2 = 0, 0
}

func (f *biquad) process(in float64) float64 {
	out := f.b0*in + f.z1
	f.z1 = f.b1*in - f.a1*out + f.z2
	f.z2 = f.b2*in - f.a2*out
	return out
}

func (f *biquad) setLowShelf(freq, sampleRate, gainDB float64) {
	A := math.Pow(10, gainDB/40)
	w0 := 2 * math.Pi * freq / sampleRate
	cosw := math.Cos(w0)
	sinw := math.Sin(w0)
	S := 1.0
	alpha := sinw / 2 * math.Sqrt((A+1/A)*(1/S-1)+2)
	twoSqrtA := 2 * math.Sqrt(A) * alpha
	b0 := A * ((A + 1) - (A-1)*cosw + twoSqrtA)
	b1 := 2 * A * ((A - 1) - (A+1)*cosw)
	b2 := A * ((A + 1) - (A-1)*cosw - twoSqrtA)
	a0 := (A + 1) + (A-1)*cosw + twoSqrtA
	a1 := -2 * ((A - 1) + (A+1)*cosw)
	a2 := (A + 1) + (A-1)*cosw - twoSqrtA
	f.b0, f.b1, f.b2 = b0/a0, b1/a0, b2/a0
	f.a1, f.a2 = a1/a0, a2/a0
}

func (f *biquad) setHighShelf(freq, sampleRate, gainDB float64) {
	A := math.Pow(10, gainDB/40)
	w0 := 2 * math.Pi * freq / sampleRate
	cosw := math.Cos(w0)
	sinw := math.Sin(w0)
	S := 1.0
	alpha := sinw / 2 * math.Sqrt((A+1/A)*(1/S-1)+2)
	twoSqrtA := 2 * math.Sqrt(A) * alpha
	b0 := A * ((A + 1) + (A-1)*cosw + twoSqrtA)
	b1 := -2 * A * ((A - 1) + (A+1)*cosw)
	b2 := A * ((A + 1) + (A-1)*cosw - twoSqrtA)
	a0 := (A + 1) - (A-1)*cosw + twoSqrtA
	a1 := 2 * ((A - 1) - (A+1)*cosw)
	a2 := (A + 1) - (A-1)*cosw - twoSqrtA
	f.b0, f.b1, f.b2 = b0/a0, b1/a0, b2/a0
	f.a1, f.a2 = a1/a0, a2/a0
}

func (f *biquad) setPeaking(freq, sampleRate, q, gainDB float64) {
	A := math.Pow(10, gainDB/40)
	w0 := 2 * math.Pi * freq / sampleRate
	cosw := math.Cos(w0)
	sinw := math.Sin(w0)
	alpha := sinw / (2 * q)
	b0 := 1 + alpha*A
	b1 := -2 * cosw
	b2 := 1 - alpha*A
	a0 := 1 + alpha/A
	a1 := -2 * cosw
	a2 := 1 - alpha/A
	f.b0, f.b1, f.b2 = b0/a0, b1/a0, b2/a0
	f.a1, f.a2 = a1/a0, a2/a0
}

func newLowShelf(freq, sampleRate, gainDB float64) biquad {
	var b biquad
	b.setLowShelf(freq, sampleRate, gainDB)
	return b
}

func newHighShelf(freq, sampleRate, gainDB float64) biquad {
	var b biquad
	b.setHighShelf(freq, sampleRate, gainDB)
	return b
}

func newPeaking(freq, sampleRate, q, gainDB float64) biquad {
	var b biquad
	b.setPeaking(freq, sampleRate, q, gainDB)
	return b
}

// goertzelMag returns approximate magnitude (0..1) of the given frequency
// band within samples of length N at sampleRate Hz. Window is implicit.
func goertzelMag(samples []int16, freq, sampleRate float64) float64 {
	if len(samples) == 0 {
		return 0
	}
	n := len(samples)
	w := 2 * math.Pi * freq / sampleRate
	cosw := math.Cos(w)
	coeff := 2 * cosw
	var s0, s1, s2 float64
	for _, s := range samples {
		v := float64(s) / 32768.0
		s0 = v + coeff*s1 - s2
		s2 = s1
		s1 = s0
	}
	mag := math.Sqrt(s1*s1 + s2*s2 - coeff*s1*s2)
	return mag * 2 / float64(n)
}

// spectrumBands computes magnitudes for `bands` log-spaced frequency bins
// between fMin..fMax (Hz). Output values are in 0..~1 range (clipped later).
func spectrumBands(samples []int16, sampleRate float64, bands int, fMin, fMax float64) []float64 {
	if bands <= 0 {
		return nil
	}
	out := make([]float64, bands)
	if len(samples) == 0 {
		return out
	}
	logMin := math.Log(fMin)
	logMax := math.Log(fMax)
	for i := 0; i < bands; i++ {
		t := (float64(i) + 0.5) / float64(bands)
		freq := math.Exp(logMin + (logMax-logMin)*t)
		out[i] = goertzelMag(samples, freq, sampleRate)
	}
	return out
}

// noteName returns a human-friendly note name for the given frequency (Hz).
// Returns "—" if the frequency is too low to be musical.
func noteName(freq float64) string {
	if freq < 8 {
		return "—"
	}
	noteNum := 12*math.Log2(freq/440) + 69
	rounded := int(math.Round(noteNum))
	if rounded < 0 {
		rounded = 0
	}
	octave := rounded/12 - 1
	names := []string{"C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"}
	idx := rounded % 12
	return names[idx] + itoa(octave)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [16]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}

// sidFreqHz converts a SID frequency register value to Hz given a clock string.
func sidFreqHz(reg uint16, clock string) float64 {
	clockHz := 985248.0
	switch clock {
	case "NTSC", "ntsc":
		clockHz = 1022730.0
	}
	return float64(reg) * clockHz / 16777216.0
}

// SID waveform control bits.
const (
	WaveTriangle = 0x10
	WaveSawtooth = 0x20
	WavePulse    = 0x40
	WaveNoise    = 0x80
)

// synthVoiceWave returns a normalized [-1, 1] waveform sample for one cycle
// using the SID waveform control byte, with `phase` in [0, 1) and `duty` the
// pulse-width duty cycle (0..1). When multiple waveforms are enabled, results
// are bit-AND'd in the real chip; here we approximate by averaging which is
// good enough for a preview.
func synthVoiceWave(control byte, phase, duty float64) float64 {
	if control&0xf0 == 0 {
		return 0
	}
	count := 0.0
	sum := 0.0
	if control&WaveTriangle != 0 {
		var v float64
		if phase < 0.5 {
			v = phase*4 - 1
		} else {
			v = 3 - phase*4
		}
		sum += v
		count++
	}
	if control&WaveSawtooth != 0 {
		sum += phase*2 - 1
		count++
	}
	if control&WavePulse != 0 {
		if phase < duty {
			sum += 1
		} else {
			sum -= 1
		}
		count++
	}
	if control&WaveNoise != 0 {
		sum += pseudoNoise(phase)
		count++
	}
	if count == 0 {
		return 0
	}
	return sum / count
}

// pseudoNoise returns a deterministic noise sample for a phase in [0, 1).
// Not the SID's actual LFSR — just a fast hash for visualization.
func pseudoNoise(phase float64) float64 {
	x := math.Sin(phase*12.9898*2*math.Pi) * 43758.5453
	_, frac := math.Modf(x)
	return frac*2 - 1
}

// voiceHarmonics returns the magnitudes of the first n harmonics for a SID
// waveform combination at the given duty cycle, normalised so the largest
// component is 1.0.
func voiceHarmonics(control byte, duty float64, n int) []float64 {
	if n <= 0 {
		return nil
	}
	out := make([]float64, n)
	if control&0xf0 == 0 {
		return out
	}
	for i := 1; i <= n; i++ {
		var amp float64
		if control&WaveTriangle != 0 {
			if i%2 == 1 {
				amp += 8 / (math.Pi * math.Pi) / float64(i*i)
			}
		}
		if control&WaveSawtooth != 0 {
			amp += 2 / math.Pi / float64(i)
		}
		if control&WavePulse != 0 {
			d := duty
			if d <= 0 {
				d = 0.001
			}
			if d >= 1 {
				d = 0.999
			}
			amp += math.Abs(2*math.Sin(math.Pi*d*float64(i))/(math.Pi*float64(i))) * 0.9
		}
		if control&WaveNoise != 0 {
			amp += 0.35 // flat-ish noise floor for visualisation
		}
		out[i-1] = amp
	}
	// normalise
	maxAmp := 0.0
	for _, a := range out {
		if a > maxAmp {
			maxAmp = a
		}
	}
	if maxAmp > 0 {
		for i := range out {
			out[i] /= maxAmp
		}
	}
	return out
}

// filterMagnitude computes the magnitude of an analog 2-pole biquad at `freq`
// with the given cutoff and Q for the active SID filter mode bits.
func filterMagnitude(freq, cutoffHz, q float64, mode byte) float64 {
	if cutoffHz <= 0 {
		if mode&0x4 != 0 {
			return 1
		}
		return 0
	}
	if q < 0.5 {
		q = 0.5
	}
	omega := freq / cutoffHz
	o2 := omega * omega
	denom := math.Sqrt(math.Pow(1-o2, 2) + (o2 / (q * q)))
	if denom <= 0 {
		denom = 1e-6
	}
	mag := 0.0
	count := 0
	if mode&0x1 != 0 {
		mag += 1.0 / denom
		count++
	}
	if mode&0x2 != 0 {
		mag += (omega / q) / denom
		count++
	}
	if mode&0x4 != 0 {
		mag += o2 / denom
		count++
	}
	if count == 0 {
		return 0
	}
	return mag / float64(count)
}
