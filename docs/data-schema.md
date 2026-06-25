# Data Schema

## Normalized Analyte

Every imported table is normalized into an analyte record.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | Stable row identifier. |
| `sequence` | string | no | Peptide sequence when present. |
| `modified_sequence` | string | no | Modified peptide string. |
| `charge` | number | no | Precursor charge. |
| `mz` | number | no | Precursor m/z. |
| `rt` | number | yes | Raw/MS retention time in minutes. |
| `intensity` | number | no | Peak area, height, or precursor intensity. |
| `q_value` | number | no | q-value, FDR, PEP, or similar confidence field. |
| `tmt_snr` | number | no | TMT reporter quality field. |
| `priority` | number | no | User-defined priority for proteins, peptides, or targets. |
| `isolation_specificity` | number | no | Precursor isolation specificity or purity. |
| `peak_width` | number | no | Peak width from search/feature output. |
| `injection_time` | number | no | Ion injection time when available. |
| `scan_count` | number | no | MS1 feature persistence when available. |
| `quality` | number | no | Feature fit/detection quality when available. |
| `protein` | string | no | Protein or gene grouping. |
| `weight` | number | yes | Computed optimizer weight. |
| `source_row` | object | yes | Original imported values. |

## MS1 Feature

MS1-style optimization can use detected features even when no peptide identity is assigned.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | Stable feature identifier. |
| `mz` | number | yes | Monoisotopic or feature m/z. |
| `charge` | number/null | no | Charge state when detected. |
| `rt_apex` | number | yes | Feature apex retention time in raw/MS minutes. |
| `rt_start` | number/null | no | Feature start RT. |
| `rt_end` | number/null | no | Feature end RT. |
| `intensity` | number | yes | Peak height, area, or integrated abundance. |
| `scan_count` | number/null | no | Persistence across MS1 scans. |
| `peak_width` | number/null | no | FWHM or comparable width estimate. |
| `quality` | number/null | no | Optional fit or detection quality score. |
| `weight` | number | yes | Computed optimizer weight. |
| `source_file` | string | no | RAW, mzML, or feature table path. |

## Recognized Input Columns

The parser is permissive and maps common variants:

- RT: `rt`, `retention_time`, `retention time`, `apex_rt`, `rt_apex`, `apex_rt_min`, `feature_apex_rt`, `raw_rt`, `ms_rt`, `best_rt`, `time`
- Sequence: `sequence`, `peptide`, `stripped_sequence`, `modified_sequence`, `trimmed peptide`
- Intensity: `intensity`, `area`, `height`, `abundance`, `precursor_quantity`, `precursor intensity`, `feature_intensity`, `feature_area`, `apex_intensity`, `max_intensity`
- Confidence: `q_value`, `q-value`, `qvalue`, `pep`, `fdr`, `lda q value`
- m/z: `mz`, `m/z`, `precursor_mz`, `obs m/z`, `isolation m/z`, `orig prec m/z`, `monoisotopic_mz`, `feature_mz`
- Charge: `charge`, `z`, `charge_state`, `feature_charge`
- TMT quality: `tmt_snr`, `reporter_snr`, `sn`, `sum_sn`
- Isolation quality: `isolation specificity`, `precursor purity`
- Peak width: `peak width`, `fwhm`
- Injection time: `ion injection time`, `injection_time`
- MS1 persistence: `scan_count`, `n_scans`, `num_scans`, `persistence`, `ms1_scans`
- Feature quality: `quality`, `score`, `feature_score`, `fit_score`, `r2`
- Priority: `priority`, `target_priority`, `rank_weight`
- Weight override: `weight`

## Gradient Configuration

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `startTime` | number | 10 | LC method gradient start time in minutes. |
| `endTime` | number | 130 | LC method gradient end time in minutes. |
| `startB` | number | 2 | Starting solvent B percentage. |
| `endB` | number | 40 | Ending solvent B percentage. |
| `lagTime` | number | 0 | `raw_time = method_time + lag_time`. |
| `stepSize` | number | 1 | Output waypoint spacing in minutes. |
| `minSlope` | number | 0 | Minimum `%B` per minute. |
| `maxSlope` | number/null | null | Optional maximum `%B` per minute. |

## Source Gradient

Future `.meth` / `.raw` readers should normalize imported method metadata into this shape before optimization.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `source_path` | string | yes | Original method or raw file path. |
| `source_type` | string | yes | Examples: `meth`, `raw`, `method_export`, `manual`. |
| `vendor` | string | no | Vendor or parser hint, for example Thermo or Dionex. |
| `instrument_method` | string | no | Method name when available. |
| `lag_time` | number/null | no | `raw_time = method_time + lag_time`; may remain user-supplied. |
| `waypoints` | array | yes | Ordered gradient points. |
| `warnings` | array | no | Ambiguities or unsupported sections. |

Waypoint fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `method_time_min` | number | yes | LC method time in minutes. |
| `percent_b` | number | yes | Solvent B percentage. |
| `raw_time_min` | number/null | no | Derived when lag is known. |
| `segment_type` | string | no | Analytical gradient, wash, hold, equilibration, or unknown. |

## Exported Gradient CSV

```csv
method_time_min,raw_time_min,percent_b
10.000,10.000,2.000
11.000,11.000,2.318
...
130.000,130.000,40.000
```
