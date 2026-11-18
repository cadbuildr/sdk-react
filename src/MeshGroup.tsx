"use client";

import React from "react";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";

import {
  getOrCreateMeshGeometryByHash,
  type KernelJsonMeshFaces,
} from "@cadbuildr/cad-kernel-r3f";

import { isInstanceVisible } from "./partsTree";
import type { SerializedMeshPayload } from "./useCadbuildrRender";

/** Opacity of every part in x-ray mode — low enough to see interior joinery. */
const XRAY_OPACITY = 0.28;

function rgbCss(rgb: [number, number, number] | undefined): string {
  if (!rgb) return "#a8b0c0";
  const [r, g, b] = rgb;
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

export interface MeshGroupProps {
  meshPayload: SerializedMeshPayload;
  position?: [number, number, number];
  rotation?: [number, number, number];
  /** Assembly-tree node ids to hide. Instances under a hidden node are culled. */
  hidden?: ReadonlySet<string>;
  /** Render every part semi-transparent so interior geometry stays visible. */
  xray?: boolean;
}

/**
 * Renders a kernel-api JSON mesh payload as a R3F scene fragment. Honors
 * per-instance colors and reuses geometries by content hash.
 */
export function MeshGroup({
  meshPayload,
  position = [0, 0, 0],
  rotation = [-Math.PI / 2, 0, 0],
  hidden,
  xray = false,
}: MeshGroupProps): React.ReactElement | null {
  const items = React.useMemo(() => {
    const out: Array<{
      key: string;
      geometry: ReturnType<typeof getOrCreateMeshGeometryByHash>;
      color: [number, number, number] | undefined;
      matrix: Matrix4;
    }> = [];
    if (meshPayload.partInstances?.length) {
      meshPayload.partInstances.forEach((instance, index) => {
        const entry = meshPayload.store[instance.hash];
        if (!entry || entry.type !== "mesh") return;
        if (hidden && hidden.size > 0 && !isInstanceVisible(instance.path, hidden)) return;
        out.push({
          // The kernel id is unique per instance; hash+transform is not when two
          // instances coincide, so older payloads fall back to the index too.
          key: instance.id ?? `${instance.hash}:${instance.tf.join(",")}:${index}`,
          geometry: getOrCreateMeshGeometryByHash(
            instance.hash,
            entry.data.faces as KernelJsonMeshFaces,
          ),
          color: instance.color ?? entry.data.color,
          matrix: new Matrix4().fromArray(instance.tf),
        });
      });
      return out;
    }
    const store = meshPayload.store ?? {};
    for (const hash of Object.keys(store)) {
      const entry = store[hash];
      if (!entry || entry.type !== "mesh" || !entry.data?.faces) continue;
      out.push({
        key: `${hash}:store-only`,
        geometry: getOrCreateMeshGeometryByHash(
          hash,
          entry.data.faces as KernelJsonMeshFaces,
        ),
        color: entry.data.color,
        matrix: new Matrix4().identity(),
      });
    }
    return out;
  }, [meshPayload, hidden]);

  const cadToScene = React.useMemo(() => {
    const euler = new Euler(rotation[0], rotation[1], rotation[2], "XYZ");
    const quat = new Quaternion().setFromEuler(euler);
    return new Matrix4().compose(
      new Vector3(position[0], position[1], position[2]),
      quat,
      new Vector3(1, 1, 1),
    );
  }, [position, rotation]);

  if (items.length === 0) return null;

  return (
    <>
      {items.map((item) => {
        const worldMatrix = cadToScene.clone().multiply(item.matrix);
        return (
          <group key={item.key} matrix={worldMatrix} matrixAutoUpdate={false}>
            <mesh geometry={item.geometry}>
              <meshStandardMaterial
                color={rgbCss(item.color)}
                metalness={0.1}
                roughness={0.45}
                transparent={xray}
                opacity={xray ? XRAY_OPACITY : 1}
                depthWrite={!xray}
              />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
