import { SEED_VIDEOS, UP_NAME } from './videoSeed.js';
const KEY = 'fitplan.videos';
const HOSTS = [
    { test: (h) => h.includes('bilibili.com'), name: 'B站' },
    { test: (h) => h.includes('youtube.com') || h.includes('youtu.be'), name: 'YouTube' },
    { test: (h) => h.includes('youku.com'), name: '优酷' },
    { test: (h) => h.includes('v.qq.com'), name: '腾讯视频' },
    { test: (h) => h.includes('ixigua.com'), name: '西瓜视频' },
    { test: (h) => h.includes('mgtv.com'), name: '芒果TV' },
    { test: (h) => h.includes('douyin.com'), name: '抖音' },
    { test: (h) => h.includes('vimeo.com'), name: 'Vimeo' }
];
function readMap() {
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
        return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    }
    catch {
        return {};
    }
}
function writeMap(map) {
    localStorage.setItem(KEY, JSON.stringify(map));
}
function info(url) {
    let u;
    try {
        u = new URL(String(url).trim());
    }
    catch {
        return null;
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:')
        return null;
    const host = u.hostname.toLowerCase();
    const hit = HOSTS.find((h) => h.test(host));
    if (!hit)
        return null;
    return { url: u.toString(), host: hit.name };
}
/** 预置的示范都是谭成义本人上传的页面；本机那份只记录他自己的改动 */
export function videoFor(exId) {
    const mine = readMap()[exId];
    if (mine === 'off')
        return null;
    if (mine)
        return mine;
    return SEED_VIDEOS[exId] ? { ...info(SEED_VIDEOS[exId]), by: UP_NAME } : null;
}
export function videoHostLabel(url) {
    return info(url)?.host ?? '';
}
/** 只认公开视频站的链接，其余一律不收：这是别人的作品，链接必须能追到原作者 */
export function setVideo(exId, url) {
    const hit = info(url);
    if (!hit)
        return null;
    const map = readMap();
    map[exId] = hit;
    writeMap(map);
    return hit;
}
export function dropVideo(exId) {
    const map = readMap();
    if (SEED_VIDEOS[exId])
        map[exId] = 'off';
    else
        delete map[exId];
    writeMap(map);
}
