# Aurelius

Aurelius is a local-first LC gradient optimizer for mass spectrometry-based bottom-up proteomics.

The first working slice implements the baseline nonlinear-gradient idea from Moruz et al. and generalizes it into a weighted optimizer for DDA/TMT peptide tables. DIA and GoDig targeted workflows are represented in the data model and UI so they can grow into acquisition-aware optimizers without changing the project shape.

## Current MVP

- Import a CSV or TSV peptide/precursor table.
- Detect common retention-time, intensity, q-value, m/z, TMT S/N, and priority columns.
- Calculate a weighted nonlinear LC gradient from the input retention-time distribution.
- Generate LC-realistic DDA candidate gradients and recommend a slope-aware candidate.
- Compare linear vs optimized analyte density.
- Export LC method waypoints as CSV.
- For DIA mode, suggest simple variable m/z windows from precursor density when m/z values are present.
- For GoDig mode, summarize target scheduling pressure from weighted target density.

Near-term work is DDA/TMT-first. Planned method metadata support will read the source gradient from `.meth` or other method-export files first, then evaluate `.raw` metadata extraction when method files are not available.

For MS1-style DDA optimization, RAW/mzML support is also planned as a feature source: extract high-intensity MS1 feature apex RT, m/z, charge, and intensity, then optimize the LC gradient from the observed feature distribution.

Open [index.html](./index.html) in a browser to use the app.

## Test

Use the bundled Node runtime or any recent Node.js:

```powershell
& 'C:\Users\cmcga\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tests\gradient-engine.test.js
```

## Project Layout

- [docs/product-spec.md](./docs/product-spec.md) - product plan and milestones.
- [docs/dda-workflow.md](./docs/dda-workflow.md) - DDA/TMT browser and CLI workflow.
- [docs/data-schema.md](./docs/data-schema.md) - normalized analyte schema.
- [docs/thermo-meth-modifications.md](./docs/thermo-meth-modifications.md) - notes on Thermo's XML method modification tooling.
- [src/gradient-engine.js](./src/gradient-engine.js) - optimizer and parser.
- [src/app.js](./src/app.js) - browser UI controller.
- [tools/optimize-dda.js](./tools/optimize-dda.js) - command-line DDA optimizer.
- [examples/dda_tmt_peptides.csv](./examples/dda_tmt_peptides.csv) - sample input.
- [tests/gradient-engine.test.js](./tests/gradient-engine.test.js) - smoke tests.

## References

- Moruz L, Pichler P, Stranzl T, Mechtler K, Kall L. Optimized nonlinear gradients for reversed-phase liquid chromatography in shotgun proteomics. Analytical Chemistry. 2013. DOI: `10.1021/ac401145q`.
- NonlinearGradientsUI: <https://github.com/statisticalbiotechnology/NonlinearGradientsUI>
