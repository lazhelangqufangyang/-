"use client";
import { useEffect, useMemo, useRef } from "react";
import { mountMatchaPowderReveal, type MatchaPowderRevealOptions } from "./MatchaPowderRevealEngine.js";
import type { MotionController } from "./motion-runtime";

type RevealProps = {
    options?: MatchaPowderRevealOptions;
    className?: string;
    minimal?: boolean;
    /** 3D 画布高度，透传给底层 surface */
    height?: number;
    /** 撕开进度 0 → 1；手动撕到 100% 时一定会收到 1 */
    onProgress?: (progress: number) => void;
};

export function MatchaPowderReveal({ options, className, minimal = false, height, onProgress }: RevealProps) {
    const host = useRef<HTMLDivElement>(null);
    const controller = useRef<MotionController | null>(null);
    const merged = useMemo(() => ({
        ...(options ?? {}),
        ...(height !== undefined ? { height } : {}),
        ...(onProgress ? { onProgress } : {})
    }), [options, height, onProgress]);
    const latest = useRef(merged);
    latest.current = merged;
    useEffect(() => {
        const instance = mountMatchaPowderReveal(host.current!, latest.current);
        controller.current = instance;
        if (minimal) {
            // 嵌在全屏提示层里时去掉浅色演示底、字幕和演示控件，只留下可拖拽的包装与粉末。
            const scene = instance.root.querySelector(".mp-scene") as HTMLElement | null;
            const caption = instance.root.querySelector(".mp-caption") as HTMLElement | null;
            const controls = instance.root.querySelector(".mp-controls") as HTMLElement | null;
            if (scene) scene.style.background = "transparent";
            if (caption) caption.style.display = "none";
            if (controls) controls.style.display = "none";
        }
        return () => { instance.destroy(); controller.current = null; };
        // Options are updated below without remounting the state machine.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => { controller.current?.update(latest.current); }, [merged]);
    return <div ref={host} className={className} data-motion-component="matcha-powder-reveal" />;
}
