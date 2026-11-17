import type { MotionOptions, MotionController } from "./motion-runtime";
export type MatchaPowderRevealOptions = MotionOptions & { progress?: number; playing?: boolean; autoTear?: boolean; loop?: boolean; speed?: number; onProgress?: (progress: number) => void };
export function mountMatchaPowderReveal(target: HTMLElement, options?: MatchaPowderRevealOptions): Omit<MotionController, "update"> & { update(options: MatchaPowderRevealOptions): void };
