package main

import (
	"fmt"
	"math"
)

func fmtCount(n int) string {
	if n < 1000 {
		return fmt.Sprintf("%d", n)
	}
	s := fmt.Sprintf("%d", n)
	out := ""
	for len(s) > 3 {
		out = "." + s[len(s)-3:] + out
		s = s[:len(s)-3]
	}
	return s + out
}

func fmtDuration(seconds float64) string {
	if seconds <= 0 || math.IsNaN(seconds) || math.IsInf(seconds, 0) {
		return "--:--"
	}
	total := int(math.Round(seconds))
	min := total / 60
	sec := total % 60
	return fmt.Sprintf("%d:%02d", min, sec)
}

func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}
