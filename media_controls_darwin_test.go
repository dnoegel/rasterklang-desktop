//go:build darwin

package main

import (
	"reflect"
	"testing"
)

func TestDarwinMediaCommandSuccessUsesNSIntegerWidth(t *testing.T) {
	if got := reflect.TypeOf(mediaCommandSuccess).Kind(); got != reflect.Int64 {
		t.Fatalf("mediaCommandSuccess kind = %s; want int64", got)
	}
}
