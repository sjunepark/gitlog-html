# Package the agent skill and delivery workflow

## Outcome

An installed agent skill can inspect a repository, optionally write grounded
commit explanations, invoke the completed CLI, verify the standalone report,
and return it to a human without duplicating product logic or leaking temporary
data.

## Current state

The skill-creator workflow produced a concise repository-owned skill with
generated agent metadata, focused CLI and explanation references, and a narrow
launcher that delegates all product behavior to the CLI. Local installation
uses a non-overwriting symlink to the reviewed source. An end-to-end Go test
proves installed-path invocation, exact all/current selection, linear and merge
history, optional explanations, hostile text, collision preservation, and
missing-prerequisite diagnostics. Fresh no-explanation and explained agent runs
both generated the requested artifacts without changing the repository; their
reports rendered offline through the existing Playwright file-URL harness.
Independent review found no remaining pre-feedback implementation defect after
the shared Go inspection path, unborn-history handling, guarded installation,
and terminal cleanup fixes. Selection and evidence now reuse the production Go
loader, so the skill contains no Git invocation or duplicated history
semantics. The pre-feedback implementation passed the complete matrix from
detached clean commit `ef71029`. The Go-owned inspection, replacement-ref,
evidence-hardening, and checkout-fallback feedback delta then passed independent
review and the complete Go, race, vet, lint, local/Linux/Windows build, skill,
workflow, frontend, deterministic-asset, and Chromium/WebKit matrix from
detached clean commit `af86b3f`. A fresh installed-symlink run used `inspect`
for exact selection and real patch evidence, generated an explained report,
and rendered it offline in Chromium and WebKit without console or network
errors. PR delivery remains in progress.

## Next action

Deliver the reviewed and clean-validated installed-workflow slice through its
PR lifecycle.

## Scope

- Use the current $skill-creator guidance rather than inventing a skill layout.
- Create skill/gitlog-html with a concise SKILL.md and focused references.
- Teach selection semantics that exactly match --scope and --max-count.
- Teach evidence collection through commit metadata, stats, and diffs when
  explanations are requested.
- Teach plain-text explanation writing, evidence/interpretation separation,
  merge explanation, and full-object-ID JSON keys.
- Make explanations optional and state the subject fallback.
- Use a task-owned temporary directory for explanation JSON. Remove only that
  directory immediately before the final response, after capturing any failure
  diagnostic needed for recovery, and disclose its exact path if cleanup
  fails.
- Invoke an installed or repository-local CLI through a narrow, diagnostic
  launcher only if the skill-creator guidance supports it.
- Preserve the CLI's output collision and force behavior.
- Verify the output file exists, is standalone, and can open before returning
  it.
- Document local development installation without assuming a public release.
- Add end-to-end skill scenarios with and without explanations.

## Agent behavior

The skill must:

- ground explanations in inspected evidence and avoid unsupported business
  claims;
- identify merges as integration events;
- avoid embedding diffs in the report;
- tell the user when explanations were omitted or could not be supported;
- return the HTML artifact rather than build directories or JSON;
- never publish or send the report to a third party without separate
  authorization;
- warn that the portable report may contain private Git metadata.

## Completion conditions

- The skill triggers on requests for a visual or explained Git-history report.
- Default selection matches the CLI and confirmed product.
- It generates a valid report when explanation input is absent.
- It generates and attaches grounded explanations when requested.
- Temporary explanation data is kept out of the worktree by default.
- Missing Git or CLI prerequisites produce useful recovery guidance.
- The skill remains a thin orchestration layer and contains no graph, parser,
  renderer, or copied Go implementation.
- A fresh agent run can follow the skill without relying on this conversation.
- Selection and evidence reuse the cross-platform Go CLI and do not duplicate
  Git invocation or history semantics in the skill.

## Validation

- Validate the skill structure with the current skill tooling.
- Run it against linear, merge, no-explanation, and hostile-text fixtures.
- Compare selected object IDs with the CLI configuration.
- Open the returned report through a file URL.
- Inspect the skill for duplicated or stale CLI details.
- Run final code review over the skill, distribution docs, and integration.

## Out of scope

- Public marketplace publication.
- Bundling platform-specific binaries inside the skill.
- LLM calls inside the Go CLI.
- Uploading or sharing reports automatically.
