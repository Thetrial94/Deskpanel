export const SCREEN_IDS = ['overview', 'weather', 'music', 'codex', 'claude', 'timers', 'services', 'computer', 'remote', 'calendar', 'home'];
export const DEFAULT_CITY = Object.freeze({name: 'Москва', latitude: 55.7558, longitude: 37.6173, country: 'Россия'});
export const DEFAULTS = Object.freeze({
  version: 6, autoRotate: true, interval: 20, resumeAfter: 30,
  screenOrder: SCREEN_IDS, enabledScreens: SCREEN_IDS,
  smartTransitions: true, eveningMode: true, eveningStart: 22, eveningEnd: 7,
  showSeconds: false, dimAtNight: false, city: DEFAULT_CITY, devices: []
});
export const resolveScreenId = id => ({clock:'overview',focus:'timers',breaks:'timers'}[id]||id);
export const SETTINGS_KEY = 'deskpanel.settings.v1';
const within = (v, min, max, fallback) => Number.isFinite(Number(v)) ? Math.max(min, Math.min(max, Number(v))) : fallback;
export function normalizeSettings(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  const order = [...new Set([...(Array.isArray(value.screenOrder) ? value.screenOrder : []), ...SCREEN_IDS].map(resolveScreenId))].filter(id => SCREEN_IDS.includes(id));
  const enabled = Array.isArray(value.enabledScreens) ? [...new Set(value.enabledScreens.map(resolveScreenId).filter(id => SCREEN_IDS.includes(id)))] : [...SCREEN_IDS];
  // Add the new screen once; respect an explicit hide in settings v3.
  if (!(value.version >= 3) && enabled.length && !enabled.includes('music')) enabled.push('music');
  if (!(value.version >= 4) && enabled.length) for(const id of ['computer','remote','calendar','home','timers']) if(!enabled.includes(id))enabled.push(id);
  if (!(value.version >= 5) && enabled.length && !enabled.includes('timers')) enabled.push('timers');
  const devices = (Array.isArray(value.devices)?value.devices:[]).flatMap(d=>{try{const u=new URL(d.url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||u.pathname!=='/'||typeof d.name!=='string'||!d.name.trim())return [];return [{name:d.name.trim().slice(0,60),url:u.origin}];}catch{return [];}}).slice(0,8);
  const c = value.city === undefined || (value.city === null && !(value.version >= 2)) ? DEFAULT_CITY : value.city;
  const city = c && typeof c.name === 'string' && typeof c.latitude === 'number' && typeof c.longitude === 'number' &&
    Number.isFinite(c.latitude) && Number.isFinite(c.longitude) && Math.abs(c.latitude) <= 90 && Math.abs(c.longitude) <= 180
    ? { name: c.name.slice(0, 100), latitude: c.latitude, longitude: c.longitude, country: String(c.country || '').slice(0, 80) } : null;
  return {
    version: 6, autoRotate: typeof value.autoRotate === 'boolean' ? value.autoRotate : true,
    interval: within(value.interval, 5, 120, 20), resumeAfter: within(value.resumeAfter, 5, 300, 30),
    screenOrder: order, enabledScreens: enabled.length ? enabled : ['overview'],
    smartTransitions: value.smartTransitions !== false, eveningMode: value.eveningMode !== false,
    eveningStart: Math.round(within(value.eveningStart,0,23,22)), eveningEnd: Math.round(within(value.eveningEnd,0,23,7)),
    showSeconds: value.showSeconds === true, dimAtNight: value.dimAtNight === true, city, devices
  };
}
export function loadSettings(storage) {
  try { return normalizeSettings(JSON.parse(storage.getItem(SETTINGS_KEY) || '{}')); }
  catch { return normalizeSettings(); }
}
export function saveSettings(storage, value) {
  const result = normalizeSettings(value);
  try { storage.setItem(SETTINGS_KEY, JSON.stringify(result)); return true; } catch { return false; }
}
