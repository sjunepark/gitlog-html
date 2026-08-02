// Package generate coordinates the report compiler without owning Git,
// topology, serialization, or filesystem semantics itself.
package generate

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/sjunepark/gitlog-html/internal/graph"
	"github.com/sjunepark/gitlog-html/internal/history"
	"github.com/sjunepark/gitlog-html/internal/report"
)

type SnapshotLoader interface {
	Snapshot(context.Context, string, history.Scope, int) (history.Snapshot, error)
	AdministrativePaths(context.Context, string) ([]string, error)
}

type Request struct {
	Repository       string
	Scope            history.Scope
	Maximum          int
	DescriptionsPath string
	OutputPath       string
	Force            bool
}

type Result struct {
	OutputPath    string
	IncludedCount int
	Warnings      []history.Warning
}

type Service struct {
	Loader      SnapshotLoader
	Clock       report.Clock
	NonceSource report.NonceSource
	Generator   report.Generator
}

func (service Service) Run(ctx context.Context, request Request) (Result, error) {
	if service.Loader == nil {
		return Result{}, errors.New("generate report: history loader is required")
	}
	if _, err := history.ParseScope(string(request.Scope)); err != nil {
		return Result{}, fmt.Errorf("generate report: %w", err)
	}
	if request.Maximum <= 0 {
		return Result{}, errors.New("generate report: maximum commit count must be positive")
	}
	if request.Maximum > history.MaximumCommitCount {
		return Result{}, fmt.Errorf("generate report: maximum commit count must not exceed %d", history.MaximumCommitCount)
	}
	if request.Repository == "" {
		return Result{}, errors.New("generate report: repository path is empty")
	}
	if request.OutputPath == "" {
		return Result{}, errors.New("generate report: output path is empty")
	}

	snapshot, err := service.Loader.Snapshot(ctx, request.Repository, request.Scope, request.Maximum)
	if err != nil {
		return Result{}, fmt.Errorf("load repository history: %w", err)
	}
	if request.DescriptionsPath != "" {
		descriptions, err := readDescriptions(request.DescriptionsPath)
		if err != nil {
			return Result{}, err
		}
		snapshot = history.AttachDescriptions(snapshot, descriptions)
	}
	administrativePaths, err := service.Loader.AdministrativePaths(ctx, snapshot.Repository.Root)
	if err != nil {
		return Result{}, fmt.Errorf("protect repository storage: %w", err)
	}
	layout, err := graph.Build(snapshot.Commits)
	if err != nil {
		return Result{}, fmt.Errorf("layout commit graph: %w", err)
	}

	clock := service.Clock
	if clock == nil {
		clock = report.SystemClock{}
	}
	generator := service.Generator
	if generator.Name == "" {
		generator.Name = "gitlog-html"
	}
	document, err := report.NewDocument(generator, clock.Now().UTC(), snapshot, layout)
	if err != nil {
		return Result{}, fmt.Errorf("assemble report model: %w", err)
	}
	renderer := report.Renderer{NonceSource: service.NonceSource}
	outputPath, err := report.WriteFile(request.OutputPath, request.Force, administrativePaths, func(writer io.Writer) error {
		return renderer.Render(writer, document)
	})
	if err != nil {
		return Result{}, err
	}
	return Result{
		OutputPath:    outputPath,
		IncludedCount: len(snapshot.Commits),
		Warnings:      append([]history.Warning(nil), snapshot.Warnings...),
	}, nil
}

func readDescriptions(path string) (history.Descriptions, error) {
	resolved, err := filepath.Abs(path)
	if err != nil {
		return nil, fmt.Errorf("resolve descriptions path %q: %w", path, err)
	}
	file, err := os.Open(resolved)
	if err != nil {
		return nil, fmt.Errorf("open descriptions %q: %w", resolved, err)
	}
	defer func() { _ = file.Close() }()
	descriptions, err := history.DecodeDescriptions(file)
	if err != nil {
		return nil, fmt.Errorf("read descriptions %q: %w", resolved, err)
	}
	return descriptions, nil
}
