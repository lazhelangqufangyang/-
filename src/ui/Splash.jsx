import { useEffect, useRef, useState } from 'react';
import '../splash.css';

const W = 1792;
const H = 1024;

/** 头盔和羽饰：从羽冠顶到护颊下沿，尾巴往右扫到肩甲上缘 */
const HEAD = [[370, 135], [372, 95], [382, 62], [400, 40], [440, 24], [500, 24], [540, 48], [572, 92], [590, 140], [622, 196], [648, 260], [660, 310], [648, 330], [610, 326], [575, 318], [535, 320], [495, 322], [458, 326], [430, 315], [404, 300], [386, 255], [376, 200]];
/**
 * 披风：内缘贴着肩甲、护腕和手的右侧走（宁可留一条静止的窄边，也不能把盔甲切进披风里），
 * 外缘和上下缘放宽到整块画布，多出来的都是透明像素，不影响观感。
 */
const CAPE = [[620, 300], [682, 335], [700, 372], [700, 420], [695, 500], [700, 565], [680, 615], [660, 660], [716, 700], [722, 750], [748, 810], [790, 865], [850, 915], [925, 960], [1010, 1000], [1100, 1015], [1250, 1020], [1450, 1000], [1620, 955], [1792, 920], [1792, 300], [1740, 285], [1650, 268], [1550, 252], [1440, 248], [1330, 232], [1220, 238], [1110, 222], [1000, 232], [900, 250], [810, 270], [730, 280], [678, 286]];

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
            const body = cut(img, [[[HEAD], 0.9], [[CAPE], 1]], 'destination-out');
            const bg = body.getContext('2d');
            bg.globalCompositeOperation = 'destination-over';
            bg.drawImage(cut(img, [[[CAPE], 1]], 'destination-in'), 0, 0);
            const layers = [
                [body, 'sp-body'],
                [cut(img, [[[CAPE], 1.03]], 'destination-in'), 'sp-cape'],
                [cut(img, [[[HEAD], 1.1]], 'destination-in'), 'sp-head']
            ];
            for (const [c, cls] of layers) {
                c.className = cls;
                host.current.appendChild(c);
            }
        };
        img.src = '/splash/spartan.png';
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
        <div className="sp-figure" ref={host}>
          <div className="sp-eyes" aria-hidden="true" />
        </div>
        <blockquote className="sp-quote">
          <p className="sp-quote-greek">ΚΑΡΤΕΡΙΑ</p>
          <p className="sp-quote-cn">汗水铸就锋芒</p>
          <p className="sp-quote-src">斯巴达法则 · 铸就强者之躯</p>
        </blockquote>
        <svg className="sp-defs" aria-hidden="true" focusable="false">
          <defs>
            <filter id="sp-water" x="-20%" y="-20%" width="140%" height="140%">
              <feTurbulence type="fractalNoise" baseFrequency="0.009 0.021" numOctaves="2" seed="7" result="n">
                {!reduced && <animate attributeName="baseFrequency" dur="9s" values="0.009 0.021;0.014 0.031;0.009 0.021" repeatCount="indefinite" />}
              </feTurbulence>
              <feDisplacementMap in="SourceGraphic" in2="n" scale="12" xChannelSelector="R" yChannelSelector="G">
                {!reduced && <animate attributeName="scale" dur="7s" values="8;26;8" repeatCount="indefinite" />}
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