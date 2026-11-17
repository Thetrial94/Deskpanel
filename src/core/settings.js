export const SCREEN_IDS = ['overview', 'clock', 'weather', 'music', 'codex', 'claude', 'focus', 'services'];
export const DEFAULT_CITY = Object.freeze({name: 'Москва', latitude: 55.7558, longitude: 37.6173, country: 'Россия'});
export const DEFAULTS = Object.freeze({
  version: 3, autoRotate: true, interval: 20, resumeAfter: 30,
  screenOrder: SCREEN_IDS, enabledScreens: SCREEN_IDS,
  showSeconds: false, dimAtNight: false, city: DEFAULT_CITY
});
export const SETTINGS_KEY = 'deskpanel.settings.v1';
const within = (v, min, max, fallback) => Number.isFinite(Number(v)) ? Math.max(min, Math.min(max, Number(v))) : fallback;
export function normalizeSettings(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  const order = [...new Set([...(Array.isArray(value.screenOrder) ? value.screenOrder : []), ...SCREEN_IDS])].filter(id => SCREEN_IDS.includes(id));
  const enabled = Array.isArray(value.enabledScreens) ? [...new Set(value.enabledScreens.filter(id => SCREEN_IDS.includes(id)))] : [...SCREEN_IDS];
  // Add the new screen once; respect an explicit hide in settings v3.
  if (!(value.version >= 3) && enabled.length && !enabled.includes('music')) enabled.push('music');
  const c = value.city === undefined || (value.city === null && !(value.version >= 2)) ? DEFAULT_CITY : value.city;
  const city = c && typeof c.name === 'string' && typeof c.latitude === 'number' && typeof c.longitude === 'number' &&
    Number.isFinite(c.latitude) && Number.isFinite(c.longitude) && Math.abs(c.latitude) <= 90 && Math.abs(c.longitude) <= 180
    ? { name: c.name.slice(0, 100), latitude: c.latitude, longitude: c.longitude, country: String(c.country || '').slice(0, 80) } : null;
  return {
    version: 3, autoRotate: typeof value.autoRotate === 'boolean' ? value.autoRotate : true,
    interval: within(value.interval, 5, 120, 20), resumeAfter: within(value.resumeAfter, 5, 300, 30),
    screenOrder: order, enabledScreens: enabled.length ? enabled : ['overview'],
    showSeconds: value.showSeconds === true, dimAtNight: value.dimAtNight === true, city
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
