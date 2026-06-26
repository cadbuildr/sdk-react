# @cadbuildr/sdk-react

React SDK for embedding CADbuildr-authored configurators on partner storefronts.

The SDK ships:

- `CadbuildrProvider` — context provider that wires a kernel-api session token,
  project id, and `KernelApiClient`.
- `CadbuildrViewer` — a `<Canvas>` component (React Three Fiber) that consumes a
  DAG and renders the resulting STL mesh. Pass `showTree` to overlay an assembly
  tree with per-node show/hide toggles, and `defaultHiddenNodeNames` to start
  with whole sub-assemblies hidden (e.g. `["components"]` to show a bare PCB).
- `CadbuildrPartsTree` — the standalone assembly tree (show/hide per node), if
  you want to place it outside the viewer. Helpers `buildPartsTree`,
  `isInstanceVisible`, etc. are exported for custom scenes.
- `CadbuildrParameterForm` — a generic parameter UI driven by the project's
  `parameter_ui` schema.
- `useCadbuildrRender(dag)` hook — manual control for partners that want to
  drive their own rendering.

It builds on top of [`@cadbuildr/cad-kernel-r3f`](https://github.com/cadbuildr/cad-kernel-r3f)
(STL rendering) and the hosted CADbuildr kernel-api at
`https://kernel-api.cadbuildr.com` (or your own deployment).

## Install

```sh
npm install @cadbuildr/sdk-react @cadbuildr/cad-kernel-r3f @react-three/fiber @react-three/drei three react react-dom
```

## Quick start

```tsx
import { CadbuildrProvider, CadbuildrViewer } from "@cadbuildr/sdk-react";

export function App() {
  return (
    <CadbuildrProvider
      baseUrl="https://kernel-api.cadbuildr.com"
      sessionToken={import.meta.env.VITE_CADBUILDR_SESSION_TOKEN}
      projectKey="my-project"
    >
      <CadbuildrViewer dag={myDag} />
    </CadbuildrProvider>
  );
}
```

Session tokens are short-lived `cbv1.*` JWTs minted by the CADbuildr hub from
a partner SDK key (`cbsdk_*`). See the hub's `/api/v1/sdk/session-tokens`
endpoint and the `Settings → SDK partner keys` admin UI.

## License

MIT
