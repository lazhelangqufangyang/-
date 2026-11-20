import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { analyzeFrames, lossVerdict, postureAngles, POSE, SKELETON, wristMid } from '../engine/vbt.js';
import { checkForm } from '../engine/formCheck.js';
import { velocityLossFor } from '../engine/formEvidence.js';
import './posture.css';

const VIS = 0.35;

function fmt(value, digits = 2, unit = '') {
    if (value === null || value === undefined || Number.isNaN(value))
        return '—';
    return `${value.toFixed(digits).replace(/\.0+$/, '')}${unit}`;
}

/**
 * 全屏摄像头动作检查：MediaPipe Pose 在本机提关键点，实时画骨架；
 * 结束后给出次数、速度、髋/膝/躯干角度和具体调整建议。画面不外传、不保存。
 */
export default function PostureCheck({ exercise, heightCm, goal, onClose }) {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const stageRef = useRef(null);
    const poseRef = useRef(null);
    const streamRef = useRef(null);
    const wakeRef = useRef(null);
    const rafRef = useRef(0);
    const runningRef = useRef(false);
    const startTsRef = useRef(0);
    const framesRef = useRef([]);
    const trailRef = useRef([]);
    const lastAnalyzeRef = useRef(0);
    const heightRef = useRef(heightCm ? String(heightCm) : '175');

    const [status, setStatus] = useState('idle');
    const [error, setError] = useState('');
    const [height, setHeight] = useState(heightRef.current);
    const [live, setLive] = useState(null);
    const [result, setResult] = useState(null);
    const [basisOpen, setBasisOpen] = useState(false);

    useEffect(() => {
        heightRef.current = height;
    }, [height]);

    const requestWake = useCallback(async () => {
        if (!('wakeLock' in navigator))
            return;
        try {
            wakeRef.current = await navigator.wakeLock.request('screen');
        }
        catch {
            // 不支持或系统拒绝时忽略，不影响检测
        }
    }, []);

    const releaseWake = useCallback(() => {
        if (wakeRef.current) {
            wakeRef.current.release?.().catch(() => {});
            wakeRef.current = null;
        }
    }, []);

    const teardown = useCallback(async () => {
        runningRef.current = false;
        cancelAnimationFrame(rafRef.current);
        releaseWake();
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        const pose = poseRef.current;
        poseRef.current = null;
        if (pose) {
            try {
                await pose.close();
            }
            catch {
                // 关闭失败不影响页面
            }
        }
    }, [releaseWake]);

    const close = useCallback(async () => {
        if (closingRef.current)
            return;
        closingRef.current = true;
        await teardown();
        if (document.fullscreenElement) {
            try {
                await document.exitFullscreen();
            }
            catch {
                // 已经退出或浏览器不支持
            }
        }
        if (historyPushedRef.current) {
            historyPushedRef.current = false;
            history.back();
        }
        onClose();
    }, [onClose, teardown]);

    const closeRef = useRef(close);
    useEffect(() => {
        closeRef.current = close;
    }, [close]);

    // StrictMode 会模拟一次卸载重挂：这里用 ref 保证历史只压一次、清理时不乱弹
    const historyPushedRef = useRef(false);
    const closingRef = useRef(false);

    // 全屏时锁住页面滚动；Android 返回键先关相机，而不是退出应用
    useEffect(() => {
        document.body.classList.add('posture-lock');
        const onPop = () => {
            historyPushedRef.current = false;
            void closeRef.current();
        };
        window.addEventListener('popstate', onPop);
        if (!historyPushedRef.current) {
            history.pushState({ ...history.state, posture: true }, '');
            historyPushedRef.current = true;
        }
        return () => {
            document.body.classList.remove('posture-lock');
            window.removeEventListener('popstate', onPop);
        };
    }, []);

    useEffect(() => () => {
        void teardown();
    }, [teardown]);

    // 切到后台时系统会自动释放 wake lock，回来时重新申请
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === 'visible' && runningRef.current)
                void requestWake();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [requestWake]);

    const draw = useCallback((landmarks, width, heightPx) => {
        const canvas = canvasRef.current;
        if (!canvas)
            return;
        if (canvas.width !== width || canvas.height !== heightPx) {
            canvas.width = width;
            canvas.height = heightPx;
        }
        // 视频是 contain：把画布摆到视频实际显示的那块矩形上，骨架才不会错位
        const stage = stageRef.current;
        if (stage && width && heightPx) {
            const rect = stage.getBoundingClientRect();
            const scale = Math.min(rect.width / width, rect.height / heightPx);
            const w = width * scale;
            const h = heightPx * scale;
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            canvas.style.left = `${(rect.width - w) / 2}px`;
            canvas.style.top = `${(rect.height - h) / 2}px`;
        }
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, width, heightPx);
        if (landmarks) {
            ctx.lineWidth = Math.max(2, width / 320);
            ctx.strokeStyle = 'rgba(232,72,92,.9)';
            ctx.beginPath();
            for (const [a, b] of SKELETON) {
                const pa = landmarks[a];
                const pb = landmarks[b];
                if (!pa || !pb || (pa.visibility ?? 1) < VIS || (pb.visibility ?? 1) < VIS)
                    continue;
                ctx.moveTo(pa.x * width, pa.y * heightPx);
                ctx.lineTo(pb.x * width, pb.y * heightPx);
            }
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,.95)';
            for (const index of [11, 12, 23, 24, 25, 26, 27, 28, 15, 16]) {
                const point = landmarks[index];
                if (!point || (point.visibility ?? 1) < VIS)
                    continue;
                ctx.beginPath();
                ctx.arc(point.x * width, point.y * heightPx, Math.max(3, width / 220), 0, Math.PI * 2);
                ctx.fill();
            }
        }
        const trail = trailRef.current;
        if (trail.length > 1) {
            ctx.lineWidth = Math.max(2, width / 260);
            ctx.strokeStyle = 'rgba(64,214,160,.95)';
            ctx.beginPath();
            trail.forEach((point, index) => {
                if (index === 0)
                    ctx.moveTo(point.x, point.y);
                else
                    ctx.lineTo(point.x, point.y);
            });
            ctx.stroke();
            const head = trail[trail.length - 1];
            ctx.fillStyle = 'rgba(64,214,160,1)';
            ctx.beginPath();
            ctx.arc(head.x, head.y, Math.max(4, width / 180), 0, Math.PI * 2);
            ctx.fill();
        }
    }, []);

    const onResults = useCallback((results) => {
        const video = videoRef.current;
        if (!video)
            return;
        const width = video.videoWidth || 1280;
        const heightPx = video.videoHeight || 720;
        const landmarks = results.poseLandmarks ?? null;
        draw(landmarks, width, heightPx);
        if (!landmarks)
            return;
        const wrist = wristMid(landmarks);
        if (!wrist)
            return;
        const nose = landmarks[POSE.NOSE];
        const lAnkle = landmarks[POSE.L_ANKLE];
        const rAnkle = landmarks[POSE.R_ANKLE];
        const ankleVisible = lAnkle && rAnkle && (lAnkle.visibility ?? 1) >= VIS && (rAnkle.visibility ?? 1) >= VIS;
        const angles = postureAngles(landmarks);
        const t = performance.now() - startTsRef.current;
        framesRef.current.push({
            t,
            y: wrist.y * heightPx,
            x: wrist.x * width,
            videoH: heightPx,
            noseY: nose && (nose.visibility ?? 1) >= VIS ? nose.y * heightPx : null,
            ankleY: ankleVisible ? ((lAnkle.y + rAnkle.y) / 2) * heightPx : null,
            hip: angles.hip,
            knee: angles.knee,
            torso: angles.torso,
            kneeL: angles.kneeL,
            kneeR: angles.kneeR,
            wristLY: landmarks[POSE.L_WRIST] && (landmarks[POSE.L_WRIST].visibility ?? 1) >= VIS
                ? landmarks[POSE.L_WRIST].y * heightPx : null,
            wristRY: landmarks[POSE.R_WRIST] && (landmarks[POSE.R_WRIST].visibility ?? 1) >= VIS
                ? landmarks[POSE.R_WRIST].y * heightPx : null
        });
        if (framesRef.current.length > 2000)
            framesRef.current.shift();
        trailRef.current.push({ x: wrist.x * width, y: wrist.y * heightPx });
        if (trailRef.current.length > 180)
            trailRef.current.shift();
        if (t - lastAnalyzeRef.current > 250) {
            lastAnalyzeRef.current = t;
            setLive(analyzeFrames(framesRef.current, { heightCm: Number(heightRef.current) }));
        }
    }, [draw]);

    const loop = useCallback(async () => {
        if (!runningRef.current)
            return;
        const video = videoRef.current;
        const pose = poseRef.current;
        if (video && pose && video.readyState >= 2) {
            try {
                await pose.send({ image: video });
            }
            catch {
                // 单帧失败继续跑
            }
        }
        if (runningRef.current)
            rafRef.current = requestAnimationFrame(loop);
    }, []);

    const start = useCallback(async () => {
        setError('');
        setResult(null);
        setLive(null);
        setBasisOpen(false);
        framesRef.current = [];
        trailRef.current = [];
        if (!navigator.mediaDevices?.getUserMedia) {
            setError('当前浏览器拿不到摄像头：请用 HTTPS 或 localhost 打开，并允许摄像头权限。');
            return;
        }
        // 在用户点击的同一手势里申请全屏，浏览器才会放行
        try {
            if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
                await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
            }
        }
        catch {
            // 主屏 PWA 里本来就是全屏
        }
        void requestWake();
        setStatus('starting');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            streamRef.current = stream;
            const video = videoRef.current;
            video.srcObject = stream;
            await video.play();
            if (!poseRef.current) {
                // pose.js 是无 ESM 导出的 IIFE，执行时把 Pose 挂到全局；打包器给不到具名导出
                const module = await import('@mediapipe/pose');
                const Pose = [globalThis.Pose, module.Pose, module.default?.Pose, module.default]
                    .find((item) => typeof item === 'function');
                if (!Pose)
                    throw new Error('MediaPipe Pose 没能载入，请刷新页面重试');
                const pose = new Pose({ locateFile: (file) => `/mediapipe/${file}` });
                pose.setOptions({
                    modelComplexity: 0,
                    smoothLandmarks: true,
                    enableSegmentation: false,
                    minDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
                pose.onResults(onResults);
                poseRef.current = pose;
            }
            startTsRef.current = performance.now();
            runningRef.current = true;
            setStatus('running');
            loop();
        }
        catch (err) {
            await teardown();
            setStatus('idle');
            setError(err?.name === 'NotAllowedError'
                ? '摄像头权限被拒绝：到浏览器地址栏的权限设置里允许摄像头，再点一次开始。'
                : `摄像头启动失败：${err?.message ?? err}`);
        }
    }, [loop, onResults, requestWake, teardown]);

    const stop = useCallback(async () => {
        await teardown();
        const final = analyzeFrames(framesRef.current, { heightCm: Number(heightRef.current) });
        final.advice = checkForm(exercise, final, goal);
        setResult(final);
        setLive(null);
        setStatus('done');
        const canvas = canvasRef.current;
        if (canvas)
            canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    }, [exercise, goal, teardown]);

    const suggestions = result?.advice?.items.filter((entry) => entry.tone !== 'good') ?? [];
    // 只展示命中了规则的建议的依据；阈值、实测值和机位要求都随这一条建议一起给出
    const basisRows = suggestions.filter((entry) => entry.basis);
    const light = result?.advice?.status === 'green'
        ? 'var(--ok)'
        : result?.advice?.status === 'yellow' ? 'var(--warn)' : 'var(--danger)';

    return (<div className="posture-app" data-status={status} role="dialog" aria-modal="true" aria-label="动作检查">
      <div className="posture-stage" ref={stageRef}>
        <video ref={videoRef} className="posture-video" playsInline muted/>
        <canvas ref={canvasRef} className="posture-canvas"/>
      </div>

      <div className="posture-top">
        <button type="button" className="posture-back" onClick={() => void close()} aria-label="关闭动作检查">‹</button>
        <div className="posture-title">
          <small>摄像头动作检查</small>
          <b>{exercise?.name || '动作检查'}</b>
        </div>
        <span className={`posture-badge ${status}`}>
          {status === 'running' ? '检测中' : status === 'done' ? '已完成' : '准备'}
        </span>
      </div>

      {status === 'idle' ? (<div className="posture-idle">
          <div className="posture-hero">
            <h2>把手机架在动作侧面</h2>
            <p>全身入镜、镜头垂直于动作平面、光线充足。画面只在本机处理，不上传、不保存；单目摄像头是估算，仅作参考。</p>
          </div>
          <div className="posture-field">
            <label htmlFor="posture-height">身高 cm</label>
            <input id="posture-height" type="number" inputMode="numeric" value={height} min={120} max={230} onChange={(event) => setHeight(event.target.value)}/>
          </div>
          {error ? <div className="posture-error">{error}</div> : null}
          <button type="button" className="posture-cta" onClick={() => void start()}>打开摄像头开始</button>
        </div>) : null}

      {status === 'starting' ? <div className="posture-starting">正在打开摄像头…</div> : null}

      {status === 'running' ? (<>
          <div className="posture-hud">
            <div><b>{live?.repCount ?? 0}</b><span>次数</span></div>
            <div><b>{fmt(live?.meanVel, 2)}</b><span>均速 m/s</span></div>
            <div><b>{live?.angles?.knee === null || live?.angles?.knee === undefined ? '—' : `${live.angles.knee}°`}</b><span>最深膝角</span></div>
            <div><b>{live?.angles?.torso === null || live?.angles?.torso === undefined ? '—' : `${live.angles.torso}°`}</b><span>躯干</span></div>
          </div>
          <button type="button" className="posture-stop" onClick={() => void stop()}>结束并分析</button>
        </>) : null}

      {status === 'done' && result ? (<div className="posture-sheet">
          <div className="posture-grab" aria-hidden="true"/>
          <h3>{result.advice?.status === 'green' ? '动作合格' : result.advice?.status === 'yellow' ? '有几处可以调整' : result.advice ? '先调整动作，再加重量' : '这一组没采到关键点'}</h3>
          <div className="posture-stats">
            <div className="posture-stat"><b>{result.repCount}</b><span>次数</span></div>
            <div className="posture-stat"><b>{fmt(result.meanVel, 2)}</b><span>平均速度 m/s</span></div>
            <div className="posture-stat"><b>{fmt(result.lossPct, 1, '%')}</b><span>速度损失</span></div>
            <div className="posture-stat"><b>{result.angles.hip === null ? '—' : `${result.angles.hip}°`}</b><span>髋角</span></div>
            <div className="posture-stat"><b>{result.angles.knee === null ? '—' : `${result.angles.knee}°`}</b><span>最深膝角</span></div>
            <div className="posture-stat"><b>{result.angles.torso === null ? '—' : `${result.angles.torso}°`}</b><span>躯干前倾</span></div>
          </div>

          {result.lossPct !== null ? <div className="posture-note">{lossVerdict(result.lossPct, velocityLossFor(goal?.kindKey))}</div> : null}
          {result.scaleCmPerPx === null ? <div className="posture-note">还没填身高：速度、行程和左右高度差算不出来；补上身高后重测。</div> : null}

          {result.advice ? (<div className="posture-verdict">
              <div className="posture-verdict-head">
                <span className="posture-light" style={{ background: light, boxShadow: `0 0 10px ${light}` }} aria-hidden="true"/>
                <div>
                  <b>{result.advice.status === 'green' ? '没有发现明显问题' : '按下面的建议逐条调整'}</b>
                  <small>{result.advice.status === 'green' ? '保持现在的动作和节奏。' : '下一次会更稳。'}</small>
                </div>
              </div>
              {suggestions.length ? (<div className="posture-advice">
                  {suggestions.map((entry, index) => (<div key={`${entry.title}-${index}`} className="posture-advice-item" style={{ borderLeft: `3px solid ${entry.tone === 'warn' ? 'var(--warn)' : 'var(--danger)'}` }}>
                      <b>{entry.title}</b>
                      {entry.detail ? <span>{entry.detail}</span> : null}
                    </div>))}
                </div>) : null}
            </div>) : (<div className="posture-note">这一组没有采到可用的人体关键点：让人全身入镜、光线亮一点再试。</div>)}

          {basisRows.length ? (<div className="posture-basis">
              <button
                type="button"
                className="posture-basis-toggle"
                aria-expanded={basisOpen}
                onClick={() => setBasisOpen((value) => !value)}
              >
                <span>这些建议怎么来的</span>
                <ChevronDown size={16} className={basisOpen ? 'is-open' : ''}/>
              </button>
              {basisOpen ? (<div className="posture-basis-body">
                  {basisRows.map((entry, index) => (<div key={`${entry.basis.metric}-${index}`} className="posture-basis-row">
                      <div className="posture-basis-meta">
                        <span className={`posture-evidence is-${entry.basis.evidence.level}`}>{entry.basis.evidence.label}</span>
                        <span>拍摄：{entry.basis.camera}</span>
                      </div>
                      <b>{entry.basis.metric}：{entry.basis.observed} → 目标 {entry.basis.target}</b>
                      <span>{entry.basis.why}</span>
                      {entry.basis.evidence.sources.length ? (<div className="posture-basis-refs">
                          {entry.basis.evidence.sources.map((source) => (<a
                              key={source.url}
                              href={source.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              title={source.note}
                            >
                              {source.label} ↗
                            </a>))}
                        </div>) : null}
                    </div>))}
                  <p className="posture-basis-foot">
                    标为「研究支持」的条目附了文献；「应用经验阈值」是应用内口径，不是研究结论。单目摄像头是二维估算，机位、光线和遮挡都会直接影响数值。
                  </p>
                </div>) : null}
            </div>) : null}

          <div className="posture-actions">
            <button type="button" className="primary" onClick={() => void start()}>重测</button>
            <button type="button" onClick={() => void close()}>关闭</button>
          </div>
          <div className="posture-privacy">基于单目摄像头估算，机位与光线会影响判断，仅作参考。视频没有离开这台设备。</div>
        </div>) : null}
    </div>);
}