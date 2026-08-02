package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"

	"github.com/sjunepark/gitlog-html/internal/generate"
	"github.com/sjunepark/gitlog-html/internal/gitexec"
	"github.com/sjunepark/gitlog-html/internal/history"
	"github.com/sjunepark/gitlog-html/internal/report"
)

// version is intentionally empty in ordinary local builds. Release tooling can
// set it with -ldflags without making unversioned development builds lie.
var version string

type generator interface {
	Run(context.Context, generate.Request) (generate.Result, error)
}

type repositoryInspector interface {
	Snapshot(context.Context, string, history.Scope, int) (history.Snapshot, error)
	Evidence(context.Context, string, history.ObjectID, bool) (string, error)
}

type options struct {
	repository       string
	scope            history.Scope
	maximum          int
	descriptionsPath string
	outputPath       string
	force            bool
}

type inspectOptions struct {
	repository string
	scope      history.Scope
	maximum    int
	oid        history.ObjectID
	patch      bool
}

func main() {
	os.Exit(run())
}

func run() int {
	ctx, stop := commandContext()
	defer stop()
	loader := gitexec.Loader{Runner: gitexec.Runner{}}
	service := generate.Service{
		Loader:    loader,
		Generator: report.Generator{Name: "gitlog-html", Version: version},
	}
	return executeCommand(ctx, os.Args[1:], os.Stdout, os.Stderr, service, loader)
}

func executeCommand(ctx context.Context, arguments []string, stdout, stderr io.Writer, service generator, inspector repositoryInspector) int {
	if len(arguments) > 0 && arguments[0] == "inspect" {
		return executeInspect(ctx, arguments[1:], stdout, stderr, inspector)
	}
	return execute(ctx, arguments, stdout, stderr, service)
}

func executeInspect(ctx context.Context, arguments []string, stdout, stderr io.Writer, inspector repositoryInspector) int {
	parsed, err := parseInspectOptions(arguments)
	if errors.Is(err, flag.ErrHelp) {
		writeInspectUsage(stdout)
		return 0
	}
	if err != nil {
		fprintf(stderr, "error: %v\n\n", err)
		writeInspectUsage(stderr)
		return 2
	}

	snapshot, err := inspector.Snapshot(ctx, parsed.repository, parsed.scope, parsed.maximum)
	if err != nil {
		fprintf(stderr, "error: %v\n", err)
		return 1
	}
	encoder := json.NewEncoder(stdout)
	encoder.SetEscapeHTML(true)
	if parsed.oid == "" {
		oids := make([]history.ObjectID, len(snapshot.Commits))
		for index, commit := range snapshot.Commits {
			oids[index] = commit.OID
		}
		if err := encoder.Encode(struct {
			OIDs      []history.ObjectID `json:"oids"`
			Truncated bool               `json:"truncated"`
		}{OIDs: oids, Truncated: snapshot.Selection.Truncated}); err != nil {
			fprintf(stderr, "error: write inspection output: %v\n", err)
			return 1
		}
		return 0
	}

	selected := false
	for _, commit := range snapshot.Commits {
		if commit.OID == parsed.oid {
			selected = true
			break
		}
	}
	if !selected {
		fprintf(stderr, "error: object ID %q is outside the selected history\n", parsed.oid)
		return 1
	}
	evidence, err := inspector.Evidence(ctx, snapshot.Repository.Root, parsed.oid, parsed.patch)
	if err != nil {
		fprintf(stderr, "error: inspect commit evidence: %v\n", err)
		return 1
	}
	if err := encoder.Encode(struct {
		OID           history.ObjectID `json:"oid"`
		Evidence      string           `json:"evidence"`
		PatchIncluded bool             `json:"patchIncluded"`
	}{OID: parsed.oid, Evidence: evidence, PatchIncluded: parsed.patch}); err != nil {
		fprintf(stderr, "error: write inspection output: %v\n", err)
		return 1
	}
	return 0
}

func commandContext() (context.Context, context.CancelFunc) {
	return signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
}

func execute(ctx context.Context, arguments []string, stdout, stderr io.Writer, service generator) int {
	parsed, err := parseOptions(arguments)
	if errors.Is(err, flag.ErrHelp) {
		writeUsage(stdout)
		return 0
	}
	if err != nil {
		fprintf(stderr, "error: %v\n\n", err)
		writeUsage(stderr)
		return 2
	}

	result, err := service.Run(ctx, generate.Request{
		Repository:       parsed.repository,
		Scope:            parsed.scope,
		Maximum:          parsed.maximum,
		DescriptionsPath: parsed.descriptionsPath,
		OutputPath:       parsed.outputPath,
		Force:            parsed.force,
	})
	if err != nil {
		fprintf(stderr, "error: %v\n", err)
		return 1
	}
	for _, warning := range result.Warnings {
		fprintf(stderr, "warning: %s\n", warning.Message)
	}
	word := "commits"
	if result.IncludedCount == 1 {
		word = "commit"
	}
	warningWord := "warnings"
	if len(result.Warnings) == 1 {
		warningWord = "warning"
	}
	fprintf(stdout, "Wrote %q with %d %s and %d %s.\n", result.OutputPath, result.IncludedCount, word, len(result.Warnings), warningWord)
	fprintln(stderr, "note: This report is a portable snapshot; review it before sharing.")
	return 0
}

func parseOptions(arguments []string) (options, error) {
	parsed := options{
		repository: ".",
		scope:      history.ScopeAll,
		maximum:    10,
		outputPath: "git-history.html",
	}
	if err := rejectSingleDashFlags(arguments); err != nil {
		return options{}, err
	}

	flags := flag.NewFlagSet("gitlog-html", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	flags.Usage = func() {}
	flags.Var(&stringFlag{name: "repo", destination: &parsed.repository}, "repo", "repository or descendant path to inspect")
	scope := string(parsed.scope)
	flags.Var(&stringFlag{name: "scope", destination: &scope}, "scope", "history scope: all or current")
	flags.Var(&intFlag{name: "max-count", destination: &parsed.maximum}, "max-count", fmt.Sprintf("positive maximum commit count up to %d", history.MaximumCommitCount))
	flags.Var(&stringFlag{name: "descriptions", destination: &parsed.descriptionsPath}, "descriptions", "UTF-8 JSON explanation map")
	flags.Var(&stringFlag{name: "output", destination: &parsed.outputPath}, "output", "standalone HTML output path")
	flags.Var(&boolFlag{name: "force", destination: &parsed.force}, "force", "replace an existing regular output file")
	if err := flags.Parse(arguments); err != nil {
		return options{}, err
	}
	if flags.NArg() != 0 {
		return options{}, fmt.Errorf("unexpected positional arguments: %s", strings.Join(flags.Args(), " "))
	}
	if parsed.repository == "" {
		return options{}, errors.New("--repo must not be empty")
	}
	parsedScope, err := history.ParseScope(scope)
	if err != nil {
		return options{}, fmt.Errorf("--scope: %w", err)
	}
	parsed.scope = parsedScope
	if parsed.maximum <= 0 {
		return options{}, errors.New("--max-count must be a positive integer")
	}
	if parsed.maximum > history.MaximumCommitCount {
		return options{}, fmt.Errorf("--max-count must not exceed %d", history.MaximumCommitCount)
	}
	if parsed.outputPath == "" {
		return options{}, errors.New("--output must not be empty")
	}
	return parsed, nil
}

func parseInspectOptions(arguments []string) (inspectOptions, error) {
	parsed := inspectOptions{repository: ".", scope: history.ScopeAll, maximum: 10}
	if err := rejectSingleDashFlags(arguments); err != nil {
		return inspectOptions{}, err
	}

	flags := flag.NewFlagSet("gitlog-html inspect", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	flags.Usage = func() {}
	flags.Var(&stringFlag{name: "repo", destination: &parsed.repository}, "repo", "repository or descendant path to inspect")
	scope := string(parsed.scope)
	flags.Var(&stringFlag{name: "scope", destination: &scope}, "scope", "history scope: all or current")
	flags.Var(&intFlag{name: "max-count", destination: &parsed.maximum}, "max-count", fmt.Sprintf("positive maximum commit count up to %d", history.MaximumCommitCount))
	oid := ""
	flags.Var(&stringFlag{name: "oid", destination: &oid}, "oid", "exact selected full object ID to inspect")
	flags.Var(&boolFlag{name: "patch", destination: &parsed.patch}, "patch", "include the bounded patch in commit evidence")
	if err := flags.Parse(arguments); err != nil {
		return inspectOptions{}, err
	}
	if flags.NArg() != 0 {
		return inspectOptions{}, fmt.Errorf("unexpected positional arguments: %s", strings.Join(flags.Args(), " "))
	}
	if parsed.repository == "" {
		return inspectOptions{}, errors.New("--repo must not be empty")
	}
	parsedScope, err := history.ParseScope(scope)
	if err != nil {
		return inspectOptions{}, fmt.Errorf("--scope: %w", err)
	}
	parsed.scope = parsedScope
	if parsed.maximum <= 0 {
		return inspectOptions{}, errors.New("--max-count must be a positive integer")
	}
	if parsed.maximum > history.MaximumCommitCount {
		return inspectOptions{}, fmt.Errorf("--max-count must not exceed %d", history.MaximumCommitCount)
	}
	if oid != "" {
		parsedOID, err := history.ParseObjectID(oid)
		if err != nil {
			return inspectOptions{}, fmt.Errorf("--oid: %w", err)
		}
		parsed.oid = parsedOID
	}
	if parsed.patch && parsed.oid == "" {
		return inspectOptions{}, errors.New("--patch requires --oid")
	}
	return parsed, nil
}

func rejectSingleDashFlags(arguments []string) error {
	expectsValue := false
	for _, argument := range arguments {
		if expectsValue {
			expectsValue = false
			continue
		}
		if argument == "--" {
			return nil
		}
		if strings.HasPrefix(argument, "-") && !strings.HasPrefix(argument, "--") && argument != "-h" {
			return fmt.Errorf("flags must use the --name form: %q", argument)
		}
		name, hasValue := strings.CutPrefix(argument, "--")
		if !hasValue || strings.Contains(name, "=") {
			continue
		}
		switch name {
		case "repo", "scope", "max-count", "descriptions", "output", "oid":
			expectsValue = true
		}
	}
	return nil
}

type stringFlag struct {
	name        string
	destination *string
	set         bool
}

func (value *stringFlag) String() string {
	if value.destination == nil {
		return ""
	}
	return *value.destination
}

func (value *stringFlag) Set(input string) error {
	if value.set {
		return fmt.Errorf("--%s may be provided only once", value.name)
	}
	value.set = true
	if input == "" {
		return fmt.Errorf("--%s must not be empty", value.name)
	}
	*value.destination = input
	return nil
}

type intFlag struct {
	name        string
	destination *int
	set         bool
}

func (value *intFlag) String() string {
	if value.destination == nil {
		return ""
	}
	return strconv.Itoa(*value.destination)
}

func (value *intFlag) Set(input string) error {
	if value.set {
		return fmt.Errorf("--%s may be provided only once", value.name)
	}
	value.set = true
	parsed, err := strconv.Atoi(input)
	if err != nil {
		return fmt.Errorf("must be an integer: %w", err)
	}
	*value.destination = parsed
	return nil
}

type boolFlag struct {
	name        string
	destination *bool
	set         bool
}

func (value *boolFlag) String() string {
	if value.destination == nil {
		return "false"
	}
	return strconv.FormatBool(*value.destination)
}

func (value *boolFlag) Set(input string) error {
	if value.set {
		return fmt.Errorf("--%s may be provided only once", value.name)
	}
	value.set = true
	parsed, err := strconv.ParseBool(input)
	if err != nil {
		return err
	}
	*value.destination = parsed
	return nil
}

func (*boolFlag) IsBoolFlag() bool { return true }

func writeUsage(writer io.Writer) {
	fprintln(writer, "Usage: gitlog-html [flags]")
	fprintln(writer, "       gitlog-html inspect [flags]")
	fprintln(writer, "")
	fprintln(writer, "  --repo PATH            repository or descendant path (default: current directory)")
	fprintln(writer, "  --scope all|current    history selection (default: all)")
	fprintf(writer, "  --max-count N          positive total commit limit up to %d (default: 10)\n", history.MaximumCommitCount)
	fprintln(writer, "  --descriptions PATH    optional UTF-8 JSON explanation map")
	fprintln(writer, "  --output PATH          standalone HTML path (default: git-history.html)")
	fprintln(writer, "  --force                replace an existing regular output file")
}

func writeInspectUsage(writer io.Writer) {
	fprintln(writer, "Usage: gitlog-html inspect [flags]")
	fprintln(writer, "")
	fprintln(writer, "  --repo PATH            repository or descendant path (default: current directory)")
	fprintln(writer, "  --scope all|current    history selection (default: all)")
	fprintf(writer, "  --max-count N          positive total commit limit up to %d (default: 10)\n", history.MaximumCommitCount)
	fprintln(writer, "  --oid FULL_OID         inspect one exact commit from the selected history")
	fprintln(writer, "  --patch                include the bounded patch; requires --oid")
}

func fprintln(writer io.Writer, value string) {
	_, _ = fmt.Fprintln(writer, value)
}

func fprintf(writer io.Writer, format string, arguments ...any) {
	_, _ = fmt.Fprintf(writer, format, arguments...)
}
