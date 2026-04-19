"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Cloud, MapPin, Search, RefreshCw,
  AlertTriangle, Wind, Droplets, Thermometer,
  Sun, CloudRain, TrendingDown, TrendingUp,
  Calendar, Clock,
} from "lucide-react";
import WeatherWidget from "@/components/shared/WeatherWidget";
import ModuleChat from "@/components/shared/ModuleChat";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area,
} from "recharts";

const LOCATIONS = [
  { name: "CivilAI Tower", city: "Dubai", lat: 25.2048, lon: 55.2708, flag: "🇦🇪" },
  { name: "Metro Bridge", city: "London", lat: 51.5074, lon: -0.1278, flag: "🇬🇧" },
  { name: "Industrial Park", city: "Frankfurt", lat: 50.1109, lon: 8.6821, flag: "🇩🇪" },
  { name: "New York Site", city: "New York", lat: 40.7128, lon: -74.0060, flag: "🇺🇸" },
  { name: "Singapore Hub", city: "Singapore", lat: 1.3521, lon: 103.8198, flag: "🇸🇬" },
  { name: "Mumbai Site", city: "Mumbai", lat: 19.0760, lon: 72.8777, flag: "🇮🇳" },
  { name: "Sydney Project", city: "Sydney", lat: -33.8688, lon: 151.2093, flag: "🇦🇺" },
  { name: "Tokyo Build", city: "Tokyo", lat: 35.6762, lon: 139.6503, flag: "🇯🇵" },
];

const WMO_CODES: { [key: number]: string } = {
  0: "clear sky", 1: "mainly clear", 2: "partly cloudy", 3: "overcast",
  45: "foggy", 48: "foggy", 51: "light drizzle", 53: "drizzle",
  55: "heavy drizzle", 61: "light rain", 63: "rain", 65: "heavy rain",
  71: "light snow", 73: "snow", 75: "heavy snow",
  80: "rain showers", 81: "rain showers", 82: "heavy showers",
  95: "thunderstorm", 96: "thunderstorm with hail",
};

interface LocationWeather {
  temp: number;
  feels_like: number;
  humidity: number;
  wind_speed: number;
  pressure: number;
  visibility: number;
  description: string;
  is_day: number;
  hourly_temps: number[];
  hourly_times: string[];
  hourly_codes: number[];
  daily_max: number[];
  daily_min: number[];
  daily_codes: number[];
}

const fetchWeatherForLocation = async (lat: number, lon: number): Promise<LocationWeather | null> => {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,surface_pressure,visibility,is_day&hourly=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=7&timezone=auto`;
    const res = await fetch(url);
    const data = await res.json();
    const current = data.current;
    const now = new Date();
    const hourIdx = now.getHours();

    return {
      temp: Math.round(current.temperature_2m),
      feels_like: Math.round(current.apparent_temperature),
      humidity: current.relative_humidity_2m,
      wind_speed: Math.round(current.wind_speed_10m),
      pressure: Math.round(current.surface_pressure),
      visibility: current.visibility || 10000,
      description: WMO_CODES[current.weather_code] || "clear sky",
      is_day: current.is_day,
      hourly_temps: data.hourly.temperature_2m.slice(hourIdx, hourIdx + 24),
      hourly_times: data.hourly.time.slice(hourIdx, hourIdx + 24).map((t: string) =>
        new Date(t).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })
      ),
      hourly_codes: data.hourly.weather_code.slice(hourIdx, hourIdx + 24),
      daily_max: data.daily.temperature_2m_max,
      daily_min: data.daily.temperature_2m_min,
      daily_codes: data.daily.weather_code,
    };
  } catch {
    return null;
  }
};

const getWeatherEmoji = (description: string) => {
  const d = description.toLowerCase();
  if (d.includes("thunder")) return "⛈️";
  if (d.includes("snow")) return "❄️";
  if (d.includes("rain") || d.includes("shower") || d.includes("drizzle")) return "🌧️";
  if (d.includes("fog")) return "🌫️";
  if (d.includes("cloud") || d.includes("overcast")) return "⛅";
  return "☀️";
};

const getConstructionRisk = (weather: LocationWeather) => {
  let score = 0;
  const issues = [];

  if (weather.wind_speed > 54) { score += 40; issues.push("🚨 Crane ops suspended (wind > 54 km/h)"); }
  else if (weather.wind_speed > 38) { score += 25; issues.push("⚠️ Crane restricted (wind > 38 km/h)"); }
  else if (weather.wind_speed > 25) { score += 10; issues.push("⚠️ Monitor crane conditions"); }

  if (weather.description.includes("thunder")) { score += 40; issues.push("🚨 Lightning risk — evacuate elevated work"); }
  if (weather.description.includes("rain") || weather.description.includes("shower")) { score += 20; issues.push("🌧️ Concrete pouring delayed"); }
  if (weather.description.includes("snow")) { score += 35; issues.push("❄️ Site shutdown recommended"); }
  if (weather.temp > 40) { score += 20; issues.push("🌡️ Extreme heat — mandatory breaks"); }
  else if (weather.temp > 35) { score += 10; issues.push("☀️ Heat stress risk — extra breaks"); }
  if (weather.temp < 0) { score += 25; issues.push("🥶 Freezing — frost protection required"); }
  else if (weather.temp < 5) { score += 10; issues.push("❄️ Cold — concrete heating needed"); }
  if (weather.humidity > 90) { score += 10; issues.push("💧 High humidity — check electrical"); }
  if (weather.visibility < 1000) { score += 15; issues.push("🌫️ Low visibility — safety alert"); }

  if (issues.length === 0) issues.push("✅ All clear — ideal construction conditions");

  const level = score === 0 ? "none" : score < 20 ? "low" : score < 40 ? "medium" : score < 60 ? "high" : "critical";
  return { score: Math.min(100, score), level, issues };
};

const getDayName = (index: number) => {
  const days = ["Today", "Tomorrow", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const d = new Date();
  d.setDate(d.getDate() + index);
  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";
  return d.toLocaleDateString("en", { weekday: "short" });
};

export default function WeatherPage() {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [weatherData, setWeatherData] = useState<(LocationWeather | null)[]>([]);
  const [loading, setLoading] = useState(true);
  const [customCity, setCustomCity] = useState("");
  const [customLocations, setCustomLocations] = useState<typeof LOCATIONS>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const allLocations = [...LOCATIONS, ...customLocations];
  const selected = allLocations[selectedIdx];
  const weather = weatherData[selectedIdx];

  useEffect(() => {
    loadAllWeather();
  }, []);

  const loadAllWeather = async () => {
    setLoading(true);
    const results = await Promise.all(
      allLocations.map(loc => fetchWeatherForLocation(loc.lat, loc.lon))
    );
    setWeatherData(results);
    setLoading(false);
  };

  const handleAddCity = async () => {
    if (!customCity.trim()) return;
    setSearchLoading(true);
    try {
      // Use Open-Meteo geocoding
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(customCity)}&count=1`
      );
      const geoData = await geoRes.json();
      if (geoData.results && geoData.results.length > 0) {
        const result = geoData.results[0];
        const newLoc = {
          name: result.name,
          city: result.name,
          lat: result.latitude,
          lon: result.longitude,
          flag: "📍",
        };
        const newLocations = [...customLocations, newLoc];
        setCustomLocations(newLocations);
        const allLocs = [...LOCATIONS, ...newLocations];
        const newWeather = await fetchWeatherForLocation(result.latitude, result.longitude);
        const newWeatherData = [...weatherData, newWeather];
        setWeatherData(newWeatherData);
        setSelectedIdx(allLocs.length - 1);
        setCustomCity("");
      } else {
        alert("City not found. Try a different name.");
      }
    } catch {
      alert("Failed to search city.");
    } finally {
      setSearchLoading(false);
    }
  };

  const risk = weather ? getConstructionRisk(weather) : null;

  const riskColors = {
    none: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    low: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    medium: "text-orange-400 bg-orange-500/10 border-orange-500/20",
    high: "text-red-400 bg-red-500/10 border-red-500/20",
    critical: "text-red-300 bg-red-600/10 border-red-600/30",
  };

  const hourlyChartData = weather?.hourly_temps.slice(0, 12).map((temp, i) => ({
    time: weather.hourly_times[i],
    temp,
    feels: temp - 2 + Math.random() * 4,
  })) || [];

  const weeklyChartData = weather?.daily_max.map((max, i) => ({
    day: getDayName(i),
    max: Math.round(max),
    min: Math.round(weather.daily_min[i]),
    emoji: getWeatherEmoji(WMO_CODES[weather.daily_codes[i]] || "clear"),
  })) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Weather & Site Conditions</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time weather · Construction impact · 7-day forecast · Open-Meteo API
          </p>
        </div>
        <div className="flex gap-2">
          <input
            value={customCity}
            onChange={(e) => setCustomCity(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddCity()}
            placeholder="Add city..."
            className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
          />
          <button onClick={handleAddCity} disabled={searchLoading}
            className="px-3 py-2 rounded-xl gradient-blue text-white text-sm flex items-center gap-2">
            {searchLoading
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Search className="w-4 h-4" />}
          </button>
          <button onClick={loadAllWeather}
            className="px-3 py-2 rounded-xl bg-secondary border border-border text-muted-foreground hover:text-foreground text-sm flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </motion.div>

      {/* Location Tabs */}
      <div className="flex gap-2 flex-wrap">
        {allLocations.map((loc, i) => {
          const w = weatherData[i];
          return (
            <button key={i} onClick={() => setSelectedIdx(i)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                selectedIdx === i
                  ? "bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/20"
                  : "bg-secondary text-muted-foreground border-border hover:text-foreground hover:border-blue-500/30"
              }`}>
              <span>{loc.flag}</span>
              <div className="text-left">
                <p className="font-medium">{loc.city}</p>
                {w && <p className="text-xs opacity-75">{w.temp}°C {getWeatherEmoji(w.description)}</p>}
              </div>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <p className="ml-3 text-muted-foreground">Loading weather data...</p>
        </div>
      ) : weather ? (
        <>
          {/* Main Weather Card */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Current Weather */}
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              className={`lg:col-span-1 rounded-2xl p-6 border ${
                weather.is_day
                  ? "bg-gradient-to-br from-blue-500/20 via-sky-500/10 to-slate-900 border-blue-500/30"
                  : "bg-gradient-to-br from-slate-800 via-blue-900/20 to-slate-900 border-blue-900/30"
              }`}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <MapPin className="w-4 h-4 text-blue-400" />
                    <p className="text-lg font-bold text-foreground">{selected.city}</p>
                    <span className="text-lg">{selected.flag}</span>
                  </div>
                  <p className="text-muted-foreground text-sm capitalize">{weather.description}</p>
                </div>
                <motion.span
                  animate={{ y: [0, -8, 0] }}
                  transition={{ repeat: Infinity, duration: 3 }}
                  className="text-5xl"
                >
                  {getWeatherEmoji(weather.description)}
                </motion.span>
              </div>

              <p className="text-7xl font-bold text-foreground mb-1">{weather.temp}°</p>
              <p className="text-muted-foreground text-sm">Feels like {weather.feels_like}°C</p>

              <div className="grid grid-cols-2 gap-3 mt-4">
                {[
                  { icon: Droplets, label: "Humidity", value: `${weather.humidity}%`, color: "text-blue-400" },
                  { icon: Wind, label: "Wind", value: `${weather.wind_speed} km/h`, color: "text-emerald-400" },
                  { icon: Cloud, label: "Pressure", value: `${weather.pressure} hPa`, color: "text-purple-400" },
                  { icon: Sun, label: "Visibility", value: `${(weather.visibility / 1000).toFixed(1)} km`, color: "text-yellow-400" },
                ].map((stat, i) => (
                  <div key={i} className="bg-black/20 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                    </div>
                    <p className="text-sm font-medium text-foreground">{stat.value}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Construction Risk */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="lg:col-span-2 space-y-4">
              {risk && (
                <div className={`rounded-2xl border p-5 ${riskColors[risk.level as keyof typeof riskColors]}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" />
                      <p className="font-semibold text-sm">Construction Risk Assessment</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="bg-black/20 rounded-full px-3 py-1">
                        <span className="text-sm font-bold">Risk Score: {risk.score}/100</span>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-black/20 capitalize font-medium">
                        {risk.level}
                      </span>
                    </div>
                  </div>
                  {/* Risk Score Bar */}
                  <div className="bg-black/20 rounded-full h-2 mb-4">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${risk.score}%` }}
                      transition={{ duration: 1 }}
                      className={`h-2 rounded-full ${
                        risk.score < 20 ? "bg-emerald-400" :
                        risk.score < 40 ? "bg-yellow-400" :
                        risk.score < 60 ? "bg-orange-400" : "bg-red-400"
                      }`}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {risk.issues.map((issue, i) => (
                      <p key={i} className="text-xs">{issue}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  {
                    label: "Working Hours",
                    value: weather.wind_speed > 54 || weather.description.includes("thunder") ? "0h" : "8h",
                    sub: "Available today",
                    color: weather.wind_speed > 54 ? "text-red-400" : "text-emerald-400",
                    bg: weather.wind_speed > 54 ? "bg-red-500/5 border-red-500/20" : "bg-emerald-500/5 border-emerald-500/20",
                  },
                  {
                    label: "Crane Status",
                    value: weather.wind_speed > 38 ? "Restricted" : weather.wind_speed > 54 ? "Suspended" : "Operational",
                    sub: `Wind: ${weather.wind_speed} km/h`,
                    color: weather.wind_speed > 38 ? "text-orange-400" : "text-emerald-400",
                    bg: weather.wind_speed > 38 ? "bg-orange-500/5 border-orange-500/20" : "bg-emerald-500/5 border-emerald-500/20",
                  },
                  {
                    label: "Concrete Pour",
                    value: weather.description.includes("rain") ? "Delayed" : weather.temp < 5 ? "Restricted" : "Approved",
                    sub: `Temp: ${weather.temp}°C`,
                    color: weather.description.includes("rain") ? "text-red-400" : "text-emerald-400",
                    bg: weather.description.includes("rain") ? "bg-red-500/5 border-red-500/20" : "bg-emerald-500/5 border-emerald-500/20",
                  },
                ].map((stat, i) => (
                  <div key={i} className={`rounded-xl border p-3 ${stat.bg}`}>
                    <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
                    <p className={`text-sm font-bold ${stat.color}`}>{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.sub}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Hourly Temperature */}
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-blue-400" />
                <h3 className="font-semibold text-foreground">24-Hour Temperature</h3>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={hourlyChartData}>
                  <defs>
                    <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                  <XAxis dataKey="time" tick={{ fill: "#6b7280", fontSize: 9 }} axisLine={false} tickLine={false}
                    interval={2} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} unit="°" />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
                  <Area type="monotone" dataKey="temp" stroke="#3b82f6" fill="url(#tempGrad)" strokeWidth={2} name="Temp °C" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>

            {/* 7-Day Forecast */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-4 h-4 text-blue-400" />
                <h3 className="font-semibold text-foreground">7-Day Forecast</h3>
              </div>
              <div className="space-y-2">
                {weeklyChartData.slice(0, 7).map((day, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-xl hover:bg-secondary/50 transition-colors">
                    <span className="text-xs text-muted-foreground w-16">{day.day}</span>
                    <span className="text-lg">{day.emoji}</span>
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-xs text-blue-400">{day.min}°</span>
                      <div className="flex-1 bg-secondary rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full bg-gradient-to-r from-blue-400 to-orange-400"
                          style={{ width: `${Math.min(100, ((day.max - day.min) / 20) * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-orange-400">{day.max}°</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* All Sites Overview */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-5 h-5 text-blue-400" />
              <h3 className="font-semibold text-foreground">All Site Conditions</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                Live — Open-Meteo
              </span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {allLocations.map((loc, i) => {
                const w = weatherData[i];
                if (!w) return null;
                const r = getConstructionRisk(w);
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    onClick={() => setSelectedIdx(i)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all hover:scale-105 ${
                      selectedIdx === i ? "border-blue-500/50 bg-blue-500/5" : "border-border bg-secondary/30"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg">{loc.flag}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full border ${riskColors[r.level as keyof typeof riskColors]}`}>
                        {r.level}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-foreground">{loc.city}</p>
                    <p className="text-xs text-muted-foreground mb-2">{loc.name}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-bold text-foreground">{w.temp}°</span>
                      <span className="text-xl">{getWeatherEmoji(w.description)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground capitalize mt-1">{w.description}</p>
                    <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
                      <span>💨 {w.wind_speed}</span>
                      <span>💧 {w.humidity}%</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          {/* Construction Tips */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-2xl p-6">
            <h3 className="font-semibold text-foreground mb-4">Weather Safety Guidelines</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {[
                { icon: "🌧️", title: "Rain Protocol", desc: "Schedule concrete pours 24h before rain. Cover fresh concrete immediately. Suspend excavation in heavy rain.", color: "bg-blue-500/10 border-blue-500/20" },
                { icon: "💨", title: "Wind Protocol", desc: "> 25 km/h: Monitor. > 38 km/h: Restrict cranes. > 54 km/h: Suspend all elevated work.", color: "bg-orange-500/10 border-orange-500/20" },
                { icon: "☀️", title: "Heat Protocol", desc: "> 35°C: 15-min breaks every hour. > 40°C: Early start 5AM, stop at noon. Mandatory hydration stations.", color: "bg-yellow-500/10 border-yellow-500/20" },
                { icon: "❄️", title: "Cold Protocol", desc: "< 5°C: Heat concrete mixing water. < 0°C: Frost protection blankets. < -10°C: Suspend wet work.", color: "bg-sky-500/10 border-sky-500/20" },
                { icon: "⛈️", title: "Lightning Protocol", desc: "30-30 rule: If thunder within 30s of lightning — stop. Wait 30 min after last thunder before resuming.", color: "bg-purple-500/10 border-purple-500/20" },
                { icon: "🌫️", title: "Visibility Protocol", desc: "< 500m: Suspend mobile crane movement. < 100m: Emergency lighting required. Use spotters.", color: "bg-slate-500/10 border-slate-500/20" },
              ].map((tip, i) => (
                <div key={i} className={`flex items-start gap-3 p-4 rounded-xl border ${tip.color}`}>
                  <span className="text-2xl flex-shrink-0">{tip.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-1">{tip.title}</p>
                    <p className="text-xs text-muted-foreground">{tip.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      ) : (
        <div className="text-center py-20">
          <Cloud className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Failed to load weather data</p>
          <button onClick={loadAllWeather}
            className="mt-3 px-4 py-2 rounded-xl gradient-blue text-white text-sm">
            Retry
          </button>
        </div>
      )}

      <ModuleChat
        context="Weather & Site Conditions"
        placeholder="Ask about weather impact on your project..."
        pageSummaryData={{
          location: selected?.city,
          weather: weather ? {
            temp: weather.temp,
            description: weather.description,
            wind: weather.wind_speed,
            risk: risk?.level,
          } : null,
        }}
      />
    </div>
  );
}