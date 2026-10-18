# Third-Party Notices

This project incorporates the following third-party open-source software:

## SVGnest

- **Repository:** https://github.com/Jack000/SVGnest
- **Author:** Jack Qiao (2015)
- **License:** MIT — full text in [`THIRD_PARTY/SVGnest-LICENSE.txt`](THIRD_PARTY/SVGnest-LICENSE.txt)
- **Usage in this project:** The experimental irregular-shape (NFP) nesting engine
  (`src/workers/nfpWorker.ts` + `public/svgnest/geometryutil.js`) is derived from
  SVGnest's geometry core:
  - `util/geometryutil.js` — No-Fit Polygon computation, polygon geometry utilities
    (copied verbatim to `public/svgnest/geometryutil.js`, header preserved in
    `THIRD_PARTY/geometryutil.js.LICENSE-HEADER.txt`).
  - `util/placementworker.js` — greedy placement logic (adapted, MIT).
  - `svgnest.js` — NFP orchestration / Minkowski difference / Clipper offsetting
    (adapted, MIT).

  The genetic-algorithm (GA) orchestration of SVGnest is **not** used; this project
  runs a time-budgeted greedy multi-restart placement loop instead.

## Clipper (jsClipper)

- **Bundled within:** `public/svgnest/clipper.js` (part of the SVGnest distribution)
- **Author:** Angus Johnson
- **License:** Boost Software License 1.0 — see header of `clipper.js`

---

Copyright (c) 2015 Jack Qiao — MIT License.
Portions Copyright (c) 2010-2014 Angus Johnson — Boost Software License 1.0.
