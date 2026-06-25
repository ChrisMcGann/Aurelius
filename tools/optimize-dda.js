#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Engine = require("../src/gradient-engine.js");

function parseArgs(argv) {
  const args = {
    mode: "dda_tmt",
    outputDir: "output/dda",
    startTime: 0,
    endTime: 90,
    startB: 2,
    endB: 40,
    lagTime: 0,
    stepSize: 1,
    minSlope: 0,
    maxSlope: null,
    fixedMaxSlope: false,
    densityBins: 30,
    maxQValue: 0.01,
    minIntensity: null,
    minScanCount: null,
    minQuality: null,
    fitRt: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    if (key === "fit-rt") {
      args.fitRt = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${token}`);
    }
    i += 1;

    switch (key) {
      case "input":
        args.input = value;
        break;
      case "output-dir":
        args.outputDir = value;
        break;
      case "mode":
        args.mode = value;
        break;
      case "input-kind":
        args.mode = value === "ms1-features" ? "ms1_features" : value;
        break;
      case "start-time":
        args.startTime = numberArg(key, value);
        break;
      case "end-time":
        args.endTime = numberArg(key, value);
        break;
      case "start-b":
        args.startB = numberArg(key, value);
        break;
      case "end-b":
        args.endB = numberArg(key, value);
        break;
      case "lag-time":
        args.lagTime = numberArg(key, value);
        break;
      case "step-size":
        args.stepSize = numberArg(key, value);
        break;
      case "min-slope":
        args.minSlope = numberArg(key, value);
        break;
      case "max-slope":
        args.maxSlope = nullableNumber(value);
        args.fixedMaxSlope = true;
        break;
      case "density-bins":
        args.densityBins = numberArg(key, value);
        break;
      case "max-q":
        args.maxQValue = nullableNumber(value);
        break;
      case "min-intensity":
        args.minIntensity = nullableNumber(value);
        break;
      case "min-scan-count":
        args.minScanCount = nullableNumber(value);
        break;
      case "min-quality":
        args.minQuality = nullableNumber(value);
        break;
      default:
        throw new Error(`Unknown option: ${token}`);
    }
  }

  return args;
}

function nullableNumber(value) {
  if (["none", "null", "na", ""].includes(String(value).trim().toLowerCase())) {
    return null;
  }
  return numberArg("number", value);
}

function numberArg(name, value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected numeric value for ${name}: ${value}`);
  }
  return parsed;
}

function usage() {
  return [
    "Usage:",
    "  node tools/optimize-dda.js --input examples/cmcgann_1782347682.csv [options]",
    "",
    "Options:",
    "  --output-dir DIR        Output directory, default output/dda",
    "  --input-kind KIND       dda_tmt or ms1-features, default dda_tmt",
    "  --start-time MIN        LC gradient start time, default 0",
    "  --end-time MIN          LC gradient end time, default 90",
    "  --start-b PCT           Start %B, default 2",
    "  --end-b PCT             End %B, default 40",
    "  --lag-time MIN          raw_time = method_time + lag_time, default 0",
    "  --step-size MIN         Output waypoint spacing, default 1",
    "  --min-slope PCT/MIN     Minimum slope, default 0",
    "  --max-slope PCT/MIN     Optional fixed maximum slope; omit to run candidate suite",
    "  --density-bins N        Density diagnostic bins, default 30",
    "  --max-q VALUE|none      q-value/FDR/PEP filter, default 0.01",
    "  --min-intensity VALUE   Optional minimum intensity filter",
    "  --min-scan-count VALUE  Optional MS1 feature persistence filter",
    "  --min-quality VALUE     Optional MS1 feature quality filter",
    "  --fit-rt                Fit start/end times to filtered analyte RT range"
  ].join("\n");
}

function fitRtConfig(config, analytes) {
  if (analytes.length < 3) {
    return config;
  }
  const rts = analytes.map((item) => item.rt).filter(Number.isFinite);
  if (rts.length < 3) {
    return config;
  }
  return {
    ...config,
    startTime: Math.max(0, Math.floor(Math.min(...rts))),
    endTime: Math.ceil(Math.max(...rts))
  };
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function format(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : "NA";
}

function inputKindLabel(mode) {
  if (mode === "ms1_features") {
    return "MS1 Feature";
  }
  if (mode === "dia") {
    return "DIA";
  }
  if (mode === "godig") {
    return "GoDig";
  }
  return "DDA/TMT";
}

function pressureCsv(result) {
  const bins = Engine.summarizeSchedulePressure(result, 12);
  return [
    "raw_start_min,raw_end_min,weighted_pressure",
    ...bins.map((row) => [format(row.start, 4), format(row.end, 4), format(row.value, 4)].join(","))
  ].join("\n") + "\n";
}

function candidateSummaryRows(candidates) {
  return candidates.map((candidate) => {
    const d = candidate.result.diagnostics;
    return {
      name: candidate.name,
      label: candidate.label,
      maxSlopeLimit: candidate.maxSlope,
      score: candidate.scoring.score,
      targetMaxSlope: candidate.scoring.targetMaxSlope,
      densityCvBefore: d.originalCv,
      densityCvAfter: d.optimizedCv,
      improvementPct: d.improvementPct,
      actualMaxSlope: d.maxSlope,
      maxSlopeChange: d.maxSlopeChange,
      meanSlopeChange: d.meanSlopeChange,
      feasible: candidate.scoring.feasible
    };
  });
}

function candidateSummaryCsv(rows) {
  return [
    "name,label,max_slope_limit,score,target_max_slope,density_cv_before,density_cv_after,improvement_pct,actual_max_slope,max_slope_change,mean_slope_change,feasible",
    ...rows.map((row) => [
      row.name,
      row.label,
      row.maxSlopeLimit === null ? "none" : format(row.maxSlopeLimit, 4),
      format(row.score, 4),
      format(row.targetMaxSlope, 4),
      format(row.densityCvBefore, 6),
      format(row.densityCvAfter, 6),
      format(row.improvementPct, 4),
      format(row.actualMaxSlope, 6),
      format(row.maxSlopeChange, 6),
      format(row.meanSlopeChange, 6),
      row.feasible ? "true" : "false"
    ].join(","))
  ].join("\n") + "\n";
}

function safeName(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function htmlEscape(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colorForCandidate(name) {
  const colors = {
    unconstrained: "#8b9692",
    permissive: "#b07917",
    balanced: "#087f83",
    gentle: "#85436b",
    fixed: "#087f83"
  };
  return colors[name] || "#2e3532";
}

function svgGradientOverlay(candidates, recommendedName) {
  const width = 920;
  const height = 330;
  const pad = { left: 58, right: 24, top: 26, bottom: 42 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const cfg = candidates[0].result.config;
  const x = (time) => pad.left + ((time - cfg.startTime) / (cfg.endTime - cfg.startTime)) * plotW;
  const y = (b) => pad.top + (1 - ((b - cfg.startB) / (cfg.endB - cfg.startB))) * plotH;
  const grid = [0.25, 0.5, 0.75].map((fraction) => {
    const gy = pad.top + fraction * plotH;
    return `<line x1="${pad.left}" y1="${gy}" x2="${pad.left + plotW}" y2="${gy}" stroke="#e8ecea"/>`;
  }).join("");
  const linear = `<line x1="${x(cfg.startTime)}" y1="${y(cfg.startB)}" x2="${x(cfg.endTime)}" y2="${y(cfg.endB)}" stroke="#9aa5a1" stroke-width="2" stroke-dasharray="7 6"/>`;
  const lines = candidates.map((candidate) => {
    const points = candidate.result.points.map((point) => `${x(point.methodTime).toFixed(2)},${y(point.percentB).toFixed(2)}`).join(" ");
    const isRecommended = candidate.name === recommendedName;
    return `<polyline points="${points}" fill="none" stroke="${colorForCandidate(candidate.name)}" stroke-width="${isRecommended ? 4 : 2.2}" opacity="${isRecommended ? 1 : 0.72}"/>`;
  }).join("");
  const legend = candidates.map((candidate, index) => {
    const lx = pad.left + index * 150;
    const ly = 18;
    const label = `${candidate.label}${candidate.name === recommendedName ? " (rec)" : ""}`;
    return `<g><line x1="${lx}" y1="${ly}" x2="${lx + 24}" y2="${ly}" stroke="${colorForCandidate(candidate.name)}" stroke-width="4"/><text x="${lx + 30}" y="${ly + 4}" font-size="12" fill="#17201d">${htmlEscape(label)}</text></g>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Candidate gradient comparison">
    <rect width="${width}" height="${height}" fill="#fbfcfb"/>
    ${legend}
    <rect x="${pad.left}" y="${pad.top}" width="${plotW}" height="${plotH}" fill="#fff" stroke="#d7dedb"/>
    ${grid}
    ${linear}
    ${lines}
    <text x="${pad.left}" y="${height - 14}" font-size="12" fill="#65706d">${format(cfg.startTime, 0)} min</text>
    <text x="${pad.left + plotW}" y="${height - 14}" text-anchor="end" font-size="12" fill="#65706d">${format(cfg.endTime, 0)} min</text>
    <text x="18" y="${pad.top + plotH / 2}" transform="rotate(-90 18 ${pad.top + plotH / 2})" text-anchor="middle" font-size="12" fill="#65706d">%B</text>
  </svg>`;
}

function svgDensityPanel(candidate) {
  const width = 440;
  const height = 190;
  const pad = { left: 42, right: 16, top: 24, bottom: 28 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const original = candidate.result.originalHistogram;
  const optimized = candidate.result.optimizedHistogram;
  const maxValue = Math.max(1, ...original.map((bin) => bin.value), ...optimized.map((bin) => bin.value));
  const barW = plotW / original.length;
  const bars = original.map((bin, index) => {
    const originalH = (bin.value / maxValue) * plotH;
    const optH = (optimized[index].value / maxValue) * plotH;
    const bx = pad.left + index * barW;
    return [
      `<rect x="${(bx + 1).toFixed(2)}" y="${(pad.top + plotH - originalH).toFixed(2)}" width="${Math.max(1, barW - 2).toFixed(2)}" height="${originalH.toFixed(2)}" fill="#c8d0cd"/>`,
      `<rect x="${(bx + barW * 0.24).toFixed(2)}" y="${(pad.top + plotH - optH).toFixed(2)}" width="${Math.max(1, barW * 0.52).toFixed(2)}" height="${optH.toFixed(2)}" fill="${colorForCandidate(candidate.name)}" opacity="0.78"/>`
    ].join("");
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${htmlEscape(candidate.label)} density comparison">
    <rect width="${width}" height="${height}" fill="#fbfcfb"/>
    <text x="${pad.left}" y="16" font-size="13" font-weight="700" fill="#17201d">${htmlEscape(candidate.label)}</text>
    <text x="${width - pad.right}" y="16" text-anchor="end" font-size="12" fill="#65706d">CV ${format(candidate.result.diagnostics.optimizedCv, 3)}</text>
    <rect x="${pad.left}" y="${pad.top}" width="${plotW}" height="${plotH}" fill="#fff" stroke="#d7dedb"/>
    ${bars}
    <text x="${pad.left}" y="${height - 8}" font-size="11" fill="#65706d">linear</text>
    <text x="${pad.left + 46}" y="${height - 8}" font-size="11" fill="${colorForCandidate(candidate.name)}">optimized</text>
  </svg>`;
}

function htmlCandidateTable(rows, recommendedName) {
  const body = rows.map((row) => `<tr class="${row.name === recommendedName ? "recommended" : ""}">
    <td>${htmlEscape(row.label)}${row.name === recommendedName ? " <strong>recommended</strong>" : ""}</td>
    <td>${row.maxSlopeLimit === null ? "none" : format(row.maxSlopeLimit, 3)}</td>
    <td>${format(row.score, 2)}</td>
    <td>${format(row.densityCvAfter, 4)}</td>
    <td>${format(row.improvementPct, 1)}%</td>
    <td>${format(row.actualMaxSlope, 3)}</td>
    <td>${row.feasible ? "yes" : "no"}</td>
  </tr>`).join("");
  return `<table>
    <thead><tr><th>Candidate</th><th>Max slope limit</th><th>Score</th><th>CV after</th><th>Improvement</th><th>Actual max slope</th><th>Feasible</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function writeHtmlReport(filePath, args, bundle, result, outputs) {
  const d = result.diagnostics;
  const candidates = outputs.candidates && outputs.candidates.length
    ? outputs.candidates
    : [{
      name: "fixed",
      label: "Fixed",
      maxSlope: result.config.maxSlope,
      result,
      scoring: Engine.scoreGradientResult(result)
    }];
  const candidateRows = outputs.candidateRows && outputs.candidateRows.length
    ? outputs.candidateRows
    : candidateSummaryRows(candidates);
  const recommendedName = outputs.recommendedCandidate ? outputs.recommendedCandidate.name : candidates[0].name;
  const columns = Object.entries(bundle.columns)
    .filter(([, value]) => value)
    .map(([key, value]) => `<li><code>${htmlEscape(key)}</code>: ${htmlEscape(value)}</li>`)
    .join("");
  const warnings = [...bundle.warnings, ...result.warnings];
  const reportLabel = inputKindLabel(args.mode);

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Aurelius ${htmlEscape(reportLabel)} Report</title>
  <style>
    :root { --ink:#17201d; --muted:#65706d; --line:#d7dedb; --panel:#fff; --bg:#f5faf8; --teal:#087f83; }
    body { margin:0; color:var(--ink); background:var(--bg); font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { max-width:1160px; margin:0 auto; padding:28px; }
    h1 { margin:0 0 6px; font-size:28px; }
    h2 { margin:28px 0 12px; font-size:17px; }
    p, li { color:var(--muted); }
    code { color:var(--ink); }
    .grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:18px 0; }
    .metric, .panel { background:var(--panel); border:1px solid var(--line); border-radius:8px; box-shadow:0 14px 36px rgba(23,32,29,.07); }
    .metric { padding:14px; min-height:78px; }
    .metric strong { display:block; font-size:22px; margin-bottom:6px; }
    .metric span { color:var(--muted); font-size:12px; }
    .panel { padding:16px; margin:14px 0; overflow:auto; }
    .density-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
    table { width:100%; border-collapse:collapse; font-size:13px; background:#fff; }
    th, td { padding:9px 10px; border-bottom:1px solid #e8ecea; text-align:left; white-space:nowrap; }
    th { color:var(--muted); background:#f8faf8; }
    tr.recommended td { background:#e8f6f3; }
    a { color:var(--teal); }
    .warn { background:#fff8e4; border:1px solid #ead8a8; border-radius:8px; padding:12px; color:#573f0c; }
    @media (max-width:800px) { main { padding:16px; } .grid, .density-grid { grid-template-columns:1fr; } }
  </style>
</head>
<body>
<main>
  <h1>Aurelius ${htmlEscape(reportLabel)} Gradient Report</h1>
  <p>Input: <code>${htmlEscape(path.resolve(args.input))}</code></p>
  <div class="grid">
    <div class="metric"><strong>${d.usedAnalytes.toLocaleString()}</strong><span>analytes used</span></div>
    <div class="metric"><strong>${format(d.originalCv, 3)} -> ${format(d.optimizedCv, 3)}</strong><span>density CV</span></div>
    <div class="metric"><strong>${format(d.improvementPct, 1)}%</strong><span>flattening improvement</span></div>
    <div class="metric"><strong>${format(d.maxSlope, 3)}</strong><span>max %B/min</span></div>
  </div>
  <h2>Gradient Candidates</h2>
  <div class="panel">${svgGradientOverlay(candidates, recommendedName)}</div>
  <div class="panel">${htmlCandidateTable(candidateRows, recommendedName)}</div>
  <h2>Density Panels</h2>
  <div class="density-grid">${candidates.map((candidate) => `<div class="panel">${svgDensityPanel(candidate)}</div>`).join("")}</div>
  <h2>Configuration</h2>
  <div class="panel">
    <ul>
      <li>gradient: ${format(result.config.startTime)} to ${format(result.config.endTime)} min, ${format(result.config.startB)} to ${format(result.config.endB)} %B</li>
      <li>lag: ${format(result.config.lagTime)} min</li>
      <li>max q-value: ${args.maxQValue === null ? "none" : htmlEscape(args.maxQValue)}</li>
      <li>min intensity: ${args.minIntensity === null ? "none" : htmlEscape(args.minIntensity)}</li>
      <li>min scan count: ${args.minScanCount === null ? "none" : htmlEscape(args.minScanCount)}</li>
      <li>min quality: ${args.minQuality === null ? "none" : htmlEscape(args.minQuality)}</li>
      <li>input kind: ${htmlEscape(args.mode)}</li>
    </ul>
  </div>
  <h2>Mapped Columns</h2>
  <div class="panel"><ul>${columns || "<li>No columns detected.</li>"}</ul></div>
  <h2>Outputs</h2>
  <div class="panel">
    <ul>
      <li><code>${htmlEscape(outputs.gradientCsv)}</code></li>
      <li><code>${htmlEscape(outputs.pressureCsv)}</code></li>
      <li><code>${htmlEscape(outputs.summaryJson)}</code></li>
      ${outputs.reportHtml ? `<li><code>${htmlEscape(outputs.reportHtml)}</code></li>` : ""}
      ${outputs.candidateSummaryCsv ? `<li><code>${htmlEscape(outputs.candidateSummaryCsv)}</code></li>` : ""}
    </ul>
  </div>
  <h2>Warnings</h2>
  <div class="warn">${warnings.length ? warnings.map((warning) => `<div>${htmlEscape(warning)}</div>`).join("") : "No warnings."}</div>
</main>
</body>
</html>`;

  fs.writeFileSync(filePath, html, "utf8");
}

function writeReport(filePath, args, bundle, result, outputs) {
  const d = result.diagnostics;
  const columns = Object.entries(bundle.columns)
    .filter(([, value]) => value)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");

  const report = [
    `# ${inputKindLabel(args.mode)} Gradient Optimization Report`,
    "",
    `Input: \`${path.resolve(args.input)}\``,
    "",
    "## Filters",
    "",
    `- input kind: ${args.mode}`,
    `- max q-value: ${args.maxQValue === null ? "none" : args.maxQValue}`,
    `- min intensity: ${args.minIntensity === null ? "none" : args.minIntensity}`,
    `- min scan count: ${args.minScanCount === null ? "none" : args.minScanCount}`,
    `- min quality: ${args.minQuality === null ? "none" : args.minQuality}`,
    "",
    "## Source Gradient",
    "",
    `- start: ${format(result.config.startTime)} min at ${format(result.config.startB)} %B`,
    `- end: ${format(result.config.endTime)} min at ${format(result.config.endB)} %B`,
    `- lag: ${format(result.config.lagTime)} min`,
    `- waypoint step: ${format(result.config.stepSize)} min`,
    `- max slope: ${result.config.maxSlope === null ? "none" : `${format(result.config.maxSlope)} %B/min`}`,
    "",
    "## Diagnostics",
    "",
    `- input analytes after parser/filtering: ${d.inputAnalytes.toLocaleString()}`,
    `- analytes inside gradient interval: ${d.usedAnalytes.toLocaleString()}`,
    `- total optimizer weight: ${format(d.totalWeight, 2)}`,
    `- weighted analytes per minute: ${format(d.weightedAnalytesPerMinute, 2)}`,
    `- density CV: ${format(d.originalCv, 4)} -> ${format(d.optimizedCv, 4)}`,
    `- flattening improvement: ${format(d.improvementPct, 1)}%`,
    `- slope range: ${format(d.minSlope, 3)} to ${format(d.maxSlope, 3)} %B/min`,
    "",
    "## Mapped Columns",
    "",
    columns || "No columns detected.",
    "",
    "## Outputs",
    "",
    `- gradient CSV: \`${outputs.gradientCsv}\``,
    `- pressure CSV: \`${outputs.pressureCsv}\``,
    `- summary JSON: \`${outputs.summaryJson}\``,
    outputs.reportHtml ? `- HTML report: \`${outputs.reportHtml}\`` : "",
    outputs.candidateSummaryCsv ? `- candidate summary CSV: \`${outputs.candidateSummaryCsv}\`` : "",
    "",
    outputs.recommendedCandidate ? `Recommended candidate: **${outputs.recommendedCandidate.label}**` : "",
    "",
    outputs.candidateRows && outputs.candidateRows.length ? [
      "## Candidate Comparison",
      "",
      "| Candidate | Max slope limit | Score | CV after | Improvement | Actual max slope |",
      "| --- | ---: | ---: | ---: | ---: | ---: |",
      ...outputs.candidateRows.map((row) => [
        `| ${row.label}`,
        row.maxSlopeLimit === null ? "none" : format(row.maxSlopeLimit, 3),
        format(row.score, 2),
        format(row.densityCvAfter, 4),
        `${format(row.improvementPct, 1)}%`,
        `${format(row.actualMaxSlope, 3)} |`
      ].join(" | "))
    ].join("\n") : "",
    "",
    "## Warnings",
    "",
    [...bundle.warnings, ...result.warnings].length
      ? [...bundle.warnings, ...result.warnings].map((item) => `- ${item}`).join("\n")
      : "No warnings."
  ].join("\n");

  fs.writeFileSync(filePath, `${report}\n`, "utf8");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.input) {
    throw new Error(`Missing --input\n\n${usage()}`);
  }

  const inputPath = path.resolve(args.input);
  const outputDir = path.resolve(args.outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  const text = fs.readFileSync(inputPath, "utf8");
  const parsed = Engine.parseDelimited(text);
  const bundle = Engine.buildAnalytes(parsed, args.mode, {
    maxQValue: args.maxQValue,
    minIntensity: args.minIntensity,
    minScanCount: args.minScanCount,
    minQuality: args.minQuality
  });
  const config = {
    startTime: args.startTime,
    endTime: args.endTime,
    startB: args.startB,
    endB: args.endB,
    lagTime: args.lagTime,
    stepSize: args.stepSize,
    minSlope: args.minSlope,
    maxSlope: args.maxSlope,
    densityBins: args.densityBins
  };
  const fittedConfig = args.fitRt ? fitRtConfig(config, bundle.analytes) : config;
  const suite = args.fixedMaxSlope
    ? null
    : Engine.computeGradientCandidates(bundle.analytes, fittedConfig);
  const recommendedCandidate = suite ? suite.recommended : null;
  const result = suite
    ? recommendedCandidate.result
    : Engine.computeGradient(bundle.analytes, fittedConfig);

  const gradientCsv = path.join(outputDir, "dda_optimized_gradient.csv");
  const pressureCsvPath = path.join(outputDir, "dda_pressure_bins.csv");
  const summaryJson = path.join(outputDir, "dda_summary.json");
  const reportMd = path.join(outputDir, "dda_report.md");
  const reportHtml = path.join(outputDir, "dda_report.html");
  const candidateSummaryPath = suite ? path.join(outputDir, "dda_candidate_summary.csv") : null;
  const candidateRows = suite ? candidateSummaryRows(suite.candidates) : [];

  fs.writeFileSync(gradientCsv, Engine.formatGradientCsv(result), "utf8");
  fs.writeFileSync(pressureCsvPath, pressureCsv(result), "utf8");

  if (suite) {
    for (const candidate of suite.candidates) {
      const candidatePath = path.join(outputDir, `dda_candidate_${safeName(candidate.name)}_gradient.csv`);
      fs.writeFileSync(candidatePath, Engine.formatGradientCsv(candidate.result), "utf8");
    }
    fs.writeFileSync(candidateSummaryPath, candidateSummaryCsv(candidateRows), "utf8");
  }

  writeJson(summaryJson, {
    input: inputPath,
    parsedRows: parsed.rows.length,
    columns: bundle.columns,
    filters: {
      maxQValue: args.maxQValue,
      minIntensity: args.minIntensity,
      minScanCount: args.minScanCount,
      minQuality: args.minQuality
    },
    inputKind: args.mode,
    config: result.config,
    diagnostics: result.diagnostics,
    outputs: {
      gradientCsv,
      pressureCsv: pressureCsvPath,
      summaryJson,
      reportMd,
      reportHtml,
      candidateSummaryCsv: candidateSummaryPath
    },
    recommendedCandidate: recommendedCandidate ? {
      name: recommendedCandidate.name,
      label: recommendedCandidate.label,
      score: recommendedCandidate.scoring.score,
      maxSlope: recommendedCandidate.maxSlope
    } : null,
    candidates: candidateRows,
    warnings: [...bundle.warnings, ...result.warnings]
  });
  writeReport(reportMd, args, bundle, result, {
    gradientCsv,
    pressureCsv: pressureCsvPath,
    summaryJson,
    reportHtml,
    candidateSummaryCsv: candidateSummaryPath,
    recommendedCandidate,
    candidateRows
  });
  writeHtmlReport(reportHtml, args, bundle, result, {
    gradientCsv,
    pressureCsv: pressureCsvPath,
    summaryJson,
    reportHtml,
    candidateSummaryCsv: candidateSummaryPath,
    recommendedCandidate,
    candidateRows,
    candidates: suite ? suite.candidates : null
  });

  console.log(JSON.stringify({
    parsedRows: parsed.rows.length,
    analytesAfterFiltering: bundle.analytes.length,
    usedAnalytes: result.diagnostics.usedAnalytes,
    outputDir,
    gradientCsv,
    reportMd,
    reportHtml,
    recommendedCandidate: recommendedCandidate ? recommendedCandidate.name : "fixed",
    densityCv: {
      before: result.diagnostics.originalCv,
      after: result.diagnostics.optimizedCv
    }
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
