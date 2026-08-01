# Package the agent skill and delivery workflow

## Outcome

An installed agent skill can inspect a repository, optionally write grounded
commit explanations, invoke the completed CLI, verify the standalone report,
and return it to a human without duplicating product logic or leaking temporary
data.

## Current state

The intended workflow and boundary are defined in
docs/distribution-and-skill.md. No skill directory, installation procedure,
launcher, or end-to-end skill test exists. This plan assumes the CLI has passed
hardening.

## Next action

Invoke the $skill-creator workflow and design the minimal trigger description,
instructions, references, and optional launcher around the installed
gitlog-html executable.

## Scope

- Use the current $skill-creator guidance rather than inventing a skill layout.
- Create skill/gitlog-html with a concise SKILL.md and focused references.
- Teach selection semantics that exactly match --scope and --max-count.
- Teach evidence collection through commit metadata, stats, and diffs when
  explanations are requested.
- Teach plain-text explanation writing, evidence/interpretation separation,
  merge explanation, and full-object-ID JSON keys.
- Make explanations optional and state the subject fallback.
- Use a task-owned temporary directory for explanation JSON and remove only
  that directory after successful delivery.
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
