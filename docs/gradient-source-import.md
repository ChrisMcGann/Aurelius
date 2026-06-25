# Gradient Source Import

The app currently asks the user to enter the source gradient manually. The planned feature is to read the source gradient from acquisition metadata and use it as the linear/reference gradient for optimization.

For MS1-style optimization, there are two related but different readers:

- source-gradient reader: what the LC method intended to run
- MS1-feature reader: what abundant ions actually did in the raw data

The `.raw` file is especially valuable for the second job.

## Priority

1. `.meth` or method-export files
   - Best first target if the file exposes LC waypoints directly.
   - Expected output is the intended LC method: analytical ramp, wash, hold, and equilibration segments.
   - Parser should preserve every waypoint and mark which segment is analytical.
   - Thermo's `thermofisherlsms/meth-modifications` project is MIT-licensed and useful for XML-based method modifications, especially MS scan-node/filter edits. See `docs/thermo-meth-modifications.md`. It should be evaluated for method export/summary and for writing or modifying method templates, but it does not by itself prove that LC gradient waypoints can be extracted from an arbitrary binary `.meth` file.

2. `.raw` files
   - Useful when the method file is missing.
   - Thermo RAW support will likely need a local helper backed by Thermo RawFileReader or ThermoRawFileParser.
   - RAW metadata should be used for source-gradient extraction only when the method table is actually present; scan timing alone is not enough to reconstruct the LC gradient confidently.

3. Manual or pasted gradient table
   - Always available as a fallback.

## Reader Output

Readers should emit the normalized `Source Gradient` object described in `docs/data-schema.md`.

Minimum usable output:

- source path
- source type
- ordered method-time / percent-B waypoints
- guessed analytical-gradient start and end
- warnings for ambiguous segments

## MS1 Feature Extraction

For DDA/TMT MS1-style optimization, the useful raw-derived object is the normalized `MS1 Feature` table described in `docs/data-schema.md`.

Implementation path:

1. Support feature tables first, because outputs from tools such as Dinosaur, Hardklor/Kronik-style workflows, or vendor exports can be parsed without vendor SDKs.
2. Add mzML support next, likely through a local helper rather than the browser, because real files are large and feature detection is compute-heavy.
3. Add Thermo `.raw` support through a local command backed by ThermoRawFileParser or Thermo RawFileReader.
4. Cache extracted feature tables beside the project so repeated optimization does not reread large RAW files.

Minimum feature filters:

- inside analytical gradient interval
- above intensity threshold
- persisted across enough MS1 scans
- acceptable charge state and m/z range
- optional peak-shape quality threshold

## Open Questions For First Real File

- Which vendor and LC software generated the `.meth` file?
- Is the analytical ramp stored in the `.meth`, the `.raw`, or a separate LC method export?
- Are blanks/washes/equilibration stored in the same method?
- Does the raw file use MS acquisition time starting at injection, valve switch, or contact closure?
- Do we have an existing MS1 feature table, or should Aurelius extract features directly from RAW/mzML?
