# DDA/TMT Workflow

## Browser Workflow

1. Open `index.html`.
2. Load a search result CSV/TSV.
3. Keep `Max Q` at `0.01` for a 1% q-value filter, or change it to match the experiment.
4. Click `Fit RT` if the gradient start/end should be inferred from the filtered analyte RT range.
5. Enter the source LC gradient manually.
6. Set slope limits if the unconstrained gradient is too aggressive.
7. Click `Run`.
8. Export the gradient CSV.

## Command-Line Workflow

Use the same engine without the browser:

```powershell
& 'C:\Users\cmcga\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tools\optimize-dda.js `
  --input examples\cmcgann_1782347682.csv `
  --output-dir output\dda_real_example `
  --start-time 0 `
  --end-time 90 `
  --start-b 2 `
  --end-b 40 `
  --max-q 0.01 `
  --density-bins 30
```

Useful slope-constrained variant:

```powershell
& 'C:\Users\cmcga\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tools\optimize-dda.js `
  --input examples\cmcgann_1782347682.csv `
  --output-dir output\dda_real_example_maxslope1 `
  --start-time 0 `
  --end-time 90 `
  --start-b 2 `
  --end-b 40 `
  --max-q 0.01 `
  --density-bins 30 `
  --max-slope 1.0
```

Outputs:

- `dda_optimized_gradient.csv`
- `dda_pressure_bins.csv`
- `dda_summary.json`
- `dda_report.md`
- `dda_candidate_summary.csv` when no fixed `--max-slope` is supplied
- `dda_candidate_*_gradient.csv` candidate gradients when no fixed `--max-slope` is supplied

By default, the CLI runs a candidate suite and writes the best LC-realistic candidate to `dda_optimized_gradient.csv`. Candidate scoring rewards density flattening but prefers candidates that stay under the recommended slope target. Pass `--max-slope` to skip the suite and force a single fixed slope limit.

## Current Real Example

For `examples/cmcgann_1782347682.csv`:

- parsed rows: 31,228
- analytes with `LDA Q Value <= 0.01`: 12,733
- recognized columns include `Time`, `LDA Q Value`, `Obs m/z`, `z`, `Peptide`, `Gene Symbol`, `Sum Sn`, `Precursor Intensity`, `Isolation Specificity`, and `Peak Width`

Default candidate-suite run:

- output: `output/dda_real_example_suite`
- recommended candidate: `Balanced`
- density CV: `0.6033 -> 0.3366`
- slope range: `0.207 to 1.013 %B/min`

Candidate comparison:

| Candidate | Max slope limit | CV after | Improvement | Actual max slope | Feasible |
| --- | ---: | ---: | ---: | ---: | --- |
| Unconstrained | none | 0.0029 | 99.5% | 4.401 | no |
| Permissive | 1.368 | 0.2290 | 62.0% | 1.368 | no |
| Balanced | 1.013 | 0.3366 | 44.2% | 1.013 | yes |
| Gentle | 0.760 | 0.3848 | 36.2% | 0.760 | yes |

Earlier unconstrained candidate:

- output: `output/dda_real_example`
- density CV: `0.6033 -> 0.0029`
- slope range: `0.207 to 4.401 %B/min`

Slope-capped candidate:

- output: `output/dda_real_example_maxslope1`
- max slope: `1.0 %B/min`
- density CV: `0.6033 -> 0.3373`
- slope range: `0.207 to 1.000 %B/min`

The slope-capped candidate is a better first wet-lab test candidate because the unconstrained method starts with a steep early ramp.
