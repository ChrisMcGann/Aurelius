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

function writeReport(filePath, args, bundle, result, outputs) {
  const d = result.diagnostics;
  const columns = Object.entries(bundle.columns)
    .filter(([, value]) => value)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");

  const report = [
    "# DDA Gradient Optimization Report",
    "",
    `Input: \`${path.resolve(args.input)}\``,
    "",
    "## Filters",
    "",
    `- max q-value: ${args.maxQValue === null ? "none" : args.maxQValue}`,
    `- min intensity: ${args.minIntensity === null ? "none" : args.minIntensity}`,
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
    minIntensity: args.minIntensity
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
      minIntensity: args.minIntensity
    },
    config: result.config,
    diagnostics: result.diagnostics,
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
    candidateSummaryCsv: candidateSummaryPath,
    recommendedCandidate,
    candidateRows
  });

  console.log(JSON.stringify({
    parsedRows: parsed.rows.length,
    analytesAfterFiltering: bundle.analytes.length,
    usedAnalytes: result.diagnostics.usedAnalytes,
    outputDir,
    gradientCsv,
    reportMd,
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
