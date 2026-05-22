"use client";

import React from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

import type { KernelDag } from "@cadbuildr/cad-kernel-r3f";

import type { ParameterValueMap } from "./CadbuildrParameterForm";
import { MeshGroup } from "./MeshGroup";
import { substituteParameterInputs } from "./parameterSubstitution";
import { useCadbuildrRender, type RenderStatus } from "./useCadbuildrRender";

const DEFAULT_BG = "#0e131c";
const DEFAULT_HEMI_GROUND = "#2a2110";
const DEFAULT_GRID_MAJOR = "#3a4252";
const DEFAULT_GRID_MINOR = "#272d39";
const DEFAULT_SCENE_POSITION: [number, number, number] = [0, 0, 0];
const DEFAULT_CAD_Z_UP_TO_Y_UP: [number, number, number] = [-Math.PI / 2, 0, 0];

export interface CadbuildrViewerProps {
  /** Pre-built DAG to render. Mutually exclusive with `dagTemplate`. */
  dag?: KernelDag | null;
  /**
   * Frozen DAG template with `{ __cadbuildr_param__: "<id>" }` markers in
   * place of partner-tunable primitive values. Substituted at render time
   * using `parameters` so the browser never has to load Pyodide.
   */
  dagTemplate?: KernelDag | null;
  /** Parameter values applied to `dagTemplate`. Ignored when `dag` is set. */
  parameters?: ParameterValueMap;
  /** Three.js camera position (default `[220, 140, 220]`). */
  cameraPosition?: [number, number, number];
  /** Field of view in degrees (default `42`). */
  fov?: number;
  /** Scene background color (default dark blue-grey). */
  background?: string;
  /** Show grid + axes helpers (default `true`). */
  showHelpers?: boolean;
  /** Notified when a render finishes successfully. */
  onRender?: (meta: { status: RenderStatus; requestId: string | undefined }) => void;
  /** Notified on render errors. */
  onError?: (error: Error) => void;
  /** Override the inner mesh group's position. */
  meshPosition?: [number, number, number];
  /** Override the inner mesh group's rotation (default rotates CAD Z-up to scene Y-up). */
  meshRotation?: [number, number, number];
}

export function CadbuildrViewer({
  dag,
  dagTemplate,
  parameters,
  cameraPosition = [220, 140, 220],
  fov = 42,
  background = DEFAULT_BG,
  showHelpers = true,
  onRender,
  onError,
  meshPosition = DEFAULT_SCENE_POSITION,
  meshRotation = DEFAULT_CAD_Z_UP_TO_Y_UP,
}: CadbuildrViewerProps): React.ReactElement {
  const resolvedDag = React.useMemo<KernelDag | null>(() => {
    if (dag) return dag;
    if (dagTemplate && parameters) {
      return substituteParameterInputs(dagTemplate, parameters);
    }
    return null;
  }, [dag, dagTemplate, parameters]);

  const { meshPayload, status, error, requestId } = useCadbuildrRender({ dag: resolvedDag });

  const onRenderRef = React.useRef(onRender);
  const onErrorRef = React.useRef(onError);
  onRenderRef.current = onRender;
  onErrorRef.current = onError;

  React.useEffect(() => {
    if (status === "ready") onRenderRef.current?.({ status, requestId });
  }, [status, requestId]);

  React.useEffect(() => {
    if (status === "error" && error) onErrorRef.current?.(error);
  }, [status, error]);

  return (
    <Canvas camera={{ position: cameraPosition, fov }}>
      <color attach="background" args={[background]} />
      <ambientLight intensity={0.85} />
      <hemisphereLight intensity={0.32} color="#f4e8dc" groundColor={DEFAULT_HEMI_GROUND} />
      <directionalLight intensity={1.05} position={[20, 40, 25]} color="#fff5eb" />
      {showHelpers && (
        <>
          <gridHelper args={[320, 32, DEFAULT_GRID_MAJOR, DEFAULT_GRID_MINOR]} position={meshPosition} />
          <axesHelper args={[25]} position={meshPosition} />
        </>
      )}
      {meshPayload && (
        <MeshGroup meshPayload={meshPayload} position={meshPosition} rotation={meshRotation} />
      )}
      <OrbitControls makeDefault target={meshPosition} />
    </Canvas>
  );
}
