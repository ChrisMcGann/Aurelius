const assert = require("node:assert/strict");
const Engine = require("../src/gradient-engine.js");

function makeCsv() {
  const lines = ["sequence,rt,mz,intensity,q_value,tmt_snr,priority,unique"];
  for (let i = 0; i < 120; i += 1) {
    const cluster = i % 3;
    const base = cluster === 0 ? 24 : cluster === 1 ? 61 : 92;
    const rt = base + ((i * 5) % 17) * 0.9;
    const mz = 410 + ((i * 37) % 720);
    const intensity = 50000 + ((i * 7919) % 900000);
    const q = i % 19 === 0 ? 0.02 : 0.004;
    const snr = 10 + (i % 20);
    const priority = i % 11 === 0 ? 3 : 1;
    lines.push(`PEP${i + 1},${rt.toFixed(3)},${mz.toFixed(4)},${intensity},${q},${snr},${priority},true`);
  }
  return lines.join("\n");
}

const parsed = Engine.parseDelimited(makeCsv());
assert.equal(parsed.rows.length, 120);

const bundle = Engine.buildAnalytes(parsed, "dda_tmt");
assert.equal(bundle.analytes.length, 120);
assert.equal(bundle.columns.rt, "rt");
assert.equal(bundle.columns.intensity, "intensity");

const result = Engine.computeGradient(bundle.analytes, {
  startTime: 10,
  endTime: 130,
  startB: 2,
  endB: 40,
  lagTime: 0,
  stepSize: 1,
  densityBins: 24
});

assert.equal(result.points[0].methodTime, 10);
assert.equal(result.points.at(-1).methodTime, 130);
assert.equal(result.points[0].percentB, 2);
assert.equal(result.points.at(-1).percentB, 40);

for (let i = 1; i < result.points.length; i += 1) {
  assert.ok(result.points[i].percentB + 1e-9 >= result.points[i - 1].percentB, "gradient is monotonic");
}

assert.ok(result.diagnostics.usedAnalytes > 100);
assert.ok(result.diagnostics.optimizedCv < result.diagnostics.originalCv, "optimized density is flatter");

const csv = Engine.formatGradientCsv(result);
assert.ok(csv.startsWith("method_time_min,raw_time_min,percent_b"));
assert.ok(csv.includes("130.000,130.000,40.000"));

const dia = Engine.suggestMzWindows(result.simulatedAnalytes, { windowCount: 12 });
assert.equal(dia.windows.length, 12);
assert.ok(dia.windows.every((window) => window.upper >= window.lower));

const suite = Engine.computeGradientCandidates(bundle.analytes, {
  startTime: 10,
  endTime: 130,
  startB: 2,
  endB: 40,
  lagTime: 0,
  stepSize: 1,
  densityBins: 24
});
assert.ok(suite.candidates.length >= 3);
assert.ok(suite.recommended);
assert.ok(Number.isFinite(suite.recommended.scoring.score));
assert.ok(suite.candidates.some((candidate) => candidate.name === "balanced"));

const realStyleCsv = [
  'ScanF,Time,"Obs m/z",z,"Trimmed Peptide","Gene Symbol","LDA Q Value","Sum Sn","Precursor Intensity","Isolation Specificity","Peak Width"',
  '100,"  12.30",586.81709,2,DSAGSK,TNFRSF18,0.000,5.8250,5055.1353,0.4465,0.1200',
  '101,"  14.10",600.83223,2,CTPSK,FLT1,0.025,0.0000,6517.4951,0.5907,0.8081',
  '102,"  18.20",612.28000,3,PEPTIDER,MAPK1,0.009,9.1000,15517.4951,0.8800,0.4081'
].join("\n");

const realParsed = Engine.parseDelimited(realStyleCsv);
const realBundle = Engine.buildAnalytes(realParsed, "dda_tmt", { maxQValue: 0.01 });
assert.equal(realBundle.columns.rt, "Time");
assert.equal(realBundle.columns.qValue, "LDA Q Value");
assert.equal(realBundle.columns.intensity, "Precursor Intensity");
assert.equal(realBundle.columns.tmtSnr, "Sum Sn");
assert.equal(realBundle.columns.mz, "Obs m/z");
assert.equal(realBundle.columns.protein, "Gene Symbol");
assert.equal(realBundle.columns.sequence, "Trimmed Peptide");
assert.equal(realBundle.analytes.length, 2);
assert.equal(realBundle.analytes[0].protein, "TNFRSF18");
assert.equal(realBundle.analytes[1].sequence, "PEPTIDER");

const ms1FeatureCsv = [
  "feature_id,apex_rt,feature_mz,charge_state,feature_intensity,scan_count,quality",
  "f1,12.5,500.2,2,100000,8,0.95",
  "f2,13.2,501.2,2,100000,2,0.95",
  "f3,14.8,700.3,3,900000,7,0.50",
  "f4,22.1,800.4,1,50000,5,0.90",
  "f5,35.7,900.5,4,250000,10,0.85"
].join("\n");

const ms1Parsed = Engine.parseDelimited(ms1FeatureCsv);
const ms1Bundle = Engine.buildAnalytes(ms1Parsed, "ms1_features", { minScanCount: 4, minQuality: 0.8 });
const ms1PercentThresholdBundle = Engine.buildAnalytes(ms1Parsed, "ms1_features", { minScanCount: 4, minQuality: 80 });
assert.equal(ms1Bundle.columns.rt, "apex_rt");
assert.equal(ms1Bundle.columns.mz, "feature_mz");
assert.equal(ms1Bundle.columns.charge, "charge_state");
assert.equal(ms1Bundle.columns.intensity, "feature_intensity");
assert.equal(ms1Bundle.columns.scanCount, "scan_count");
assert.equal(ms1Bundle.columns.quality, "quality");
assert.equal(ms1Bundle.analytes.length, 3);
assert.deepEqual(ms1Bundle.analytes.map((item) => item.mz), [500.2, 800.4, 900.5]);
assert.ok(ms1Bundle.analytes.every((item) => item.scanCount >= 4));
assert.ok(ms1Bundle.analytes.every((item) => item.quality >= 0.8));
assert.ok(ms1Bundle.analytes.every((item) => item.weight > 0));
assert.equal(ms1PercentThresholdBundle.analytes.length, ms1Bundle.analytes.length);

console.log("gradient-engine tests passed");
