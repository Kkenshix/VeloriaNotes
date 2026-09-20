//go:build windows

package main

import (
	"os/exec"
	"path/filepath"
	"syscall"
)

const (
	detachedProcess       = 0x00000008
	createNewProcessGroup = 0x00000200
	createBreakaway       = 0x01000000
)

func startDetached(exePath string, flags uint32) error {
	cmd := exec.Command(exePath)
	cmd.Dir = filepath.Dir(exePath)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:       true,
		CreationFlags:    flags,
		NoInheritHandles: true,
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	return cmd.Process.Release()
}

func launchInstalledApp(exePath string) error {
	// Break away from the installer's console/job first. This prevents closing
	// Windows Terminal/CMD from terminating the already installed application.
	if err := startDetached(exePath, detachedProcess|createNewProcessGroup|createBreakaway); err == nil {
		return nil
	}

	// Some hosts forbid CREATE_BREAKAWAY_FROM_JOB. DETACHED_PROCESS still keeps
	// the GUI application independent from the installer's console in normal use.
	return startDetached(exePath, detachedProcess|createNewProcessGroup)
}
