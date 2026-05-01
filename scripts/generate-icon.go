package main

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"math"
	"os"
	"path/filepath"
)

const (
	iconSize = 1024
	scale    = 4
)

func main() {
	if err := os.MkdirAll("build", 0o755); err != nil {
		fail(err)
	}
	if err := writePNG(filepath.Join("build", "appicon.png")); err != nil {
		fail(err)
	}
	if err := os.WriteFile(filepath.Join("build", "appicon.svg"), []byte(svgIcon()), 0o644); err != nil {
		fail(err)
	}
}

func writePNG(path string) error {
	img := image.NewRGBA(image.Rect(0, 0, iconSize*scale, iconSize*scale))
	drawIcon(img)

	out := downsample(img, scale)
	var buf bytes.Buffer
	enc := png.Encoder{CompressionLevel: png.BestCompression}
	if err := enc.Encode(&buf, out); err != nil {
		return err
	}
	return os.WriteFile(path, buf.Bytes(), 0o644)
}

func drawIcon(img *image.RGBA) {
	s := scale
	fillRoundedRect(img, 66*s, 60*s, 892*s, 900*s, 150*s, rgba(184, 179, 155, 255))
	fillRoundedRect(img, 78*s, 70*s, 868*s, 876*s, 136*s, rgba(126, 122, 103, 255))
	fillRoundedRect(img, 92*s, 86*s, 840*s, 850*s, 118*s, rgba(190, 185, 163, 255))
	fillRoundedRect(img, 112*s, 112*s, 800*s, 650*s, 44*s, rgba(15, 16, 17, 255))
	fillRoundedRect(img, 130*s, 128*s, 764*s, 614*s, 26*s, rgba(22, 23, 24, 255))
	drawEqualizer(img)
	drawGlyphs(img)
	drawBottomPanel(img)
	drawScanlines(img, 124*s, 124*s, 776*s, 620*s)
	fillRoundedRect(img, 82*s, 68*s, 864*s, 56*s, 28*s, rgba(255, 255, 255, 48))
	fillRoundedRect(img, 104*s, 758*s, 816*s, 10*s, 0, rgba(255, 255, 255, 185))
}

func drawWave(img *image.RGBA, phase float64, centerY, width int, col color.RGBA) {
	const points = 94
	var px, py int
	for i := 0; i < points; i++ {
		t := float64(i) / float64(points-1)
		x := int((120 + t*784) * scale)
		base := float64(centerY)
		y := int(base +
			math.Sin(t*math.Pi*7+phase)*float64(72*scale) +
			math.Sin(t*math.Pi*31+phase*0.6)*float64(20*scale))
		if i > 0 {
			drawRoundLine(img, px, py, x, y, width, col)
		}
		px, py = x, y
	}
}

func drawGlyphs(img *image.RGBA) {
	patterns := []struct {
		xoff int
		col  color.RGBA
		rows []string
	}{
		{0, rgba(126, 143, 255, 255), []string{
			"111110",
			"100001",
			"100001",
			"111110",
			"100100",
			"100010",
			"100001",
		}},
		{8, rgba(238, 238, 232, 255), []string{
			"10001",
			"10010",
			"10100",
			"11100",
			"10100",
			"10010",
			"10001",
		}},
	}

	cell := 50 * scale
	inset := 1 * scale
	x0 := 225 * scale
	y0 := 170 * scale
	shadow := 8 * scale

	for _, glyph := range patterns {
		for row, bits := range glyph.rows {
			for col, bit := range bits {
				if bit != '1' {
					continue
				}
				x := x0 + (glyph.xoff+col)*cell
				y := y0 + row*cell
				fillRoundedRect(img, x+inset+shadow, y+inset+shadow, cell-2*inset, cell-2*inset, 0, rgba(0, 0, 0, 120))
			}
		}
	}
	for _, glyph := range patterns {
		for row, bits := range glyph.rows {
			for col, bit := range bits {
				if bit != '1' {
					continue
				}
				x := x0 + (glyph.xoff+col)*cell
				y := y0 + row*cell
				fillRoundedRect(img, x+inset, y+inset, cell-2*inset, cell-2*inset, 0, glyph.col)
				fillRoundedRect(img, x+inset, y+inset, cell-2*inset, 5*scale, 0, rgba(255, 255, 255, 80))
			}
		}
	}
}

func drawEqualizer(img *image.RGBA) {
	s := scale
	heights := []int{54, 96, 74, 196, 118, 145, 238, 112, 176, 102, 186, 90, 206, 156, 98, 84, 104, 82, 70, 92, 76, 48}
	colors := []color.RGBA{
		rgba(106, 113, 245, 255), rgba(118, 129, 248, 255), rgba(134, 148, 250, 255),
		rgba(128, 190, 231, 255), rgba(144, 211, 229, 255), rgba(154, 222, 224, 255),
		rgba(135, 212, 93, 255), rgba(158, 216, 84, 255), rgba(184, 209, 79, 255),
		rgba(218, 206, 75, 255), rgba(225, 210, 80, 255), rgba(224, 184, 69, 255),
		rgba(219, 134, 61, 255), rgba(206, 103, 58, 255), rgba(199, 82, 54, 255),
	}
	x := 164 * s
	base := 704 * s
	barW := 22 * s
	gap := 10 * s
	for i, height := range heights {
		col := colors[min(i*len(colors)/len(heights), len(colors)-1)]
		drawSegmentedBar(img, x+i*(barW+gap), base, barW, height*s, col)
	}
}

func drawSegmentedBar(img *image.RGBA, x, base, w, h int, col color.RGBA) {
	step := 18 * scale
	gap := 5 * scale
	for y := base - step; y >= base-h; y -= step {
		fillRoundedRect(img, x, y, w, step-gap, 0, rgba(0, 0, 0, 80))
		fillRoundedRect(img, x, y, w, step-gap, 1*scale, col)
		fillRoundedRect(img, x, y, w, 2*scale, 0, rgba(255, 255, 255, 75))
	}
}

func drawBottomPanel(img *image.RGBA) {
	s := scale
	fillRoundedRect(img, 96*s, 760*s, 832*s, 160*s, 0, rgba(182, 176, 151, 255))
	fillRoundedRect(img, 116*s, 778*s, 792*s, 125*s, 52*s, rgba(171, 165, 140, 255))
	drawCMark(img, 156*s, 826*s)
	drawColorStripes(img)
	drawBadge64(img)
}

func drawCMark(img *image.RGBA, cx, cy int) {
	s := scale
	fillCircle(img, cx, cy, 48*s, rgba(33, 34, 32, 255))
	fillCircle(img, cx+6*s, cy, 28*s, rgba(171, 165, 140, 255))
	fillRoundedRect(img, cx+10*s, cy-52*s, 62*s, 104*s, 0, rgba(171, 165, 140, 255))
	fillRoundedRect(img, cx+33*s, cy-31*s, 44*s, 25*s, 0, rgba(42, 81, 155, 255))
	fillRoundedRect(img, cx+33*s, cy+6*s, 44*s, 25*s, 0, rgba(200, 58, 45, 255))
}

func drawColorStripes(img *image.RGBA) {
	s := scale
	cols := []color.RGBA{
		rgba(196, 68, 56, 255),
		rgba(214, 126, 50, 255),
		rgba(216, 186, 63, 255),
		rgba(116, 170, 75, 255),
		rgba(58, 96, 165, 255),
	}
	for i, col := range cols {
		y := (793 + i*17) * s
		fillRoundedRect(img, 274*s, y, 438*s, 9*s, 2*s, rgba(73, 70, 61, 80))
		fillRoundedRect(img, 274*s, y, 430*s, 7*s, 1*s, col)
	}
}

func drawBadge64(img *image.RGBA) {
	s := scale
	fillRoundedRect(img, 722*s, 784*s, 148*s, 76*s, 30*s, rgba(38, 39, 38, 255))
	fillRoundedRect(img, 734*s, 794*s, 124*s, 54*s, 19*s, rgba(25, 26, 27, 255))
	drawSmallPattern(img, 750*s, 808*s, 8*s, rgba(235, 235, 226, 255), []string{
		"1110 1  1",
		"1    1  1",
		"1    1  1",
		"1110 1111",
		"1  1    1",
		"1  1    1",
		"1110    1",
	})
}

func drawSmallPattern(img *image.RGBA, x, y, cell int, col color.RGBA, rows []string) {
	for row, bits := range rows {
		for c, bit := range bits {
			if bit == '1' {
				fillRoundedRect(img, x+c*cell, y+row*cell, cell-1*scale, cell-1*scale, 0, col)
			}
		}
	}
}

func drawScanlines(img *image.RGBA, x, y, w, h int) {
	for py := y; py < y+h; py += 7 * scale {
		fillRoundedRect(img, x, py, w, 1*scale, 0, rgba(255, 255, 255, 26))
		fillRoundedRect(img, x, py+3*scale, w, 1*scale, 0, rgba(0, 0, 0, 44))
	}
}

func fillRoundedRect(img *image.RGBA, x, y, w, h, r int, col color.RGBA) {
	maxX := x + w
	maxY := y + h
	rr := r * r
	for py := y; py < maxY; py++ {
		for px := x; px < maxX; px++ {
			cx := px
			if px < x+r {
				cx = x + r
			} else if px >= maxX-r {
				cx = maxX - r - 1
			}
			cy := py
			if py < y+r {
				cy = y + r
			} else if py >= maxY-r {
				cy = maxY - r - 1
			}
			dx := px - cx
			dy := py - cy
			if dx*dx+dy*dy > rr {
				continue
			}
			setBlend(img, px, py, col)
		}
	}
}

func drawRoundLine(img *image.RGBA, x1, y1, x2, y2, width int, col color.RGBA) {
	dx := x2 - x1
	dy := y2 - y1
	steps := max(abs(dx), abs(dy))
	if steps == 0 {
		fillCircle(img, x1, y1, width/2, col)
		return
	}
	for i := 0; i <= steps; i += max(1, width/4) {
		t := float64(i) / float64(steps)
		x := x1 + int(float64(dx)*t)
		y := y1 + int(float64(dy)*t)
		fillCircle(img, x, y, width/2, col)
	}
}

func fillCircle(img *image.RGBA, cx, cy, r int, col color.RGBA) {
	rr := r * r
	for y := cy - r; y <= cy+r; y++ {
		for x := cx - r; x <= cx+r; x++ {
			dx := x - cx
			dy := y - cy
			if dx*dx+dy*dy <= rr {
				setBlend(img, x, y, col)
			}
		}
	}
}

func downsample(src *image.RGBA, factor int) *image.RGBA {
	b := src.Bounds()
	dst := image.NewRGBA(image.Rect(0, 0, b.Dx()/factor, b.Dy()/factor))
	for y := 0; y < dst.Bounds().Dy(); y++ {
		for x := 0; x < dst.Bounds().Dx(); x++ {
			var r, g, b, a int
			for yy := 0; yy < factor; yy++ {
				for xx := 0; xx < factor; xx++ {
					i := src.PixOffset(x*factor+xx, y*factor+yy)
					r += int(src.Pix[i+0])
					g += int(src.Pix[i+1])
					b += int(src.Pix[i+2])
					a += int(src.Pix[i+3])
				}
			}
			n := factor * factor
			dst.SetRGBA(x, y, color.RGBA{uint8(r / n), uint8(g / n), uint8(b / n), uint8(a / n)})
		}
	}
	return dst
}

func setBlend(img *image.RGBA, x, y int, src color.RGBA) {
	if !image.Pt(x, y).In(img.Bounds()) || src.A == 0 {
		return
	}
	i := img.PixOffset(x, y)
	if src.A == 255 {
		img.Pix[i+0] = src.R
		img.Pix[i+1] = src.G
		img.Pix[i+2] = src.B
		img.Pix[i+3] = src.A
		return
	}
	sa := float64(src.A) / 255
	da := float64(img.Pix[i+3]) / 255
	oa := sa + da*(1-sa)
	if oa == 0 {
		return
	}
	sr := float64(src.R) / 255
	sg := float64(src.G) / 255
	sb := float64(src.B) / 255
	dr := float64(img.Pix[i+0]) / 255
	dg := float64(img.Pix[i+1]) / 255
	db := float64(img.Pix[i+2]) / 255
	img.Pix[i+0] = uint8(clamp255((sr*sa + dr*da*(1-sa)) / oa * 255))
	img.Pix[i+1] = uint8(clamp255((sg*sa + dg*da*(1-sa)) / oa * 255))
	img.Pix[i+2] = uint8(clamp255((sb*sa + db*da*(1-sa)) / oa * 255))
	img.Pix[i+3] = uint8(clamp255(oa * 255))
}

func svgIcon() string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect x="66" y="60" width="892" height="900" rx="150" fill="#b8b39b"/>
  <rect x="92" y="86" width="840" height="850" rx="118" fill="#beb9a3"/>
  <rect x="112" y="112" width="800" height="650" rx="44" fill="#101112"/>
  <text x="245" y="568" font-family="monospace" font-size="420" font-weight="900" fill="#7e8fff">R</text>
  <text x="525" y="568" font-family="monospace" font-size="420" font-weight="900" fill="#eeeeea">K</text>
  <path d="M164 704h24v-54h-24zm72 0h24V508h-24zm108 0h24V466h-24zm108 0h24V518h-24zm108 0h24V498h-24zm108 0h24V600h-24zm108 0h24V612h-24zm108 0h24V652h-24z" fill="#8fd4e7"/>
  <rect x="96" y="760" width="832" height="160" fill="#b6b097"/>
  <circle cx="156" cy="826" r="48" fill="#222"/>
  <rect x="274" y="793" width="430" height="7" fill="#c44438"/>
  <rect x="274" y="810" width="430" height="7" fill="#d67e32"/>
  <rect x="274" y="827" width="430" height="7" fill="#d8ba3f"/>
  <rect x="274" y="844" width="430" height="7" fill="#74aa4b"/>
  <rect x="274" y="861" width="430" height="7" fill="#3a60a5"/>
  <rect x="722" y="784" width="148" height="76" rx="30" fill="#262726"/>
  <text x="748" y="844" font-family="monospace" font-size="62" font-weight="900" fill="#ebebe2">64</text>
</svg>
`
}

func rgba(r, g, b, a uint8) color.RGBA {
	return color.RGBA{R: r, G: g, B: b, A: a}
}

func clamp255(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 255 {
		return 255
	}
	return v
}

func abs(v int) int {
	if v < 0 {
		return -v
	}
	return v
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func fail(err error) {
	_, _ = fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
