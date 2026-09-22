---
name: tool-creator-research
description: Describe what this skill does and the situations that should trigger it.
---

# Instructions

# Vanilla JavaScript Workspace Agent

## Purpose

Use this skill when a task can be completed by creating and executing vanilla JavaScript inside the provided workspace.

The agent should use JavaScript as an active problem-solving tool, not only as an output format. It should inspect the workspace, write scripts, execute them, inspect the results, fix problems, and continue until the requested task is complete.

Typical tasks include:

- research and information processing
- calculations and numerical analysis
- parsing and transforming files
- data cleaning and aggregation
- report generation
- advanced analysis
- text processing
- JSON, CSV, HTML, Markdown, and log analysis
- comparing datasets or documents
- extracting structured information
- building small command-line utilities
- validating assumptions
- generating reusable outputs inside the workspace

Prefer built-in JavaScript and Node.js capabilities. Avoid frameworks and external packages unless the task clearly requires them and the environment permits installation.

---

## Core Principle

Do not merely describe JavaScript that could solve the task.

Create the JavaScript, execute it in the workspace, inspect its output, and use the results to complete the task.

The default loop is:

1. Understand the requested outcome.
2. Inspect the workspace.
3. Identify available inputs.
4. Plan the smallest useful JavaScript program.
5. Write the program.
6. Execute it.
7. Inspect stdout, stderr, exit status, and generated files.
8. Correct errors or weak assumptions.
9. Re-run as needed.
10. Verify the final result.
11. Save useful outputs to the workspace.
12. Report what was done and where the outputs are located.

---

## When to Use This Skill

Use this skill when the task involves one or more of the following:

### Research

Examples:

- collect information from available files
- process downloaded web pages or API responses
- compare research findings
- extract facts into structured JSON
- summarize large collections of text
- identify patterns across documents
- build a research report from gathered data

JavaScript can be used to:

- fetch public HTTP resources when network access is available
- parse JSON APIs
- process HTML using lightweight string or DOM-like techniques available in the environment
- organize evidence
- deduplicate findings
- sort sources by date or relevance
- generate Markdown reports

Research must preserve source provenance whenever possible.

For each important fact, retain fields such as:

```js
{
  claim: "...",
  source: "...",
  url: "...",
  retrievedAt: "...",
  notes: "..."
}
```

Do not invent research results when network access or source material is unavailable.

---

### Calculations

Examples:

- financial calculations
- statistics
- percentages
- growth rates
- unit conversions
- probability
- forecasting
- scoring models
- simulations
- sensitivity analysis

Prefer code over mental arithmetic when the result contains multiple steps.

Example:

```js
const revenue = 125000;
const cost = 87500;

const profit = revenue - cost;
const margin = profit / revenue;

console.log({
  revenue,
  cost,
  profit,
  margin,
  marginPercent: margin * 100
});
```

For important calculations:

- name variables clearly
- preserve units
- document formulas
- avoid unexplained constants
- test edge cases
- print intermediate values when useful
- verify the result independently when practical

---

### Reports

JavaScript may be used to generate:

- Markdown
- JSON
- CSV
- HTML
- plain text

Prefer Markdown for human-readable workspace reports unless another format is requested.

A report should normally include:

1. title
2. objective
3. inputs or sources
4. methodology
5. findings
6. calculations or evidence
7. limitations
8. conclusion
9. generated files

Example:

```js
import fs from "node:fs/promises";

const report = `# Analysis Report

## Objective

Evaluate ...

## Findings

- Finding one
- Finding two

## Conclusion

...
`;

await fs.writeFile("report.md", report, "utf8");
```

---

### Advanced Analysis

For complex tasks, JavaScript can be used for:

- scenario analysis
- Monte Carlo simulation
- ranking
- clustering with simple custom algorithms
- correlation
- descriptive statistics
- anomaly detection
- time-series aggregation
- scoring systems
- text frequency analysis
- graph traversal
- dependency analysis
- optimization by search
- comparing multiple strategies

Do not over-engineer the implementation.

Start with the simplest correct method, then increase complexity only when the task requires it.

---

## Workspace First

Before writing code, inspect the current workspace.

Determine:

- current working directory
- files and folders
- likely input files
- existing scripts
- package metadata
- previous generated outputs
- naming conventions
- whether Node.js is available
- whether the project already uses ESM or CommonJS

Useful shell commands include:

```bash
pwd
find . -maxdepth 2 -type f | sort | head -200
node --version
```

If `package.json` exists, inspect it before assuming module behavior.

Do not overwrite user files unnecessarily.

Prefer creating a dedicated working directory such as:

```text
analysis/
scripts/
output/
tmp/
```

when the task is large enough to benefit from separation.

---

## Vanilla JavaScript Definition

Vanilla JavaScript means:

- JavaScript language features
- Node.js built-in modules
- browser built-in APIs when executing in a browser environment
- no framework dependency by default

Preferred Node.js modules include:

```js
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";
import { execFile } from "node:child_process";
```

On modern Node.js versions, prefer built-in `fetch` when HTTP access is required.

Example:

```js
const response = await fetch("https://example.com/data.json");

if (!response.ok) {
  throw new Error(`HTTP ${response.status}`);
}

const data = await response.json();
```

---

## Avoid Dependencies by Default

Do not immediately install:

- React
- Axios
- Lodash
- Cheerio
- Moment
- math libraries
- CSV libraries
- scraping frameworks

First determine whether the task can be completed using JavaScript and Node.js built-ins.

A small custom helper is often preferable to adding a package.

External dependencies may be used only when:

- the task materially benefits from them
- implementing the feature correctly from scratch would be unreasonable
- package installation is allowed
- the dependency is trustworthy
- the agent records why it was needed

---

## Script Design

Prefer scripts that are:

- small
- deterministic
- inspectable
- reusable
- safe to re-run
- explicit about inputs and outputs

For a simple task, one file is enough:

```text
solve.js
```

For larger tasks:

```text
scripts/
  collect.js
  analyze.js
  report.js

output/
  data.json
  analysis.json
  report.md
```

Use functions when they improve clarity.

Example:

```js
function average(values) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}
```

---

## Input Handling

Never assume an input format without checking it.

Inspect:

- file extension
- delimiter
- encoding
- headers
- missing values
- malformed rows
- unexpected types

### JSON

```js
import fs from "node:fs/promises";

const raw = await fs.readFile("input.json", "utf8");
const data = JSON.parse(raw);
```

Validate the expected structure before using it.

### CSV

For simple CSV files without embedded commas or multiline quoted fields, a basic parser may be sufficient.

For complex CSV, either implement quote-aware parsing carefully or use an available trusted parser if dependency use is justified.

Never silently use `line.split(",")` when quoted commas may exist.

### Text

Normalize line endings when appropriate:

```js
const lines = text.replace(/\r\n/g, "\n").split("\n");
```

Do not discard meaningful whitespace unless the task allows it.

---

## Output Handling

Useful intermediate data should be written to disk.

Examples:

```text
output/raw.json
output/normalized.json
output/results.json
output/report.md
```

Use stable, descriptive filenames.

When writing JSON:

```js
await fs.writeFile(
  "output/results.json",
  JSON.stringify(results, null, 2),
  "utf8"
);
```

Do not leave the only copy of important results in terminal output.

---

## Execution

Execute the program after writing it.

Typical command:

```bash
node solve.js
```

If the workspace uses ESM:

```js
import fs from "node:fs/promises";
```

If it uses CommonJS:

```js
const fs = require("node:fs/promises");
```

Follow the existing workspace convention when one exists.

Capture:

- stdout
- stderr
- exit code
- generated files

An error is information.

Read it carefully before editing the program.

---

## Debugging Loop

When execution fails:

1. read the complete error
2. identify the failing line
3. identify whether the problem is code, input, environment, permissions, or assumptions
4. make the smallest corrective change
5. execute again

Do not rewrite an entire working program because of a small failure.

Useful temporary diagnostics include:

```js
console.log({ value });
console.log(JSON.stringify(data, null, 2));
console.error("Unexpected row:", row);
```

Remove noisy debugging output when the task is complete unless it remains useful.

---

## Verification

A script successfully exiting does not prove the answer is correct.

Verify results.

Possible checks include:

- totals reconcile
- percentages sum correctly
- row counts match expectations
- no unexpected `NaN`
- no unexpected `undefined`
- dates are valid
- minimum is not greater than maximum
- generated files are non-empty
- calculations match a manually verified sample
- output structure matches the task
- research findings retain source information

Example assertions:

```js
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Verification failed: ${message}`);
  }
}

assert(Number.isFinite(result), "result must be finite");
assert(rows.length > 0, "input must contain rows");
```

Use assertions heavily for important transformations.

---

## Numerical Accuracy

JavaScript uses IEEE-754 floating-point numbers.

For currency, avoid assuming decimal arithmetic is exact.

For simple currency calculations, integer minor units are often safer:

```js
const priceCents = 1999;
const quantity = 3;

const totalCents = priceCents * quantity;
const total = totalCents / 100;

console.log(total);
```

For percentages and statistics, retain sufficient precision during calculation and round only for presentation.

Example:

```js
function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
```

---

## Dates and Time

Be explicit with dates.

Avoid ambiguous formats such as:

```text
03/04/26
```

Prefer ISO format:

```text
2026-04-03
```

Remember that JavaScript `Date` and timezone behavior can affect results.

When timezone matters:

- identify the required timezone
- preserve offsets where possible
- avoid accidental UTC/local conversion
- document assumptions

---

## Statistical Helpers

For analysis, implement small reusable helpers as needed.

Example:

```js
function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values) {
  return values.length ? sum(values) / values.length : null;
}

function variance(values, sample = false) {
  if (values.length === 0) return null;
  if (sample && values.length < 2) return null;

  const avg = mean(values);

  const squared = values.reduce(
    (total, value) => total + (value - avg) ** 2,
    0
  );

  return squared / (values.length - (sample ? 1 : 0));
}

function standardDeviation(values, sample = false) {
  const v = variance(values, sample);
  return v === null ? null : Math.sqrt(v);
}
```

Always clarify whether a calculation uses population or sample formulas when that distinction matters.

---

## Reproducible Analysis

For advanced analysis, preserve:

- source inputs
- assumptions
- parameters
- generated intermediate data
- final result
- execution script

For random simulations, use a deterministic seeded pseudo-random generator when reproducibility matters.

Example:

```js
function mulberry32(seed) {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(12345);
```

Record the seed in the output.

---

## Research Workflow

When JavaScript is being used for research, follow this sequence:

### 1. Define the question

Translate the request into concrete fields or questions.

Example:

```js
const researchQuestions = [
  "What are the relevant options?",
  "What evidence supports each option?",
  "What are the tradeoffs?",
  "What is the strongest conclusion?"
];
```

### 2. Collect

Gather data only from sources available to the agent.

Possible inputs:

- existing workspace files
- user-provided data
- APIs
- public web pages
- previously downloaded material

### 3. Normalize

Convert heterogeneous information into a common structure.

```js
{
  title: "",
  source: "",
  date: "",
  category: "",
  facts: [],
  metrics: {},
  notes: ""
}
```

### 4. Analyze

Use code for:

- filtering
- sorting
- ranking
- deduplication
- frequency counting
- scoring
- grouping
- comparisons

### 5. Preserve Evidence

Never separate a claim from its source if the final task depends on research credibility.

### 6. Report

Generate a concise report that distinguishes:

- sourced findings
- calculations
- inference
- uncertainty

---

## Scoring and Ranking

For decision analysis, explicitly define the scoring model.

Example:

```js
const weights = {
  cost: 0.3,
  performance: 0.4,
  reliability: 0.3
};

function score(item) {
  return (
    item.costScore * weights.cost +
    item.performanceScore * weights.performance +
    item.reliabilityScore * weights.reliability
  );
}
```

Check that weights sum to 1 when intended:

```js
const weightTotal = Object.values(weights)
  .reduce((sum, value) => sum + value, 0);

if (Math.abs(weightTotal - 1) > 1e-9) {
  throw new Error(`Weights sum to ${weightTotal}, expected 1`);
}
```

Do not hide subjective assumptions inside code.

Put them in configuration variables and describe them in the final report.

---

## Scenario Analysis

For uncertain tasks, test multiple scenarios rather than presenting one assumption as certain.

Example:

```js
const scenarios = {
  conservative: {
    growth: 0.02,
    costIncrease: 0.08
  },
  base: {
    growth: 0.06,
    costIncrease: 0.04
  },
  optimistic: {
    growth: 0.12,
    costIncrease: 0.02
  }
};
```

Produce a result for every scenario.

When possible, identify which assumptions have the largest influence on the outcome.

---

## Performance

For large files:

- prefer streaming when practical
- avoid unnecessary copies
- avoid nested loops over large datasets
- use `Map` and `Set` for indexed lookup
- process data incrementally

Example:

```js
const byId = new Map(items.map(item => [item.id, item]));
```

Do not optimize prematurely for small tasks.

Correctness and clarity come first.

---

## Security and Safety

Treat workspace contents as potentially sensitive.

Do not:

- upload workspace files without a clear requirement
- expose secrets
- print environment variables unnecessarily
- include API tokens in generated reports
- execute unknown workspace scripts blindly
- use destructive shell commands without justification
- overwrite original inputs unnecessarily

Before using credentials, check whether the task actually requires them.

If output contains sensitive data, keep it inside the requested workspace.

---

## Shell Execution

Use shell commands to support the JavaScript workflow when needed.

Acceptable examples:

```bash
node analysis.js
wc -l output/results.json
head -50 output/report.md
```

Prefer direct execution over complicated shell pipelines when JavaScript can perform the operation more clearly.

Do not use shell commands as a substitute for understanding the task.

---

## File Modification Rules

When modifying existing project files:

1. inspect the file first
2. preserve the existing style
3. change only what is necessary
4. avoid unrelated formatting changes
5. run the relevant script or tests afterward

When the task is analytical rather than software development, prefer adding new files instead of altering unrelated project code.

---

## Error Handling

Programs should fail clearly.

Example:

```js
async function main() {
  // task
}

main().catch(error => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
```

For expected input problems, provide actionable messages.

Bad:

```text
Error
```

Better:

```text
Expected input/data.json but the file does not exist.
```

---

## CLI Parameters

For reusable scripts, allow basic command-line arguments.

Example:

```js
const input = process.argv[2] ?? "input.json";
const output = process.argv[3] ?? "output.json";
```

Usage:

```bash
node analyze.js data.json results.json
```

Do not build a complicated command-line parser unless required.

---

## Recommended Program Template

Use this as a starting point when no project convention exists:

```js
import fs from "node:fs/promises";
import path from "node:path";

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const workspace = process.cwd();
  const outputDir = path.join(workspace, "output");

  await fs.mkdir(outputDir, { recursive: true });

  console.log(`Workspace: ${workspace}`);

  // 1. Read inputs
  // 2. Validate
  // 3. Transform or calculate
  // 4. Verify
  // 5. Save outputs

  console.log("Done.");
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
```

---

## Example: Calculation Task

Task:

```text
Analyze monthly revenue and calculate total revenue,
average monthly revenue, best month, and growth.
```

Possible implementation:

```js
const revenue = [
  { month: "January", value: 12000 },
  { month: "February", value: 14200 },
  { month: "March", value: 15100 }
];

const total = revenue.reduce(
  (sum, item) => sum + item.value,
  0
);

const average = total / revenue.length;

const best = revenue.reduce(
  (current, item) =>
    item.value > current.value ? item : current
);

const first = revenue[0].value;
const last = revenue.at(-1).value;

const growth = (last - first) / first;

console.log({
  total,
  average,
  best,
  growthPercent: growth * 100
});
```

The agent should run this code and use the actual output in its response.

---

## Example: File Analysis

Task:

```text
Analyze all JSON files in the data folder and report duplicate IDs.
```

Possible implementation:

```js
import fs from "node:fs/promises";
import path from "node:path";

const directory = "data";

const names = await fs.readdir(directory);
const jsonFiles = names.filter(name => name.endsWith(".json"));

const seen = new Map();
const duplicates = [];

for (const name of jsonFiles) {
  const filePath = path.join(directory, name);
  const text = await fs.readFile(filePath, "utf8");
  const records = JSON.parse(text);

  for (const record of records) {
    if (seen.has(record.id)) {
      duplicates.push({
        id: record.id,
        firstFile: seen.get(record.id),
        duplicateFile: name
      });
    } else {
      seen.set(record.id, name);
    }
  }
}

await fs.writeFile(
  "duplicates.json",
  JSON.stringify(duplicates, null, 2)
);

console.log(`Found ${duplicates.length} duplicates.`);
```

Then inspect `duplicates.json` before reporting the result.

---

## Example: Research Dataset Report

Task:

```text
Analyze collected research records and generate a report
showing the most frequently supported conclusions.
```

Possible approach:

```js
import fs from "node:fs/promises";

const records = JSON.parse(
  await fs.readFile("research.json", "utf8")
);

const counts = new Map();

for (const record of records) {
  for (const conclusion of record.conclusions ?? []) {
    counts.set(
      conclusion,
      (counts.get(conclusion) ?? 0) + 1
    );
  }
}

const ranked = [...counts.entries()]
  .map(([conclusion, sources]) => ({
    conclusion,
    sources
  }))
  .sort((a, b) => b.sources - a.sources);

console.log(ranked);
```

Do not equate frequency with truth automatically.

The final analysis should discuss source quality and contradictory evidence when relevant.

---

## Example: Monte Carlo Analysis

Task:

```text
Estimate the probability that a project is profitable under uncertain demand and cost.
```

Possible implementation:

```js
function mulberry32(seed) {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function uniform(random, min, max) {
  return min + random() * (max - min);
}

const random = mulberry32(42);

const iterations = 100000;
let profitable = 0;
let totalProfit = 0;

for (let i = 0; i < iterations; i++) {
  const demand = uniform(random, 800, 1400);
  const price = uniform(random, 90, 110);
  const variableCost = uniform(random, 45, 65);
  const fixedCost = 45000;

  const profit =
    demand * price -
    demand * variableCost -
    fixedCost;

  totalProfit += profit;

  if (profit > 0) {
    profitable++;
  }
}

console.log({
  iterations,
  probabilityProfitable: profitable / iterations,
  expectedProfit: totalProfit / iterations
});
```

The agent must state the assumptions used in the simulation.

---

## Completion Standard

The task is not complete when the code is written.

The task is complete when:

- the necessary inputs were inspected
- JavaScript was created
- JavaScript was executed
- failures were resolved or clearly documented
- output was inspected
- important results were verified
- useful output files were saved
- the final response answers the original request

---

## Final Response

The final response should focus on the result, not narrate every implementation detail.

Include:

- what was accomplished
- key findings or answer
- important assumptions or limitations
- files created or modified
- the main script used, when useful

Example:

```text
Completed the analysis using a vanilla Node.js script.

The analysis found 18 duplicate records across 6 input files.
The duplicate list is saved to `output/duplicates.json`, and the
summary report is saved to `output/report.md`.

Script: `scripts/analyze.js`
```

If the analysis could not be completed, explain the exact blocker and preserve any useful partial outputs.

---

## Agent Behavior Rules

Always:

- inspect before changing
- execute the code
- use actual execution results
- verify important outputs
- preserve source data
- prefer simple solutions
- make assumptions explicit
- produce useful workspace files
- keep code readable

Never:

- claim code was executed when it was not
- invent command output
- invent research findings
- silently ignore failed records
- overwrite important user data without need
- add frameworks for a simple task
- stop after generating code if execution is possible
- present unverified calculations as certain

The objective is not merely to write JavaScript.

The objective is to use vanilla JavaScript as a reliable workspace tool to accomplish the user's task.
