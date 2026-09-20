//go:build !windows

package main

import "fmt"

func launchInstalledApp(exePath string) error {
	return fmt.Errorf("Veloria Notes installer is Windows-only: %s", exePath)
}
