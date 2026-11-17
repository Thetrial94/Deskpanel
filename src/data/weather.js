const WEATHER_CODES = {
  0:'Ясно',1:'Преимущественно ясно',2:'Переменная облачность',3:'Пасмурно',45:'Туман',48:'Изморозь',
  51:'Легкая морось',53:'Морось',55:'Сильная морось',56:'Ледяная морось',57:'Ледяная морось',
  61:'Небольшой дождь',63:'Дождь',65:'Сильный дождь',66:'Ледяной дождь',67:'Ледяной дождь',
  71:'Небольшой снег',73:'Снег',75:'Сильный снег',77:'Снежные зерна',80:'Ливень',81:'Ливень',82:'Сильный ливень',
  85:'Снежный заряд',86:'Сильный снег',95:'Гроза',96:'Гроза с градом',99:'Гроза с градом'
};
export const weatherLabel = code => WEATHER_CODES[code] || 'Погода';
export const weatherIcon = code => code <= 1 ? 'sun' : 'weather';
async function fetchJSON(url, signal) {
  const response = await fetch(url, {signal});
  if (!response.ok) throw new Error('Не удалось получить данные');
  return response.json();
}
export async function searchCities(name, signal) {
  const params = new URLSearchParams({name:name.trim(),count:'5',language:'ru',format:'json'});
  const data = await fetchJSON('https://geocoding-api.open-meteo.com/v1/search?'+params, signal);
  return (data.results || []).map(c => ({name:c.name,latitude:c.latitude,longitude:c.longitude,country:[c.admin1,c.country].filter(Boolean).join(', ')}));
}
export class WeatherSource {
  constructor() { this.state = {city:null,data:null,error:null,loading:false,updatedAt:null}; this.listeners = new Set(); this.request = null; }
  subscribe(fn) { this.listeners.add(fn); fn(this.state); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this.state); }
  setCity(city) {
    this.request?.abort(); this.request = null;
    this.state = {city,data:null,error:null,loading:false,updatedAt:null}; this.emit();
    if (city) this.refresh();
  }
  async refresh(force = false) {
    if (!this.state.city || this.state.loading || (!force && this.state.updatedAt && Date.now()-this.state.updatedAt < 600000)) return;
    const city = this.state.city, controller = new AbortController(); this.request = controller;
    this.state.loading = true; this.state.error = null; this.emit();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const params = new URLSearchParams({
        latitude:String(city.latitude),longitude:String(city.longitude),timezone:'auto',forecast_days:'5',
        current:'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
        daily:'weather_code,temperature_2m_max,temperature_2m_min'
      });
      const data = await fetchJSON('https://api.open-meteo.com/v1/forecast?'+params,controller.signal);
      if (!Number.isFinite(data.current?.temperature_2m) || !Array.isArray(data.daily?.time)) throw new Error('Неверный ответ сервиса');
      if (this.request === controller) { this.state.data = data; this.state.updatedAt = Date.now(); }
    } catch { if (this.request === controller) this.state.error = 'Нет связи с погодным сервисом'; }
    finally { clearTimeout(timer); if (this.request === controller) { this.state.loading = false; this.request = null; this.emit(); } }
  }
}
