import { useEffect, useRef, useState } from 'react';
import '../splash.css';

const W = 1792;
const H = 984;

const HEAD = [[400, 10], [560, 10], [620, 60], [610, 160], [560, 265], [480, 270], [420, 250], [400, 160], [394, 80]];
const ARM = [[556, 295], [660, 330], [700, 420], [690, 520], [640, 660], [575, 690], [556, 600], [566, 470], [548, 380]];
const CAPE = [[620, 240], [760, 255], [1000, 215], [1400, 175], [1792, 195], [1792, 984], [1200, 984], [900, 900], [760, 760], [680, 600], [640, 420], [600, 300]];

function scaled(poly, s) {
    const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length;
    const cy = poly.reduce((a, p) => a + p[1], 0) / poly.length;
    return poly.map(([x, y]) => [cx + (x - cx) * s, cy + (y - cy) * s]);
}
function cut(img, groups, mode) {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = mode;
    g.beginPath();
    for (const [polys, s] of groups) {
        for (const poly of polys) {
            const pts = scaled(poly, s);
            g.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
            g.closePath();
        }
    }
    g.fill();
    return c;
}

export default function Splash({ onEnter }) {
    const host = useRef(null);
    const timer = useRef(0);
    const [leaving, setLeaving] = useState(false);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    useEffect(() => {
        const img = new Image();
        let dead = false;
        img.onload = () => {
            if (dead || !host.current) return;
            const body = cut(img, [[[HEAD, ARM], 0.9], [[CAPE], 1]], 'destination-out');
            const bg = body.getContext('2d');
            bg.globalCompositeOperation = 'destination-over';
            bg.drawImage(cut(img, [[[CAPE], 1]], 'destination-in'), 0, 0);
            const layers = [
                [body, 'sp-body'],
                [cut(img, [[[CAPE], 1.03]], 'destination-in'), 'sp-cape'],
                [cut(img, [[[ARM], 1.1]], 'destination-in'), 'sp-arm'],
                [cut(img, [[[HEAD], 1.1]], 'destination-in'), 'sp-head']
            ];
            for (const [c, cls] of layers) {
                c.className = cls;
                host.current.appendChild(c);
            }
        };
        img.src = '/splash/silver.png';
        return () => {
            dead = true;
            clearTimeout(timer.current);
            if (host.current) host.current.querySelectorAll('canvas').forEach((c) => c.remove());
        };
    }, []);

    const enter = () => {
        if (leaving) return;
        setLeaving(true);
        timer.current = setTimeout(onEnter, reduced ? 0 : 650);
    };
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Enter') enter();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    return (<div className={'splash' + (leaving ? ' leaving' : '')}>
      <div className="sp-stage">
        <div className="sp-bg"><img src="/splash/storm.jpg" alt="" /></div>
        <div className="sp-clouds" aria-hidden="true">
          <div className="sp-clouds-track"><img src="/splash/clouds.jpg" alt="" /><img src="/splash/clouds.jpg" alt="" /><img src="/splash/clouds.jpg" alt="" /><img src="/splash/clouds.jpg" alt="" /></div>
        </div>
        <div className="sp-scrim" />
        <div className="sp-ground" />
        <div className="sp-shadow" />
        <div className="sp-helm" aria-hidden="true">
          <img src="/splash/helmet.jpg" alt="" />
        </div>
        <div className="sp-helm-shadow" aria-hidden="true" />
        <div className="sp-figure" ref={host} />
        <svg className="sp-defs" aria-hidden="true" focusable="false">
          <defs>
            <filter id="sp-water" x="-20%" y="-20%" width="140%" height="140%">
              <feTurbulence type="fractalNoise" baseFrequency="0.012 0.028" numOctaves="2" seed="7" result="n">
                {!reduced && <animate attributeName="baseFrequency" dur="9s" values="0.012 0.028;0.017 0.036;0.012 0.028" repeatCount="indefinite" />}
              </feTurbulence>
              <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G">
                {!reduced && <animate attributeName="scale" dur="6s" values="3;7;3" repeatCount="indefinite" />}
              </feDisplacementMap>
            </filter>
          </defs>
        </svg>
        <header className="sp-copy">
          <p className="sp-eyebrow">LIAN · FITPLAN</p>
          <h1 className="sp-title">只有你能<br />让自己停下来</h1>
        </header>
        <button className="sp-enter" onClick={enter}>开始训练<span aria-hidden="true">↗</span></button>
      </div>
    </div>);
}