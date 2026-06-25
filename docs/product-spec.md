# Aurelius Product Spec

## Purpose

Aurelius designs LC gradients for bottom-up proteomics methods from real experimental evidence. The app should help a user move from "this is how my peptides currently elute" to "this is the LC method I should try next", while keeping the recommendation traceable and easy to validate.

## Product Principles

- Keep instrument reality visible: lag time, start/end solvent composition, slope limits, method waypoints, cycle time, and scheduling pressure are first-class inputs.
- Use the 2013 nonlinear-gradient quantile transform as the baseline, then improve it with better weighting and mode-specific objectives.
- Treat every run as calibration data. The app should improve as a lab accumulates linear, optimized, and validation runs.
- Make outputs practical: CSV method tables, DIA windows, target schedules, plots, and a compact validation report.

## Modes

## Immediate Focus

The near-term build should focus on DDA/TMT until the workflow is strong with real lab files. The app should first become good at reading search/quant outputs, detecting the best RT/intensity/confidence columns, building a trustworthy weighted RT distribution, and exporting an LC method table that can be tested directly.

The first real DDA file should drive:

- import profile additions for the actual column names
- a better weighting preset for the experiment type
- validation metrics that match the search/quant workflow
- plot labels and exports that match the user's instrument method language
- confidence filtering from q-value/FDR/PEP fields before optimization

For MS1-style DDA optimization, the app should read observed MS1 feature distributions from `.raw` or converted mzML data when possible. The source method file answers "what gradient was requested"; the raw data answers "where did abundant ions actually elute".

### DDA/TMT

Primary objective: increase confident and quantifiable peptide observations by flattening acquisition pressure over the gradient.

Initial weighting inputs:

- peptide or precursor retention time
- intensity or area
- q-value or PEP
- TMT reporter S/N or summed reporter ion intensity
- protein/peptide priority
- uniqueness or target class

Near-term additions:

- SPS/MS3 or RTS eligibility flags
- coisolation/interference estimates
- replicate consensus RT distributions
- MS1 feature extraction from `.raw`, mzML, or feature-detection outputs
- separate optimization presets for discovery, coverage, and quantitation
- automatic source-gradient import from instrument method metadata when available

### DIA

Primary objective: balance precursor density across RT and m/z while preserving enough points across chromatographic peaks.

Initial outputs:

- LC gradient
- simple variable m/z windows from precursor m/z density

Near-term additions:

- RT by m/z heatmap density
- cycle-time constraint checking
- variable DIA window scheduling over RT
- DIA-NN and Spectronaut report import profiles
- library-aware weighting by proteotypic value and fragment interference

### GoDig Targeted

Primary objective: maximize reliable target observation under target priority, RT uncertainty, and scheduling conflict constraints.

Initial outputs:

- LC gradient from weighted target RTs
- scheduling pressure table

Near-term additions:

- target grouping and assay priority rules
- RT uncertainty windows
- dwell/observation constraints
- method export matching GoDig inputs
- validation report focused on target hit rate and missingness

## Optimization Model

The current baseline is a weighted quantile transform:

1. Convert each analyte RT from raw/MS time into its corresponding `%B` under the starting linear gradient.
2. Sort analytes by `%B`.
3. At each output time point, choose the `%B` value whose cumulative analyte weight matches the desired cumulative time fraction.
4. Enforce monotonicity and optional slope limits.
5. Simulate the optimized RT for each analyte by inverting the optimized gradient.
6. Report density flattening and export method waypoints.

The next optimizer should support multiple objective terms:

- weighted analyte density flattening
- peak-width preservation
- target priority coverage
- cycle-time pressure
- m/z-window interference
- gradient smoothness and LC feasibility

## Gradient Source Import

Today the user manually enters the source linear gradient. The planned reader should extract this directly from acquisition metadata where possible.

This is separate from MS1-feature extraction. For DDA/TMT MS1-style optimization, `.raw` is often the best evidence source for the observed feature density, while `.meth` or method exports are usually cleaner evidence for the intended LC gradient.

Preferred order:

1. Read `.meth` or method-export files first if they expose LC gradient waypoints as text, XML, or a structured vendor export. This is likely the cleanest route because it should contain the intended LC method rather than an inferred trace.
2. Read `.raw` files when method files are unavailable. For Thermo RAW, this will likely require a local helper backed by Thermo RawFileReader or ThermoRawFileParser. RAW support should extract method gradient metadata when present and fall back to observed scan timing only for validation, not as the primary method definition.
3. Allow pasted/manual gradients as the universal fallback.

For MS1-feature extraction:

1. Prefer `.raw` or mzML when the user wants the optimizer to use observed high-intensity MS1 ions.
2. Extract or import feature apex RT, m/z, charge, intensity, and optionally peak width.
3. Filter features by persistence, intensity, charge state, m/z range, and analytical gradient interval.
4. Weight the remaining features by abundance and acquisition relevance before applying the nonlinear gradient optimizer.

The source-gradient object should preserve:

- method source path and file type
- vendor/instrument hints
- gradient start/end and all waypoints
- LC-MS lag estimate or placeholder
- solvent channel labels if available
- warnings when the file contains multiple gradients, blanks, equilibrations, or non-analytical ramps

## Milestones

1. DDA/TMT real-file pass: adapt import, weighting, plots, and exports around a representative DDA/TMT output table.
2. MS1 feature extraction: build a `.raw`/mzML-backed path for MS1-style optimization using observed high-intensity features.
3. Source-gradient import: read gradients from `.meth` or method-export files first, then evaluate `.raw` metadata extraction.
4. DDA/TMT validation reports: compare linear and optimized runs by IDs, quantitative quality, density, and RT drift.
5. DIA MVP: DIA-NN/Spectronaut import and variable m/z windows.
6. GoDig MVP: target schedule optimizer and export.
7. Model memory: instrument/column/method profiles with calibration history.

Thermo method support should distinguish LC-gradient import from MS-method export. The `thermofisherlsms/meth-modifications` project is promising for MS method export/modification and for trying `.meth` summary/XML export, but LC gradient waypoint extraction still needs proof from an exported method or a vendor LC method export.
