package main

import (
	"archive/zip"
	"bytes"
	"embed"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

//go:embed payload.zip
var payloadFS embed.FS
var version = "1.1.2"

func extractZip(data []byte, dst string) error {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return err
	}

	root, err := filepath.Abs(dst)
	if err != nil {
		return err
	}

	for _, f := range zr.File {
		clean := filepath.Clean(filepath.FromSlash(f.Name))
		if clean == "." || filepath.IsAbs(clean) || clean == ".." || strings.HasPrefix(clean, ".."+string(os.PathSeparator)) {
			return fmt.Errorf("gecersiz kurulum girdisi: %s", f.Name)
		}

		out := filepath.Join(root, clean)
		absOut, err := filepath.Abs(out)
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(root, absOut)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
			return fmt.Errorf("kurulum girdisi hedef disina cikiyor: %s", f.Name)
		}

		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(absOut, 0o755); err != nil {
				return err
			}
			continue
		}

		if err := os.MkdirAll(filepath.Dir(absOut), 0o755); err != nil {
			return err
		}
		src, err := f.Open()
		if err != nil {
			return err
		}
		dstFile, err := os.OpenFile(absOut, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
		if err != nil {
			src.Close()
			return err
		}
		_, copyErr := io.Copy(dstFile, src)
		closeErr1 := dstFile.Close()
		closeErr2 := src.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr1 != nil {
			return closeErr1
		}
		if closeErr2 != nil {
			return closeErr2
		}
	}

	return nil
}

func waitOnFailure() {
	fmt.Println("\nKurulum baslatilamadi. Ayrintilari yukarida gorebilirsin.")
	fmt.Print("Kapatmak icin Enter'a bas...")
	var s string
	fmt.Scanln(&s)
}

func enableUTF8Console() {
	// Windows console code page is shared by processes attached to the same console.
	// This keeps PowerShell's UTF-8 Turkish output readable on Windows 10/11.
	cmd := exec.Command("cmd.exe", "/d", "/c", "chcp 65001 >nul & title Veloria Notes v"+version+" Kurulum")
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	_ = cmd.Run()
}

func main() {
	enableUTF8Console()

	payload, err := payloadFS.ReadFile("payload.zip")
	if err != nil {
		fmt.Println("Kurulum paketi okunamadi:", err)
		waitOnFailure()
		os.Exit(1)
	}

	tmp, err := os.MkdirTemp("", "VeloriaNotesSetup-")
	if err != nil {
		fmt.Println("Gecici kurulum klasoru olusturulamadi:", err)
		waitOnFailure()
		os.Exit(1)
	}
	defer os.RemoveAll(tmp)

	if err := extractZip(payload, tmp); err != nil {
		fmt.Println("Kurulum dosyalari acilamadi:", err)
		waitOnFailure()
		os.Exit(1)
	}

	script := filepath.Join(tmp, "_kurulum.ps1")
	cmd := exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script)
	cmd.Dir = tmp
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			os.Exit(exitErr.ExitCode())
		}
		fmt.Println("PowerShell kurulumu baslatilamadi:", err)
		waitOnFailure()
		os.Exit(1)
	}

	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData == "" {
		fmt.Println("Kurulum tamamlandi ancak LOCALAPPDATA bulunamadi; Veloria Notes'u masaustu kisayolundan acabilirsin.")
		return
	}

	installedExe := filepath.Join(localAppData, "Veloria Notes", "Veloria Notes.exe")
	if _, err := os.Stat(installedExe); err != nil {
		fmt.Println("Kurulum tamamlandi ancak kurulu EXE bulunamadi:", installedExe)
		waitOnFailure()
		os.Exit(2)
	}

	if err := launchInstalledApp(installedExe); err != nil {
		fmt.Println("Veloria Notes otomatik acilamadi; masaustu kisayolundan acabilirsin:", err)
		return
	}
}
