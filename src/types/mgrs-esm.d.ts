declare module "mgrs/dist/mgrs.esm.js" {
  export function forward(ll: [number, number], accuracy?: number): string;
  export function inverse(mgrs: string): [number, number, number, number];
  export function toPoint(mgrs: string): [number, number];
}
