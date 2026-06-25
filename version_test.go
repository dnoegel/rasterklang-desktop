package main

import (
	"bytes"
	"strings"
	"testing"
)

func TestVersionFlagPrintsDesktopReleaseMetadata(t *testing.T) {
	var stdout, stderr bytes.Buffer
	oldVersion, oldCommit, oldDate := version, commit, date
	version, commit, date = "v1.2.3", "abc1234", "2026-06-24T18:00:00Z"
	defer func() {
		version, commit, date = oldVersion, oldCommit, oldDate
	}()

	handled, code := handleCommandLine([]string{"--version"}, &stdout, &stderr)

	if !handled {
		t.Fatal("--version should be handled before Wails startup")
	}
	if code != 0 {
		t.Fatalf("handleCommandLine returned %d, want 0; stderr=%q", code, stderr.String())
	}
	got := stdout.String()
	for _, want := range []string{
		"rasterklang-desktop v1.2.3",
		"commit abc1234",
		"built 2026-06-24T18:00:00Z",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("version output %q does not contain %q", got, want)
		}
	}
}
