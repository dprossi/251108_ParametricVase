# Parametric Vase Generator

Interactive WebGL tool (Three.js + Vite) for exploring vase silhouettes, tweaking wall thickness, and exporting meshes to STL or OBJ for downstream fabrication/printing.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Vite dev server with hot module replacement. |
| `npm run build` | Type-check with `tsc` and build production bundle. |
| `npm run preview` | Serve the production build locally. |

## Features

- Editable vase parameters: height, radii, profile bias, neck proportion, wall thickness, mesh resolution.
- Responsive Three.js scene with orbit controls, lighting, and live updates as you move sliders.
- STL / OBJ downloads powered by the official Three.js exporters.

## Next ideas

- Preset manager plus randomize button for quick explorations.
- Mesh simplification/tessellation controls prior to export.
- Optional pattern modulation (twists, waves) along the surface.