import { useEffect, useRef, useState } from 'react';
import './season.css';

/**
 * 记录页的「火车窗」背景：窗外按月份换季节。
 * 视频顺序按你给的：1 春（Golden Hour）、2 夏（Still Water）、3 冬（Deep Woods）、4 秋（Quiet Dawn）。
 */
const VIDEOS = [
  {
    key: 'spring',
    label: '春',
    src: 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260702_081127_0992a171-d3c6-4978-8213-0ec5df8b6d63.mp4',
  },
  {
    key: 'summer',
    label: '夏',
    src: 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260702_092026_dd05b805-ea0f-40b2-8c52-332b88502592.mp4',
  },
  {
    key: 'winter',
    label: '冬',
    src: 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260702_081042_df7202bf-bd80-4b2b-bbc6-1f09ba2870e9.mp4',
  },
  {
    key: 'autumn',
    label: '秋',
    src: 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260702_080959_4cac5234-3573-464e-a5b7-76b94b8a7d61.mp4',
  },
];

const FRAME_PNG =
  'https://soft-zoom-63098134.figma.site/_assets/v11/0b4a435b2df2747593c43d7a1c9b4578f7d8d90c.png';

/** 12/1/2 冬、3/4/5 春、6/7/8 夏、9/10/11 秋 */
export function seasonOfMonth(month) {
  if (month === 12 || month === 1 || month === 2)
    return VIDEOS[2];
  if (month >= 3 && month <= 5)
    return VIDEOS[0];
  if (month >= 6 && month <= 8)
    return VIDEOS[1];
  return VIDEOS[3];
}

export default function SeasonBackdrop({ month }) {
  const season = seasonOfMonth(month);
  const [active, setActive] = useState(() => Math.max(0, VIDEOS.findIndex((v) => v.key === season.key)));
  const activeRef = useRef(active);
  const cooling = useRef(false);
  const pending = useRef(null);
  const timer = useRef(0);
  activeRef.current = active;

  useEffect(() => {
    const index = VIDEOS.findIndex((v) => v.key === season.key);
    if (index < 0 || index === activeRef.current)
      return;
    if (cooling.current) {
      // 冷却期间翻月份：先记下最后一个，等 1000ms 淡出结束再切
      pending.current = index;
      return;
    }
    const go = (next) => {
      cooling.current = true;
      setActive(next);
      timer.current = window.setTimeout(() => {
        cooling.current = false;
        const queued = pending.current;
        pending.current = null;
        if (queued !== null && queued !== activeRef.current)
          go(queued);
      }, 1000);
    };
    go(index);
  }, [season.key]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // 只有当前季节在播：四个视频同时解码会把主线程拖住，标签滑出来的动画就“顿”
  const videos = useRef([]);
  useEffect(() => {
    videos.current.forEach((video, index) => {
      if (!video)
        return;
      if (index === active) {
        const played = video.play();
        if (played && typeof played.catch === 'function')
          played.catch(() => {});
      }
      else {
        video.pause();
      }
    });
  }, [active]);

  useEffect(() => {
    const onVisibility = () => {
      const video = videos.current[active];
      if (!video)
        return;
      if (document.hidden) {
        video.pause();
        return;
      }
      const played = video.play();
      if (played && typeof played.catch === 'function')
        played.catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [active]);

  return (<div className="season-bg" aria-hidden="true">
      {VIDEOS.map((video, index) => (<video
          key={video.key}
          ref={(el) => { videos.current[index] = el; }}
          className={`season-video${index === active ? ' on' : ''}`}
          src={video.src}
          autoPlay
          muted
          loop
          playsInline
          preload={index === active ? 'auto' : 'metadata'}
        />))}
      <img className="season-frame" src={FRAME_PNG} alt=""/>
      <div className="season-scrim"/>
    </div>);
}
