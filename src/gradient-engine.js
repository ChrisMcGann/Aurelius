(function attachGradientEngine(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.AureliusEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function buildGradientEngine() {
  "use strict";

  const EPS = 1e-9;

  const COLUMN_ALIASES = {
    rt: [
      "rt",
      "retention_time",
      "retention time",
      "retentiontime",
      "apex_rt",
      "rt_apex",
      "raw_rt",
      "ms_rt",
      "best_rt",
      "elution_time",
      "time"
    ],
    sequence: ["sequence", "peptide", "stripped_sequence", "peptide_sequence", "trimmed peptide", "trimmed_peptide"],
    modifiedSequence: ["modified_sequence", "modified peptide", "modifiedsequence", "mod_sequence", "peptide_modified_sequence"],
    intensity: ["intensity", "area", "height", "abundance", "precursor_quantity", "precursor intensity", "precursor_intensity", "peak_area"],
    qValue: ["q_value", "q-value", "qvalue", "pep", "fdr", "posterior_error_probability", "lda q value", "lda_q_value"],
    mz: ["mz", "m/z", "precursor_mz", "precursor mz", "precursor.mass", "obs m/z", "obs_mz", "obs_m_z", "isolation m/z", "orig prec m/z"],
    charge: ["charge", "z", "precursor_charge"],
    tmtSnr: ["tmt_snr", "reporter_snr", "sn", "sum sn", "sum_sn", "summed_sn", "reporter ion sn", "reporter_ion_snr"],
    priority: ["priority", "target_priority", "rank_weight", "target_weight"],
    weight: ["weight", "optimizer_weight"],
    protein: ["protein", "protein_id", "protein ids", "gene", "genes", "gene symbol", "gene_symbol", "protein_group"],
    unique: ["unique", "is_unique", "proteotypic"],
    isolationSpecificity: ["isolation specificity", "isolation_specificity", "precursor purity", "precursor_purity"],
    peakWidth: ["peak width", "peak_width", "fwhm"],
    injectionTime: ["ion injection time", "ion_injection_time", "injection_time"],
    scan: ["scan", "scanf", "scanf", "scan number", "scan_number"]
  };

  function normalizeName(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[%()]/g, "")
      .replace(/[.\-/]+/g, "_")
      .replace(/\s+/g, "_")
      .replace(/__+/g, "_");
  }

  function countUnquoted(line, char) {
    let count = 0;
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i];
      if (c === '"') {
        quoted = !quoted;
      } else if (c === char && !quoted) {
        count += 1;
      }
    }
    return count;
  }

  function detectDelimiter(headerLine) {
    const candidates = ["\t", ",", ";"];
    let best = ",";
    let bestCount = -1;
    for (const candidate of candidates) {
      const count = countUnquoted(headerLine, candidate);
      if (count > bestCount) {
        best = candidate;
        bestCount = count;
      }
    }
    return best;
  }

  function splitDelimitedLine(line, delimiter) {
    const cells = [];
    let current = "";
    let quoted = false;

    for (let i = 0; i < line.length; i += 1) {
      const c = line[i];
      if (c === '"') {
        if (quoted && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = !quoted;
        }
      } else if (c === delimiter && !quoted) {
        cells.push(current);
        current = "";
      } else {
        current += c;
      }
    }
    cells.push(current);
    return cells.map((cell) => cell.trim());
  }

  function parseDelimited(text) {
    const lines = String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .filter((line) => line.trim().length > 0);

    if (lines.length === 0) {
      return { headers: [], rows: [], delimiter: "," };
    }

    const delimiter = detectDelimiter(lines[0]);
    const headers = splitDelimitedLine(lines[0], delimiter);
    const rows = [];

    for (let i = 1; i < lines.length; i += 1) {
      if (lines[i].trim().startsWith("#")) {
        continue;
      }
      const values = splitDelimitedLine(lines[i], delimiter);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] === undefined ? "" : values[index];
      });
      rows.push(row);
    }

    return { headers, rows, delimiter };
  }

  function findColumn(headers, aliases) {
    const normalized = new Map(headers.map((header) => [normalizeName(header), header]));
    for (const alias of aliases) {
      const key = normalizeName(alias);
      if (normalized.has(key)) {
        return normalized.get(key);
      }
    }
    return null;
  }

  function detectColumns(headers) {
    const columns = {};
    Object.keys(COLUMN_ALIASES).forEach((key) => {
      columns[key] = findColumn(headers, COLUMN_ALIASES[key]);
    });
    return columns;
  }

  function toNumber(value) {
    if (value === null || value === undefined) {
      return NaN;
    }
    const cleaned = String(value)
      .trim()
      .replace(/,/g, "")
      .replace(/%$/, "");
    if (cleaned === "") {
      return NaN;
    }
    return Number(cleaned);
  }

  function parseBoolean(value) {
    const text = String(value || "").trim().toLowerCase();
    if (["true", "yes", "y", "1", "unique"].includes(text)) {
      return true;
    }
    if (["false", "no", "n", "0", "shared"].includes(text)) {
      return false;
    }
    return null;
  }

  function median(values) {
    const nums = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
    if (nums.length === 0) {
      return NaN;
    }
    const mid = Math.floor(nums.length / 2);
    if (nums.length % 2 === 1) {
      return nums[mid];
    }
    return (nums[mid - 1] + nums[mid]) / 2;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeQValue(rawQValue) {
    if (!Number.isFinite(rawQValue)) {
      return NaN;
    }
    if (rawQValue > 1 && rawQValue <= 100) {
      return rawQValue / 100;
    }
    return rawQValue;
  }

  function confidenceFactor(rawQValue) {
    const qValue = normalizeQValue(rawQValue);
    if (!Number.isFinite(qValue)) {
      return 1;
    }
    if (qValue <= 0.001) {
      return 1.15;
    }
    if (qValue <= 0.01) {
      return 1;
    }
    if (qValue <= 0.05) {
      return 0.55;
    }
    if (qValue <= 0.1) {
      return 0.25;
    }
    return 0.08;
  }

  function isolationSpecificityFactor(value) {
    if (!Number.isFinite(value)) {
      return 1;
    }
    const normalized = value > 1 && value <= 100 ? value / 100 : value;
    if (!Number.isFinite(normalized)) {
      return 1;
    }
    return clamp(0.35 + 0.85 * normalized, 0.2, 1.25);
  }

  function intensityFactor(value, medianValue) {
    if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(medianValue) || medianValue <= 0) {
      return 1;
    }
    const scaled = Math.log10(value + 1) / Math.log10(medianValue + 1);
    return clamp(Math.sqrt(Math.max(scaled, 0)), 0.35, 3);
  }

  function priorityFactor(value, mode) {
    if (!Number.isFinite(value) || value <= 0) {
      return mode === "godig" ? 1.2 : 1;
    }
    const scaled = value <= 5 ? value : Math.sqrt(value);
    return clamp(scaled, 0.1, mode === "godig" ? 8 : 5);
  }

  function buildAnalytes(input, mode, options) {
    const parsed = typeof input === "string" ? parseDelimited(input) : input;
    const columns = detectColumns(parsed.headers || []);
    const opts = options || {};
    const maxQValue = normalizeQValue(toNumber(opts.maxQValue));
    const minIntensity = toNumber(opts.minIntensity);
    const warnings = [];
    const analytes = [];
    let skippedRows = 0;

    if (!columns.rt) {
      warnings.push("No retention-time column was detected.");
      return { analytes, columns, skippedRows: parsed.rows.length, warnings };
    }

    const intensities = parsed.rows.map((row) => toNumber(row[columns.intensity])).filter((value) => value > 0);
    const tmtSnrs = parsed.rows.map((row) => toNumber(row[columns.tmtSnr])).filter((value) => value > 0);
    const medianIntensity = median(intensities);
    const medianTmtSnr = median(tmtSnrs);

    parsed.rows.forEach((row, index) => {
      const rt = toNumber(row[columns.rt]);
      if (!Number.isFinite(rt)) {
        skippedRows += 1;
        return;
      }

      const explicitWeight = toNumber(row[columns.weight]);
      const intensity = toNumber(row[columns.intensity]);
      const qValue = toNumber(row[columns.qValue]);
      const qValueNormalized = normalizeQValue(qValue);
      const tmtSnr = toNumber(row[columns.tmtSnr]);
      const priority = toNumber(row[columns.priority]);
      const unique = parseBoolean(row[columns.unique]);
      const isolationSpecificity = toNumber(row[columns.isolationSpecificity]);

      if (Number.isFinite(maxQValue) && Number.isFinite(qValueNormalized) && qValueNormalized > maxQValue) {
        skippedRows += 1;
        return;
      }
      if (Number.isFinite(minIntensity) && Number.isFinite(intensity) && intensity < minIntensity) {
        skippedRows += 1;
        return;
      }

      let weight = Number.isFinite(explicitWeight) && explicitWeight > 0 ? explicitWeight : 1;
      weight *= intensityFactor(intensity, medianIntensity);
      weight *= confidenceFactor(qValue);
      weight *= intensityFactor(tmtSnr, medianTmtSnr);
      weight *= priorityFactor(priority, mode);
      weight *= isolationSpecificityFactor(isolationSpecificity);
      if (unique === true) {
        weight *= 1.12;
      } else if (unique === false) {
        weight *= 0.92;
      }

      if (mode === "dia" && Number.isFinite(toNumber(row[columns.mz]))) {
        weight *= 1.05;
      }

      analytes.push({
        id: String(index + 1),
        scan: toNumber(row[columns.scan]),
        sequence: columns.sequence ? row[columns.sequence] : "",
        modifiedSequence: columns.modifiedSequence ? row[columns.modifiedSequence] : "",
        charge: toNumber(row[columns.charge]),
        mz: toNumber(row[columns.mz]),
        rt,
        intensity,
        qValue: qValueNormalized,
        tmtSnr,
        priority,
        isolationSpecificity,
        peakWidth: toNumber(row[columns.peakWidth]),
        injectionTime: toNumber(row[columns.injectionTime]),
        protein: columns.protein ? row[columns.protein] : "",
        weight: Number.isFinite(weight) && weight > 0 ? weight : 1,
        sourceRow: row
      });
    });

    if (skippedRows > 0) {
      warnings.push(`${skippedRows.toLocaleString()} rows were skipped by filters or missing retention times.`);
    }
    if (analytes.length === 0) {
      warnings.push("No analytes with numeric retention times were found.");
    }

    return { analytes, columns, skippedRows, warnings };
  }

  function linearBAtRawTime(rawTime, config) {
    const rawStart = config.startTime + config.lagTime;
    const rawEnd = config.endTime + config.lagTime;
    const fraction = (rawTime - rawStart) / (rawEnd - rawStart);
    return config.startB + fraction * (config.endB - config.startB);
  }

  function weightedQuantile(sortedItems, targetWeight, startB, endB, totalWeight) {
    if (targetWeight <= 0) {
      return startB;
    }
    if (targetWeight >= totalWeight) {
      return endB;
    }

    let cumulative = 0;
    let previousB = startB;

    for (const item of sortedItems) {
      const nextCumulative = cumulative + item.weight;
      if (targetWeight <= nextCumulative + EPS) {
        const local = item.weight <= EPS ? 1 : (targetWeight - cumulative) / item.weight;
        return previousB + clamp(local, 0, 1) * (item.b - previousB);
      }
      cumulative = nextCumulative;
      previousB = item.b;
    }

    return endB;
  }

  function buildTimeGrid(startTime, endTime, stepSize) {
    const points = [];
    const safeStep = Math.max(stepSize, 0.05);
    for (let time = startTime; time < endTime - EPS; time += safeStep) {
      points.push(time);
    }
    if (points.length === 0 || Math.abs(points[points.length - 1] - endTime) > EPS) {
      points.push(endTime);
    }
    return points;
  }

  function constrainGradient(points, config) {
    const warnings = [];
    let minSlope = Number.isFinite(config.minSlope) ? Math.max(0, config.minSlope) : 0;
    let maxSlope = Number.isFinite(config.maxSlope) && config.maxSlope > 0 ? config.maxSlope : null;
    const averageSlope = (config.endB - config.startB) / (config.endTime - config.startTime);

    if (maxSlope !== null && maxSlope + EPS < averageSlope) {
      warnings.push("The maximum slope is lower than the average slope required to reach the final %B.");
      maxSlope = null;
    }
    if (minSlope > averageSlope + EPS) {
      warnings.push("The minimum slope is higher than the average slope required to reach the final %B.");
      minSlope = 0;
    }

    points[0].percentB = config.startB;

    for (let i = 1; i < points.length; i += 1) {
      const previous = points[i - 1];
      const current = points[i];
      const dt = current.methodTime - previous.methodTime;
      const lower = previous.percentB + minSlope * dt;
      const upper = maxSlope === null ? config.endB : previous.percentB + maxSlope * dt;
      current.percentB = clamp(Math.max(current.percentB, lower), config.startB, Math.min(config.endB, upper));
    }

    points[points.length - 1].percentB = config.endB;

    if (maxSlope !== null) {
      for (let i = points.length - 2; i >= 0; i -= 1) {
        const next = points[i + 1];
        const current = points[i];
        const dt = next.methodTime - current.methodTime;
        const needed = next.percentB - maxSlope * dt;
        current.percentB = clamp(Math.max(current.percentB, needed), config.startB, config.endB);
      }
      points[0].percentB = config.startB;
    }

    for (let i = 1; i < points.length; i += 1) {
      if (points[i].percentB + EPS < points[i - 1].percentB) {
        points[i].percentB = points[i - 1].percentB;
      }
    }
    points[points.length - 1].percentB = config.endB;

    return warnings;
  }

  function methodTimeForPercentB(points, percentB) {
    if (percentB <= points[0].percentB) {
      return points[0].methodTime;
    }
    const last = points[points.length - 1];
    if (percentB >= last.percentB) {
      return last.methodTime;
    }

    for (let i = 1; i < points.length; i += 1) {
      const previous = points[i - 1];
      const current = points[i];
      if (percentB <= current.percentB + EPS) {
        const db = current.percentB - previous.percentB;
        if (Math.abs(db) < EPS) {
          return current.methodTime;
        }
        const fraction = (percentB - previous.percentB) / db;
        return previous.methodTime + fraction * (current.methodTime - previous.methodTime);
      }
    }

    return last.methodTime;
  }

  function histogram(values, weights, start, end, binCount) {
    const bins = Array.from({ length: binCount }, (_, index) => ({
      index,
      start: start + (index / binCount) * (end - start),
      end: start + ((index + 1) / binCount) * (end - start),
      value: 0
    }));

    values.forEach((value, index) => {
      if (!Number.isFinite(value) || value < start || value > end) {
        return;
      }
      let binIndex = Math.floor(((value - start) / (end - start)) * binCount);
      if (binIndex === binCount) {
        binIndex = binCount - 1;
      }
      bins[binIndex].value += Number.isFinite(weights[index]) ? weights[index] : 1;
    });

    return bins;
  }

  function weightedCvFromBins(bins) {
    if (bins.length === 0) {
      return NaN;
    }
    const values = bins.map((bin) => bin.value);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    if (mean <= EPS) {
      return NaN;
    }
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
    return Math.sqrt(variance) / mean;
  }

  function defaultConfig(config) {
    return {
      startTime: Number.isFinite(config.startTime) ? config.startTime : 10,
      endTime: Number.isFinite(config.endTime) ? config.endTime : 130,
      startB: Number.isFinite(config.startB) ? config.startB : 2,
      endB: Number.isFinite(config.endB) ? config.endB : 40,
      lagTime: Number.isFinite(config.lagTime) ? config.lagTime : 0,
      stepSize: Number.isFinite(config.stepSize) && config.stepSize > 0 ? config.stepSize : 1,
      minSlope: Number.isFinite(config.minSlope) ? config.minSlope : 0,
      maxSlope: Number.isFinite(config.maxSlope) && config.maxSlope > 0 ? config.maxSlope : null,
      densityBins: Number.isFinite(config.densityBins) && config.densityBins > 3 ? Math.round(config.densityBins) : 24
    };
  }

  function computeGradient(analytes, rawConfig) {
    const config = defaultConfig(rawConfig || {});
    const warnings = [];
    const duration = config.endTime - config.startTime;
    const deltaB = config.endB - config.startB;

    if (duration <= 0) {
      throw new Error("Gradient end time must be greater than start time.");
    }
    if (deltaB <= 0) {
      throw new Error("Ending %B must be greater than starting %B.");
    }

    const rawStart = config.startTime + config.lagTime;
    const rawEnd = config.endTime + config.lagTime;
    const filteredItems = [];

    analytes.forEach((analyte) => {
      if (!Number.isFinite(analyte.rt) || !Number.isFinite(analyte.weight) || analyte.weight <= 0) {
        return;
      }
      if (analyte.rt < rawStart || analyte.rt > rawEnd) {
        return;
      }
      filteredItems.push({
        id: analyte.id,
        sequence: analyte.sequence || analyte.modifiedSequence || "",
        protein: analyte.protein || "",
        rawRT: analyte.rt,
        mz: analyte.mz,
        weight: analyte.weight,
        b: linearBAtRawTime(analyte.rt, config)
      });
    });

    if (filteredItems.length < 3) {
      throw new Error("At least three analytes must fall inside the gradient interval.");
    }

    const sortedItems = filteredItems.slice().sort((a, b) => a.b - b.b);
    const totalWeight = sortedItems.reduce((sum, item) => sum + item.weight, 0);
    const grid = buildTimeGrid(config.startTime, config.endTime, config.stepSize);

    const points = grid.map((methodTime) => {
      const fraction = (methodTime - config.startTime) / duration;
      const targetWeight = clamp(fraction, 0, 1) * totalWeight;
      return {
        methodTime,
        rawTime: methodTime + config.lagTime,
        percentB: weightedQuantile(sortedItems, targetWeight, config.startB, config.endB, totalWeight)
      };
    });

    warnings.push(...constrainGradient(points, config));

    const simulatedAnalytes = filteredItems.map((item) => {
      const optimizedMethodTime = methodTimeForPercentB(points, item.b);
      return {
        id: item.id,
        sequence: item.sequence,
        protein: item.protein,
        mz: item.mz,
        weight: item.weight,
        percentB: item.b,
        rawRT: item.rawRT,
        optimizedMethodTime,
        optimizedRawRT: optimizedMethodTime + config.lagTime
      };
    });

    const originalHistogram = histogram(
      simulatedAnalytes.map((item) => item.rawRT),
      simulatedAnalytes.map((item) => item.weight),
      rawStart,
      rawEnd,
      config.densityBins
    );
    const optimizedHistogram = histogram(
      simulatedAnalytes.map((item) => item.optimizedRawRT),
      simulatedAnalytes.map((item) => item.weight),
      rawStart,
      rawEnd,
      config.densityBins
    );
    const originalCv = weightedCvFromBins(originalHistogram);
    const optimizedCv = weightedCvFromBins(optimizedHistogram);

    const slopes = [];
    for (let i = 1; i < points.length; i += 1) {
      const dt = points[i].methodTime - points[i - 1].methodTime;
      slopes.push((points[i].percentB - points[i - 1].percentB) / dt);
    }
    const slopeChanges = [];
    for (let i = 1; i < slopes.length; i += 1) {
      slopeChanges.push(Math.abs(slopes[i] - slopes[i - 1]));
    }

    if (filteredItems.length < analytes.length) {
      warnings.push(`${analytes.length - filteredItems.length} analytes were outside the configured gradient interval.`);
    }

    return {
      config,
      points,
      linearPoints: [
        { methodTime: config.startTime, rawTime: rawStart, percentB: config.startB },
        { methodTime: config.endTime, rawTime: rawEnd, percentB: config.endB }
      ],
      simulatedAnalytes,
      originalHistogram,
      optimizedHistogram,
      diagnostics: {
        inputAnalytes: analytes.length,
        usedAnalytes: filteredItems.length,
        skippedAnalytes: analytes.length - filteredItems.length,
        totalWeight,
        weightedAnalytesPerMinute: totalWeight / duration,
        originalCv,
        optimizedCv,
        improvementPct: Number.isFinite(originalCv) && originalCv > 0
          ? ((originalCv - optimizedCv) / originalCv) * 100
          : NaN,
        minSlope: Math.min(...slopes),
        maxSlope: Math.max(...slopes),
        meanSlope: slopes.reduce((sum, slope) => sum + slope, 0) / slopes.length,
        maxSlopeChange: slopeChanges.length ? Math.max(...slopeChanges) : 0,
        meanSlopeChange: slopeChanges.length
          ? slopeChanges.reduce((sum, value) => sum + value, 0) / slopeChanges.length
          : 0
      },
      warnings
    };
  }

  function recommendedMaxSlope(rawConfig, options) {
    const config = defaultConfig(rawConfig || {});
    const opts = options || {};
    const duration = config.endTime - config.startTime;
    const averageSlope = (config.endB - config.startB) / duration;
    const multiplier = Number.isFinite(opts.multiplier) ? opts.multiplier : 2.4;
    const floor = Number.isFinite(opts.floor) ? opts.floor : 0.75;
    const ceiling = Number.isFinite(opts.ceiling) ? opts.ceiling : 1.25;
    return clamp(Math.max(averageSlope * multiplier, floor), averageSlope, ceiling);
  }

  function roundSlope(value) {
    if (!Number.isFinite(value)) {
      return null;
    }
    return Math.round(value * 1000) / 1000;
  }

  function scoreGradientResult(result, options) {
    const opts = options || {};
    const d = result.diagnostics;
    const targetMaxSlope = Number.isFinite(opts.targetMaxSlope)
      ? opts.targetMaxSlope
      : recommendedMaxSlope(result.config, opts);
    const improvementPct = Number.isFinite(d.improvementPct) ? d.improvementPct : 0;
    const maxSlope = Number.isFinite(d.maxSlope) ? d.maxSlope : 0;
    const slopeExcess = targetMaxSlope > EPS ? Math.max(0, maxSlope - targetMaxSlope) / targetMaxSlope : 0;
    const roughnessTarget = targetMaxSlope * 0.8;
    const roughnessExcess = roughnessTarget > EPS
      ? Math.max(0, d.maxSlopeChange - roughnessTarget) / roughnessTarget
      : 0;
    const score = improvementPct - (45 * slopeExcess) - (12 * roughnessExcess);

    return {
      score,
      targetMaxSlope,
      improvementPct,
      slopePenalty: 45 * slopeExcess,
      roughnessPenalty: 12 * roughnessExcess,
      feasible: slopeExcess <= 0.05
    };
  }

  function defaultCandidateProfiles(rawConfig, options) {
    const config = defaultConfig(rawConfig || {});
    const duration = config.endTime - config.startTime;
    const averageSlope = (config.endB - config.startB) / duration;
    const preferred = recommendedMaxSlope(config, options);
    const rawProfiles = [
      { name: "unconstrained", label: "Unconstrained", maxSlope: null },
      {
        name: "permissive",
        label: "Permissive",
        maxSlope: Math.max(preferred * 1.35, averageSlope * 3.2)
      },
      {
        name: "balanced",
        label: "Balanced",
        maxSlope: preferred
      },
      {
        name: "gentle",
        label: "Gentle",
        maxSlope: Math.max(averageSlope * 1.8, preferred * 0.72, averageSlope)
      }
    ];

    const seen = new Set();
    return rawProfiles.filter((profile) => {
      const key = profile.maxSlope === null ? "none" : roundSlope(profile.maxSlope).toFixed(3);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    }).map((profile) => ({
      ...profile,
      maxSlope: roundSlope(profile.maxSlope)
    }));
  }

  function computeGradientCandidates(analytes, rawConfig, options) {
    const opts = options || {};
    const profiles = Array.isArray(opts.profiles) && opts.profiles.length
      ? opts.profiles
      : defaultCandidateProfiles(rawConfig, opts);

    const candidates = profiles.map((profile) => {
      const config = {
        ...(rawConfig || {}),
        maxSlope: profile.maxSlope
      };
      const result = computeGradient(analytes, config);
      const scoring = scoreGradientResult(result, opts);
      return {
        name: profile.name,
        label: profile.label || profile.name,
        maxSlope: profile.maxSlope,
        result,
        scoring
      };
    });

    const feasible = candidates.filter((candidate) => candidate.scoring.feasible);
    const sorted = (feasible.length ? feasible : candidates)
      .slice()
      .sort((a, b) => b.scoring.score - a.scoring.score);
    return {
      recommended: sorted[0],
      candidates,
      ranked: sorted
    };
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) {
      return "";
    }
    return value.toFixed(digits);
  }

  function formatGradientCsv(result) {
    const lines = ["method_time_min,raw_time_min,percent_b"];
    result.points.forEach((point) => {
      lines.push([
        formatNumber(point.methodTime, 3),
        formatNumber(point.rawTime, 3),
        formatNumber(point.percentB, 3)
      ].join(","));
    });
    return `${lines.join("\n")}\n`;
  }

  function suggestMzWindows(analytes, options) {
    const opts = options || {};
    const windowCount = Number.isFinite(opts.windowCount) && opts.windowCount > 1 ? Math.round(opts.windowCount) : 24;
    const mzItems = analytes
      .filter((item) => Number.isFinite(item.mz) && Number.isFinite(item.weight) && item.weight > 0)
      .map((item) => ({ mz: item.mz, weight: item.weight }))
      .sort((a, b) => a.mz - b.mz);

    if (mzItems.length < windowCount) {
      return { windows: [], warnings: ["Not enough m/z values to suggest DIA windows."] };
    }

    const minMz = Number.isFinite(opts.minMz) ? opts.minMz : mzItems[0].mz;
    const maxMz = Number.isFinite(opts.maxMz) ? opts.maxMz : mzItems[mzItems.length - 1].mz;
    const bounded = mzItems.filter((item) => item.mz >= minMz && item.mz <= maxMz);
    const totalWeight = bounded.reduce((sum, item) => sum + item.weight, 0);
    const boundaries = [minMz];

    for (let i = 1; i < windowCount; i += 1) {
      const target = (i / windowCount) * totalWeight;
      boundaries.push(weightedMzQuantile(bounded, target, minMz, maxMz, totalWeight));
    }
    boundaries.push(maxMz);

    const windows = [];
    for (let i = 0; i < boundaries.length - 1; i += 1) {
      const lower = boundaries[i];
      const upper = boundaries[i + 1];
      const weightedCount = bounded
        .filter((item) => item.mz >= lower && (i === boundaries.length - 2 ? item.mz <= upper : item.mz < upper))
        .reduce((sum, item) => sum + item.weight, 0);
      windows.push({ index: i + 1, lower, upper, width: upper - lower, weightedCount });
    }

    return { windows, warnings: [] };
  }

  function weightedMzQuantile(sortedItems, targetWeight, minMz, maxMz, totalWeight) {
    if (targetWeight <= 0) {
      return minMz;
    }
    if (targetWeight >= totalWeight) {
      return maxMz;
    }
    let cumulative = 0;
    let previousMz = minMz;
    for (const item of sortedItems) {
      const nextCumulative = cumulative + item.weight;
      if (targetWeight <= nextCumulative + EPS) {
        const local = item.weight <= EPS ? 1 : (targetWeight - cumulative) / item.weight;
        return previousMz + clamp(local, 0, 1) * (item.mz - previousMz);
      }
      cumulative = nextCumulative;
      previousMz = item.mz;
    }
    return maxMz;
  }

  function summarizeSchedulePressure(result, binCount) {
    const count = Number.isFinite(binCount) && binCount > 1 ? Math.round(binCount) : 12;
    const cfg = result.config;
    const bins = histogram(
      result.simulatedAnalytes.map((item) => item.optimizedRawRT),
      result.simulatedAnalytes.map((item) => item.weight),
      cfg.startTime + cfg.lagTime,
      cfg.endTime + cfg.lagTime,
      count
    );
    return bins
      .slice()
      .sort((a, b) => b.value - a.value)
      .slice(0, Math.min(6, bins.length));
  }

  return {
    parseDelimited,
    detectColumns,
    buildAnalytes,
    computeGradient,
    computeGradientCandidates,
    defaultCandidateProfiles,
    recommendedMaxSlope,
    scoreGradientResult,
    formatGradientCsv,
    suggestMzWindows,
    summarizeSchedulePressure,
    methodTimeForPercentB,
    histogram,
    _internal: {
      normalizeName,
      weightedQuantile,
      median,
      clamp,
      normalizeQValue
    }
  };
});
