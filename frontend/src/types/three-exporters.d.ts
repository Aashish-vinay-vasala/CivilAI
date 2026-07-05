declare module "three/examples/jsm/exporters/GLTFExporter.js" {
  import type { Object3D } from "three";
  export class GLTFExporter {
    parse(
      input: Object3D,
      onDone: (result: ArrayBuffer | object) => void,
      onError: (error: unknown) => void,
      options?: Record<string, unknown>
    ): void;
  }
}

declare module "three/examples/jsm/exporters/OBJExporter.js" {
  import type { Object3D } from "three";
  export class OBJExporter {
    parse(object: Object3D): string;
  }
}
