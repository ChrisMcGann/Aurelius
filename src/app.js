(function bootAureliusApp() {
  "use strict";

  const Engine = window.AureliusEngine;

  const state = {
    mode: "dda_tmt",
    parsed: null,
    bundle: null,
    result: null,
    adjunctCsv: "",
    gradientCsv: ""
  };

  const el = {
    modeButtons: document.getElementById("modeButtons"),
    fileInput: document.getElementById("fileInput"),
    sampleButton: document.getElementById("sampleButton"),
    runButton: document.getElementById("runButton"),
    fitRtButton: document.getElementById("fitRtButton"),
    tableInput: document.getElementById("tableInput"),
    startTime: document.getElementById("startTime"),
    endTime: document.getElementById("endTime"),
    startB: document.getElementById("startB"),
    endB: document.getElementById("endB"),
    lagTime: document.getElementById("lagTime"),
    stepSize: document.getElementById("stepSize"),
    minSlope: document.getElementById("minSlope"),
    maxSlope: document.getElementById("maxSlope"),
    densityBins: document.getElementById("densityBins"),
    diaWindows: document.getElementById("diaWindows"),
    maxQValue: document.getElementById("maxQValue"),
    minIntensity: document.getElementById("minIntensity"),
    downloadGradient: document.getElementById("downloadGradient"),
    downloadAdjunct: document.getElementById("downloadAdjunct"),
    metrics: document.getElementById("metrics"),
    gradientCanvas: document.getElementById("gradientCanvas"),
    densityCanvas: document.getElementById("densityCanvas"),
    gradientCaption: document.getElementById("gradientCaption"),
    densityCaption: document.getElementById("densityCaption"),
    columnStatus: document.getElementById("columnStatus"),
    methodStatus: document.getElementById("methodStatus"),
    adjunctStatus: document.getElementById("adjunctStatus"),
    previewTable: document.getElementById("previewTable"),
    gradientTable: document.getElementById("gradientTable"),
    adjunctPanel: document.getElementById("adjunctPanel"),
    messages: document.getElementById("messages")
  };

  function numberFrom(input, fallback) {
    const value = Number(input.value);
    return Number.isFinite(value) ? value : fallback;
  }

  function readConfig() {
    const maxSlope = Number(el.maxSlope.value);
    return {
      startTime: numberFrom(el.startTime, 10),
      endTime: numberFrom(el.endTime, 130),
      startB: numberFrom(el.startB, 2),
      endB: numberFrom(el.endB, 40),
      lagTime: numberFrom(el.lagTime, 0),
      stepSize: numberFrom(el.stepSize, 1),
      minSlope: numberFrom(el.minSlope, 0),
      maxSlope: Number.isFinite(maxSlope) && maxSlope > 0 ? maxSlope : null,
      densityBins: Math.max(4, Math.round(numberFrom(el.densityBins, 24)))
    };
  }

  function readFilterOptions() {
    const maxQValue = Number(el.maxQValue.value);
    const minIntensity = Number(el.minIntensity.value);
    return {
      maxQValue: Number.isFinite(maxQValue) && maxQValue >= 0 ? maxQValue : null,
      minIntensity: Number.isFinite(minIntensity) && minIntensity > 0 ? minIntensity : null
    };
  }

  function fmt(value, digits) {
    if (!Number.isFinite(value)) {
      return "-";
    }
    return value.toFixed(digits);
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function tableHtml(headers, rows, formatter) {
    if (!rows || rows.length === 0) {
      return '<div class="empty">No rows</div>';
    }
    const head = headers.map((header) => `<th>${escapeHtml(header.label)}</th>`).join("");
    const body = rows.map((row) => {
      const cells = headers.map((header) => {
        const raw = typeof formatter === "function" ? formatter(row, header.key) : row[header.key];
        return `<td>${escapeHtml(raw)}</td>`;
      }).join("");
      return `<tr>${cells}</tr>`;
    }).join("");
    return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  function setMessages(messages) {
    el.messages.innerHTML = messages.map((message) => `<div class="message">${escapeHtml(message)}</div>`).join("");
  }

  function setMode(mode) {
    state.mode = mode;
    [...el.modeButtons.querySelectorAll("button")].forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === mode);
    });
    if (el.tableInput.value.trim()) {
      runAnalysis();
    }
  }

  function loadSample() {
    el.tableInput.value = makeSampleCsv();
    el.fileInput.value = "";
    runAnalysis();
  }

  function makeSampleCsv() {
    const rows = ["sequence,protein,rt,mz,charge,intensity,q_value,tmt_snr,priority,unique"];
    const proteins = ["MAPK1", "AKT1", "TP53", "HSP90AA1", "GAPDH", "EEF2", "RPLP0", "VIM"];
    for (let i = 0; i < 96; i += 1) {
      const cluster = i % 4;
      const band = cluster === 0 ? 23 : cluster === 1 ? 58 : cluster === 2 ? 74 : 103;
      const rt = band + ((i * 7) % 19) * 0.82 + Math.sin(i * 0.71) * 1.9;
      const mz = 410 + ((i * 47) % 760) + (i % 5) * 0.17;
      const intensity = Math.round(40000 + Math.pow((i % 17) + 2, 2.4) * 3100);
      const q = i % 13 === 0 ? 0.025 : i % 9 === 0 ? 0.008 : 0.003;
      const snr = 8 + (i % 21) * 1.7;
      const priority = i % 16 === 0 ? 3 : i % 7 === 0 ? 2 : 1;
      const unique = i % 6 === 0 ? "false" : "true";
      const seq = `PEPTIDE${String(i + 1).padStart(3, "0")}`;
      rows.push([
        seq,
        proteins[i % proteins.length],
        rt.toFixed(3),
        mz.toFixed(4),
        (i % 3) + 2,
        intensity,
        q,
        snr.toFixed(2),
        priority,
        unique
      ].join(","));
    }
    return rows.join("\n");
  }

  function runAnalysis() {
    const text = el.tableInput.value.trim();
    if (!text) {
      setMessages(["Load or paste a peptide table before running."]);
      return;
    }

    try {
      const parsed = Engine.parseDelimited(text);
      const bundle = Engine.buildAnalytes(parsed, state.mode, readFilterOptions());
      const result = Engine.computeGradient(bundle.analytes, readConfig());

      state.parsed = parsed;
      state.bundle = bundle;
      state.result = result;
      state.gradientCsv = Engine.formatGradientCsv(result);

      updateMetrics(result);
      updateColumns(parsed, bundle);
      updateGradientTable(result);
      updateAdjunct(bundle, result);
      drawAll();

      el.downloadGradient.disabled = false;
      el.downloadAdjunct.disabled = state.adjunctCsv.length === 0;

      const messages = [...bundle.warnings, ...result.warnings].filter(Boolean);
      setMessages(messages);
    } catch (error) {
      state.result = null;
      el.downloadGradient.disabled = true;
      el.downloadAdjunct.disabled = true;
      setMessages([error.message]);
    }
  }

  function fitRtWindow() {
    const text = el.tableInput.value.trim();
    if (!text) {
      setMessages(["Load or paste a peptide table before fitting the RT window."]);
      return;
    }

    try {
      const parsed = Engine.parseDelimited(text);
      const bundle = Engine.buildAnalytes(parsed, state.mode, readFilterOptions());
      const rts = bundle.analytes.map((item) => item.rt).filter(Number.isFinite);
      if (rts.length < 3) {
        setMessages(["At least three analytes with numeric RTs are needed to fit the window."]);
        return;
      }
      const minRt = Math.min(...rts);
      const maxRt = Math.max(...rts);
      el.startTime.value = Math.max(0, Math.floor(minRt)).toString();
      el.endTime.value = Math.ceil(maxRt).toString();
      runAnalysis();
    } catch (error) {
      setMessages([error.message]);
    }
  }

  function updateMetrics(result) {
    const d = result.diagnostics;
    const values = [
      { label: "Used Analytes", value: d.usedAnalytes.toLocaleString() },
      { label: "Weighted / Min", value: fmt(d.weightedAnalytesPerMinute, 1) },
      { label: "Density CV", value: `${fmt(d.originalCv, 2)} -> ${fmt(d.optimizedCv, 2)}` },
      { label: "Flattening", value: `${fmt(d.improvementPct, 1)}%` },
      { label: "Max Slope", value: `${fmt(d.maxSlope, 2)} %B/min` }
    ];
    el.metrics.innerHTML = values.map((item) => (
      `<div class="metric"><strong>${escapeHtml(item.value)}</strong><span>${escapeHtml(item.label)}</span></div>`
    )).join("");
    el.gradientCaption.textContent = `${fmt(result.config.startB, 1)} to ${fmt(result.config.endB, 1)} %B`;
    el.densityCaption.textContent = `${result.config.densityBins} bins`;
  }

  function updateColumns(parsed, bundle) {
    const columns = Object.entries(bundle.columns)
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}: ${value}`);
    el.columnStatus.textContent = `${parsed.rows.length.toLocaleString()} rows`;

    const previewRows = parsed.rows.slice(0, 8);
    const headers = parsed.headers.slice(0, 8).map((header) => ({ key: header, label: header }));
    el.previewTable.innerHTML = [
      columns.length ? `<div class="empty">${escapeHtml(columns.join(" | "))}</div>` : "",
      tableHtml(headers, previewRows)
    ].join("");
  }

  function updateGradientTable(result) {
    el.methodStatus.textContent = `${result.points.length} waypoints`;
    const rows = result.points.slice(0, 12);
    el.gradientTable.innerHTML = tableHtml(
      [
        { key: "methodTime", label: "Method Min" },
        { key: "rawTime", label: "Raw Min" },
        { key: "percentB", label: "%B" }
      ],
      rows,
      (row, key) => fmt(row[key], 3)
    );
  }

  function updateAdjunct(bundle, result) {
    state.adjunctCsv = "";
    el.adjunctStatus.textContent = "";
    el.adjunctPanel.innerHTML = "";

    if (state.mode === "dia") {
      const windowCount = Math.max(2, Math.round(numberFrom(el.diaWindows, 24)));
      const suggestion = Engine.suggestMzWindows(result.simulatedAnalytes, { windowCount });
      suggestion.warnings.forEach((warning) => {
        if (!result.warnings.includes(warning)) {
          result.warnings.push(warning);
        }
      });
      el.adjunctStatus.textContent = suggestion.windows.length ? `${suggestion.windows.length} windows` : "No windows";
      el.adjunctPanel.innerHTML = tableHtml(
        [
          { key: "index", label: "Window" },
          { key: "lower", label: "Low m/z" },
          { key: "upper", label: "High m/z" },
          { key: "width", label: "Width" },
          { key: "weightedCount", label: "Weight" }
        ],
        suggestion.windows.slice(0, 16),
        (row, key) => key === "index" ? row[key] : fmt(row[key], key === "weightedCount" ? 1 : 2)
      );
      state.adjunctCsv = windowsCsv(suggestion.windows);
      return;
    }

    if (state.mode === "godig") {
      const pressure = Engine.summarizeSchedulePressure(result, 12);
      el.adjunctStatus.textContent = "Top pressure";
      el.adjunctPanel.innerHTML = tableHtml(
        [
          { key: "start", label: "Raw Start" },
          { key: "end", label: "Raw End" },
          { key: "value", label: "Weight" }
        ],
        pressure,
        (row, key) => fmt(row[key], key === "value" ? 1 : 2)
      );
      state.adjunctCsv = pressureCsv(pressure);
      return;
    }

    const pressure = Engine.summarizeSchedulePressure(result, 8);
    el.adjunctStatus.textContent = "Pressure bins";
    el.adjunctPanel.innerHTML = tableHtml(
      [
        { key: "start", label: "Raw Start" },
        { key: "end", label: "Raw End" },
        { key: "value", label: "Weight" }
      ],
      pressure,
      (row, key) => fmt(row[key], key === "value" ? 1 : 2)
    );
    state.adjunctCsv = pressureCsv(pressure);
  }

  function windowsCsv(windows) {
    if (!windows.length) {
      return "";
    }
    return [
      "window,low_mz,high_mz,width,weighted_count",
      ...windows.map((row) => [
        row.index,
        fmt(row.lower, 4),
        fmt(row.upper, 4),
        fmt(row.width, 4),
        fmt(row.weightedCount, 4)
      ].join(","))
    ].join("\n") + "\n";
  }

  function pressureCsv(rows) {
    if (!rows.length) {
      return "";
    }
    return [
      "raw_start_min,raw_end_min,weighted_pressure",
      ...rows.map((row) => [fmt(row.start, 4), fmt(row.end, 4), fmt(row.value, 4)].join(","))
    ].join("\n") + "\n";
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function setupCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(300, Math.floor(rect.width * ratio));
    canvas.height = Math.max(240, Math.floor(rect.height * ratio));
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx, width: rect.width, height: rect.height };
  }

  function drawAll() {
    if (!state.result) {
      return;
    }
    drawGradient();
    drawDensity();
  }

  function drawGradient() {
    const { ctx, width, height } = setupCanvas(el.gradientCanvas);
    const result = state.result;
    const padding = { left: 52, right: 18, top: 18, bottom: 38 };
    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;
    const cfg = result.config;

    ctx.clearRect(0, 0, width, height);
    drawFrame(ctx, padding, plotW, plotH);

    const x = (time) => padding.left + ((time - cfg.startTime) / (cfg.endTime - cfg.startTime)) * plotW;
    const y = (b) => padding.top + (1 - ((b - cfg.startB) / (cfg.endB - cfg.startB))) * plotH;

    drawGridText(ctx, padding, plotW, plotH, `${fmt(cfg.startTime, 0)}`, `${fmt(cfg.endTime, 0)}`, "%B");

    ctx.strokeStyle = "#8b9692";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(x(cfg.startTime), y(cfg.startB));
    ctx.lineTo(x(cfg.endTime), y(cfg.endB));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = "#b34a3e";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    result.points.forEach((point, index) => {
      const px = x(point.methodTime);
      const py = y(point.percentB);
      if (index === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    });
    ctx.stroke();

    ctx.fillStyle = "#17201d";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("linear", padding.left + 6, padding.top + 16);
    ctx.fillStyle = "#b34a3e";
    ctx.fillText("optimized", padding.left + 6, padding.top + 34);
  }

  function drawDensity() {
    const { ctx, width, height } = setupCanvas(el.densityCanvas);
    const result = state.result;
    const padding = { left: 52, right: 18, top: 18, bottom: 38 };
    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;
    const original = result.originalHistogram;
    const optimized = result.optimizedHistogram;
    const maxValue = Math.max(
      1,
      ...original.map((bin) => bin.value),
      ...optimized.map((bin) => bin.value)
    );
    const barW = plotW / original.length;

    ctx.clearRect(0, 0, width, height);
    drawFrame(ctx, padding, plotW, plotH);
    drawGridText(
      ctx,
      padding,
      plotW,
      plotH,
      fmt(result.config.startTime + result.config.lagTime, 0),
      fmt(result.config.endTime + result.config.lagTime, 0),
      "weight"
    );

    original.forEach((bin, index) => {
      const h = (bin.value / maxValue) * plotH;
      ctx.fillStyle = "#c8d0cd";
      ctx.fillRect(padding.left + index * barW + 1, padding.top + plotH - h, Math.max(1, barW - 2), h);
    });

    optimized.forEach((bin, index) => {
      const h = (bin.value / maxValue) * plotH;
      ctx.fillStyle = "rgba(8, 127, 131, 0.72)";
      ctx.fillRect(padding.left + index * barW + barW * 0.22, padding.top + plotH - h, Math.max(1, barW * 0.56), h);
    });

    ctx.fillStyle = "#65706d";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("linear", padding.left + 6, padding.top + 16);
    ctx.fillStyle = "#087f83";
    ctx.fillText("optimized", padding.left + 6, padding.top + 34);
  }

  function drawFrame(ctx, padding, plotW, plotH) {
    ctx.fillStyle = "#fbfcfb";
    ctx.fillRect(0, 0, padding.left + plotW + padding.right, padding.top + plotH + padding.bottom);
    ctx.strokeStyle = "#d7dedb";
    ctx.lineWidth = 1;
    ctx.strokeRect(padding.left, padding.top, plotW, plotH);
    ctx.strokeStyle = "#edf1ef";
    for (let i = 1; i < 4; i += 1) {
      const y = padding.top + (plotH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + plotW, y);
      ctx.stroke();
    }
  }

  function drawGridText(ctx, padding, plotW, plotH, leftLabel, rightLabel, yLabel) {
    ctx.fillStyle = "#65706d";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(leftLabel, padding.left, padding.top + plotH + 24);
    ctx.textAlign = "right";
    ctx.fillText(rightLabel, padding.left + plotW, padding.top + plotH + 24);
    ctx.save();
    ctx.translate(18, padding.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
    ctx.textAlign = "left";
  }

  el.modeButtons.addEventListener("click", (event) => {
    if (event.target.matches("button[data-mode]")) {
      setMode(event.target.dataset.mode);
    }
  });

  el.sampleButton.addEventListener("click", loadSample);
  el.runButton.addEventListener("click", runAnalysis);
  el.fitRtButton.addEventListener("click", fitRtWindow);

  el.fileInput.addEventListener("change", () => {
    const file = el.fileInput.files && el.fileInput.files[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      el.tableInput.value = String(reader.result || "");
      runAnalysis();
    };
    reader.readAsText(file);
  });

  [
    el.startTime,
    el.endTime,
    el.startB,
    el.endB,
    el.lagTime,
    el.stepSize,
    el.minSlope,
    el.maxSlope,
    el.densityBins,
    el.diaWindows,
    el.maxQValue,
    el.minIntensity
  ].forEach((input) => {
    input.addEventListener("change", () => {
      if (el.tableInput.value.trim()) {
        runAnalysis();
      }
    });
  });

  el.downloadGradient.addEventListener("click", () => {
    downloadText("aurelius-gradient.csv", state.gradientCsv);
  });

  el.downloadAdjunct.addEventListener("click", () => {
    downloadText(`aurelius-${state.mode}-output.csv`, state.adjunctCsv);
  });

  window.addEventListener("resize", drawAll);

  loadSample();
})();
