A common structure looks like:

skills/
├── browser-testing/
│   ├── SKILL.md
│   ├── scripts/
│   │   └── test.js
│   ├── templates/
│   │   └── report.md
│   └── examples/
│       └── example.md
│
├── code-review/
│   └── SKILL.md
│
└── deploy/
    ├── SKILL.md
    └── scripts/
        └── deploy.sh

The SKILL.md itself commonly has this shape:

---
name: browser-testing
description: Test web applications using browser automation.
---

# Browser Testing

## Purpose

Use this skill to inspect and test web applications.

## When to Use

Use this skill when the user asks to:

- test a website
- reproduce a UI bug
- verify a workflow
- inspect browser behavior

## Instructions

1. Determine the URL to test.
2. Open the application.
3. Reproduce the requested workflow.
4. Record failures.
5. Capture relevant evidence.
6. Return a concise test report.

## Tools

Use:

- Playwright
- browser screenshots
- network inspection

## Rules

- Do not modify production data unless explicitly requested.
- Do not claim a test passed unless it was actually executed.
- Prefer stable selectors over coordinates.
- Record the exact failing step.

## Output

Return:

1. Test performed
2. Result
3. Errors
4. Evidence
5. Recommended next action

## Examples

### Login test

Input:
"Check whether login works."

Process:

1. Navigate to login.
2. Enter test credentials.
3. Submit.
4. Verify authenticated state.

Output:

PASS — Login completed successfully.

The most important architectural distinction is between discovery information and execution instructions.

SKILL.md
│
├── Metadata
│   ├── name
│   └── description     ← helps the harness discover the skill
│
├── Trigger conditions  ← when the agent should load/use it
│
├── Instructions        ← actual procedure
│
├── Rules               ← constraints / safety / invariants
│
├── Tools               ← capabilities it may use
│
├── Output contract     ← expected result
│
└── References
    ├── scripts/
    ├── templates/
    └── examples/

For the kind of agent harness you've been building, I'd keep SKILL.md relatively short. The description should be very good because the harness can use it for skill selection, while detailed implementation material can live in supporting files. That prevents loading thousands of unnecessary tokens into every agent context.

A particularly clean convention is:

my-skill/
├── SKILL.md          # routing + instructions
├── references/       # detailed knowledge
├── scripts/          # executable helpers
├── templates/        # reusable outputs
└── examples/         # few-shot examples

So conceptually, I'd treat a skill as:

metadata → trigger → procedure → constraints → resources → output contract

rather than treating SKILL.md as another giant system prompt.