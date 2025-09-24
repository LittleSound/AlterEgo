import * as v from 'valibot'
import { tool } from 'xsai'

export async function weather() {
  return await tool({
    description: 'Get current weather for a location via Open‑Meteo',
    name: 'weather',
    parameters: v.object({
      location: v.pipe(
        v.string(),
        v.description('The location name in English to query (e.g., "Shanghai", "Tokyo", "San Francisco").'),
      ),
      // units: v.pipe(
      //   v.picklist(['metric', 'imperial'] as const),
      //   v.description('Units system: "metric" or "imperial".'),
      // ),
      // lang: v.pipe(
      //   v.string(),
      //   v.description('Language code for place names (e.g., "zh", "en").'),
      // ),
    }),
    execute: async ({
      location,
      // units,
      // lang
    }) => {
      const lang = 'en'
      const units = 'metric'
      const abort = new AbortController()
      const timeout = setTimeout(() => abort.abort(), 1000 * 60)
      try {
        // 1) Geocode the location name to lat/lon
        const geo = await geocode(location, lang, abort.signal)
        if (!geo) {
          return JSON.stringify({
            ok: false,
            error: `No results found for location: ${location}`,
          })
        }

        // 2) Fetch current weather
        const current = await fetchCurrentWeather(
          geo.latitude,
          geo.longitude,
          units ?? 'metric',
          abort.signal,
        )

        // 3) Fetch hourly (next ~24h) and daily (7d)
        const [hourly, daily] = await Promise.all([
          fetchHourlyForecast(geo.latitude, geo.longitude, units ?? 'metric', abort.signal),
          fetchDailyForecast(geo.latitude, geo.longitude, 7, units ?? 'metric', abort.signal),
        ])

        // Build 24h slice starting from current time
        const nowTime: string | undefined = current.current?.time
        const hourlyTimes: string[] = hourly.hourly?.time || []
        const idxNow = nowTime ? Math.max(0, hourlyTimes.indexOf(nowTime)) : 0
        const endIdx = Math.min(hourlyTimes.length, idxNow + 24)
        const hourlySlice = {
          time: hourlyTimes.slice(idxNow, endIdx),
          temperature_2m: (hourly.hourly?.temperature_2m || []).slice(idxNow, endIdx),
          precipitation: (hourly.hourly?.precipitation || []).slice(idxNow, endIdx),
          precipitation_probability: (hourly.hourly?.precipitation_probability || []).slice(idxNow, endIdx),
          weather_code: (hourly.hourly?.weather_code || []).slice(idxNow, endIdx),
        }

        // Compute tonight and tomorrow decisions using local date strings
        const todayDate = nowTime?.split('T')[0]
        const tomorrowDate = daily.daily?.time?.[1]
        const tonightWindow = summarizeRainWindow(hourly, todayDate, h => h >= 18 && h <= 23, nowTime)
        const tomorrowWindow = summarizeRainWindow(hourly, tomorrowDate, _ => true)

        const decisions = {
          tonight: toUmbrellaDecision(tonightWindow),
          tomorrow: toUmbrellaDecision(tomorrowWindow),
        }

        const result = {
          ok: true,
          query: location,
          resolved: {
            name: geo.name,
            country: geo.country,
            admin1: geo.admin1 ?? undefined,
            latitude: geo.latitude,
            longitude: geo.longitude,
            timezone: current.timezone,
          },
          units: units ?? 'metric',
          current: {
            time: current.current?.time,
            temperature: current.current?.temperature_2m,
            feels_like: current.current?.apparent_temperature,
            humidity: current.current?.relative_humidity_2m,
            wind_speed: current.current?.wind_speed_10m,
            wind_gusts: current.current?.wind_gusts_10m,
            wind_direction: current.current?.wind_direction_10m,
            precipitation: current.current?.precipitation,
            cloud_cover: current.current?.cloud_cover,
            weather_code: current.current?.weather_code,
            weather_text: decodeWeatherCode(current.current?.weather_code),
          },
          hourly_next_24h: hourlySlice.time.map((t, i) => ({
            time: t,
            temperature: hourlySlice.temperature_2m[i],
            precip_mm: hourlySlice.precipitation[i],
            pop: hourlySlice.precipitation_probability?.[i] ?? null,
            weather_code: hourlySlice.weather_code[i],
            weather_text: decodeWeatherCode(hourlySlice.weather_code[i]),
          })),
          daily_7d: (daily.daily?.time || []).map((d: string, i: number) => ({
            date: d,
            tmax: daily.daily?.temperature_2m_max?.[i],
            tmin: daily.daily?.temperature_2m_min?.[i],
            precip_mm: daily.daily?.precipitation_sum?.[i],
            weather_code: daily.daily?.weather_code?.[i],
            weather_text: decodeWeatherCode(daily.daily?.weather_code?.[i]),
            wind_speed_max: daily.daily?.wind_speed_10m_max?.[i],
            sunrise: daily.daily?.sunrise?.[i],
            sunset: daily.daily?.sunset?.[i],
          })),
          decisions,
          source: 'open-meteo',
        }

        return JSON.stringify(result)
      }
      catch (err) {
        return JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) })
      }
      finally {
        clearTimeout(timeout)
      }
    },
  })
}

interface GeoResult {
  name: string
  country?: string
  admin1?: string
  latitude: number
  longitude: number
}

async function geocode(name: string, lang?: string, signal?: AbortSignal): Promise<GeoResult | null> {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
  url.searchParams.set('name', name)
  url.searchParams.set('count', '1')
  url.searchParams.set('format', 'json')
  if (lang)
    url.searchParams.set('language', lang)

  const res = await fetch(url, { signal })
  if (!res.ok)
    throw new Error(`Geocoding failed with status ${res.status}`)
  const data = await res.json() as { results?: Array<any> }
  const first = data.results?.[0]
  if (!first)
    return null
  return {
    name: first.name,
    country: first.country,
    admin1: first.admin1,
    latitude: first.latitude,
    longitude: first.longitude,
  }
}

type Units = 'metric' | 'imperial'

async function fetchCurrentWeather(lat: number, lon: number, units: Units, signal?: AbortSignal) {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lon))
  url.searchParams.set('current', [
    'temperature_2m',
    'relative_humidity_2m',
    'apparent_temperature',
    'precipitation',
    'rain',
    'showers',
    'snowfall',
    'weather_code',
    'cloud_cover',
    'wind_speed_10m',
    'wind_gusts_10m',
    'wind_direction_10m',
  ].join(','))
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('forecast_days', '1')

  if (units === 'imperial') {
    url.searchParams.set('temperature_unit', 'fahrenheit')
    url.searchParams.set('wind_speed_unit', 'mph')
    url.searchParams.set('precipitation_unit', 'inch')
  }

  const res = await fetch(url, { signal })
  if (!res.ok)
    throw new Error(`Weather fetch failed with status ${res.status}`)
  return await res.json() as any
}

async function fetchHourlyForecast(lat: number, lon: number, units: Units, signal?: AbortSignal) {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lon))
  url.searchParams.set('hourly', [
    'temperature_2m',
    'precipitation',
    'precipitation_probability',
    'weather_code',
  ].join(','))
  url.searchParams.set('timezone', 'auto')
  // ensure we have at least until tomorrow for 24h window
  url.searchParams.set('forecast_days', '2')

  if (units === 'imperial') {
    url.searchParams.set('temperature_unit', 'fahrenheit')
    url.searchParams.set('wind_speed_unit', 'mph')
    url.searchParams.set('precipitation_unit', 'inch')
  }

  const res = await fetch(url, { signal })
  if (!res.ok)
    throw new Error(`Hourly fetch failed with status ${res.status}`)
  return await res.json() as any
}

async function fetchDailyForecast(lat: number, lon: number, days: number, units: Units, signal?: AbortSignal) {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lon))
  url.searchParams.set('daily', [
    'temperature_2m_max',
    'temperature_2m_min',
    'precipitation_sum',
    'weather_code',
    'wind_speed_10m_max',
    'sunrise',
    'sunset',
  ].join(','))
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('forecast_days', String(Math.min(Math.max(days, 1), 16)))

  if (units === 'imperial') {
    url.searchParams.set('temperature_unit', 'fahrenheit')
    url.searchParams.set('wind_speed_unit', 'mph')
    url.searchParams.set('precipitation_unit', 'inch')
  }

  const res = await fetch(url, { signal })
  if (!res.ok)
    throw new Error(`Daily fetch failed with status ${res.status}`)
  return await res.json() as any
}

function summarizeRainWindow(hourly: any, date: string | undefined, hourPredicate: (h: number) => boolean, nowTime?: string) {
  const times: string[] = hourly.hourly?.time || []
  const pops: Array<number | null | undefined> = hourly.hourly?.precipitation_probability || []
  const precips: number[] = hourly.hourly?.precipitation || []

  if (!date)
    return { pop_max: 0, precip_sum_mm: 0, will_rain: false }

  const rows = times.map((t, i) => ({
    t,
    date: t.split('T')[0],
    hour: Number((t.split('T')[1] || '00:00').slice(0, 2)),
    pop: pops[i] ?? 0,
    precip: precips[i] ?? 0,
  }))
    .filter(r => r.date === date && hourPredicate(r.hour))
    .filter(r => !nowTime || r.t >= nowTime)

  const pop_max = rows.reduce((m, r) => Math.max(m, r.pop || 0), 0)
  const precip_sum_mm = rows.reduce((s, r) => s + (r.precip || 0), 0)
  const will_rain = pop_max >= 30 || precip_sum_mm >= 0.1
  return { pop_max, precip_sum_mm, will_rain }
}

function toUmbrellaDecision(s: { pop_max: number, precip_sum_mm: number, will_rain: boolean }) {
  const bring = s.will_rain && (s.pop_max >= 50 || s.precip_sum_mm >= 1.0)
  const reason = s.will_rain
    ? `降雨概率最高${Math.round(s.pop_max)}%，累计降水约${s.precip_sum_mm.toFixed(1)}mm`
    : '降雨概率较低（<30%），总体较干燥'
  return { will_rain: s.will_rain, pop_max: Math.round(s.pop_max), precip_sum_mm: Number(s.precip_sum_mm.toFixed(2)), bring_umbrella: bring, reason }
}

function decodeWeatherCode(code?: number): string | undefined {
  if (code == null)
    return undefined
  // WMO weather interpretation codes (WW)
  // https://open-meteo.com/en/docs#api_form
  const map: Record<number, string> = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    56: 'Light freezing drizzle',
    57: 'Dense freezing drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    66: 'Light freezing rain',
    67: 'Heavy freezing rain',
    71: 'Slight snow fall',
    73: 'Moderate snow fall',
    75: 'Heavy snow fall',
    77: 'Snow grains',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    85: 'Slight snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail',
  }
  return map[code] ?? `Unknown (${code})`
}
