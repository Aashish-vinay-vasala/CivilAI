"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Cloud, Sun, CloudRain, CloudSnow,
  Wind, Droplets, AlertTriangle,
  Eye, Gauge, Thermometer,
} from "lucide-react";

interface WeatherData {
  temp: number;
  feels_like: number;
  humidity: number;
  wind_speed: number;
  visibility: number;
  pressure: number;
  description: string;
  city: string;
  is_day: number;
}

interface WeatherImpact {
  level: "low" | "medium" | "high" | "critical";
  message: string;
  affected: string[];
}

interface WeatherWidgetProps {
  location?: string;
  compact?: boolean;
}

const LOCATION_COORDS: { [key: string]: { lat: number; lon: number; name: string } } = {
  "Dubai": { lat: 25.2048, lon: 55.2708, name: "Dubai, UAE" },
  "London": { lat: 51.5074, lon: -0.1278, name: "London, UK" },
  "Frankfurt": { lat: 50.1109, lon: 8.6821, name: "Frankfurt, DE" },
  "New York": { lat: 40.7128, lon: -74.0060, name: "New York, US" },
  "Singapore": { lat: 1.3521, lon: 103.8198, name: "Singapore" },
  "Mumbai": { lat: 19.0760, lon: 72.8777, name: "Mumbai, IN" },
  "Sydney": { lat: -33.8688, lon: 151.2093, name: "Sydney, AU" },
  "Tokyo": { lat: 35.6762, lon: 139.6503, name: "Tokyo, JP" },
};

const WMO_CODES: { [key: number]: string } = {
  0: "clear sky", 1: "mainly clear", 2: "partly cloudy", 3: "overcast",
  45: "foggy", 48: "foggy", 51: "light drizzle", 53: "drizzle",
  55: "heavy drizzle", 61: "light rain", 63: "rain", 65: "heavy rain",
  71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains",
  80: "rain showers", 81: "rain showers", 82: "violent showers",
  85: "snow showers", 86: "heavy snow showers", 95: "thunderstorm",
  96: "thunderstorm with hail", 99: "thunderstorm with heavy hail",
};

const getWeatherIcon = (description: string, size = "w-8 h-8") => {
  const desc = description.toLowerCase();
  if (desc.includes("rain") || desc.includes("drizzle") || desc.includes("shower"))
    return <CloudRain className={`${size} text-blue-400`} />;
  if (desc.includes("snow"))
    return <CloudSnow className={`${size} text-blue-200`} />;
  if (desc.includes("cloud") || desc.includes("overcast") || desc.includes("fog"))
    return <Cloud className={`${size} text-slate-400`} />;
  return <Sun className={`${size} text-yellow-400`} />;
};

const getConstructionImpact = (weather: WeatherData): WeatherImpact => {
  const impacts: string[] = [];
  let level: WeatherImpact["level"] = "low";

  if (weather.wind_speed > 54) {
    impacts.push("All crane operations suspended");
    impacts.push("Scaffold work prohibited");
    level = "critical";
  } else if (weather.wind_speed > 38) {
    impacts.push("Crane operations restricted");
    impacts.push("Elevated work with caution");
    level = "high";
  } else if (weather.wind_speed > 25) {
    impacts.push("Monitor crane & scaffold conditions");
    level = "medium";
  }

  if (weather.description.includes("rain") || weather.description.includes("shower")) {
    impacts.push("Concrete pouring delayed");
    impacts.push("Excavation work on hold");
    if (level === "low") level = "medium";
  }

  if (weather.description.includes("thunderstorm")) {
    impacts.push("Evacuate all elevated platforms immediately");
    impacts.push("Suspend all outdoor electrical work");
    level = "critical";
  }

  if (weather.description.includes("snow")) {
    impacts.push("All outdoor work suspended");
    impacts.push("Site access may be restricted");
    level = "critical";
  }

  if (weather.temp > 38) {
    impacts.push(`Heat alert: ${weather.temp}°C — extra breaks required`);
    impacts.push("Increase water supply on site");
    if (level === "low") level = "medium";
  }

  if (weather.temp < 2) {
    impacts.push("Frost protection for concrete required");
    impacts.push("Ice hazard on scaffolding & walkways");
    if (level === "low") level = "medium";
  }

  if (weather.humidity > 85) {
    impacts.push("High humidity — check electrical equipment");
    if (level === "low") level = "medium";
  }

  if (impacts.length === 0) {
    impacts.push("✅ Ideal conditions for all construction activities");
    impacts.push("Good visibility and safe working conditions");
  }

  const messages = {
    low: "✅ Good working conditions",
    medium: "⚠️ Minor weather impact on schedule",
    high: "🚨 Significant weather delays expected",
    critical: "❌ Site shutdown recommended",
  };

  return { level, message: messages[level], affected: impacts };
};

export default function WeatherWidget({ location = "Dubai", compact = false }: WeatherWidgetProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [impact, setImpact] = useState<WeatherImpact | null>(null);
  const [loading, setLoading] = useState(true);
  const [forecast, setForecast] = useState<any[]>([]);

  useEffect(() => {
    fetchWeather();
  }, [location]);

  const fetchWeather = async () => {
    setLoading(true);
    try {
      // Get coordinates
      const coords = LOCATION_COORDS[location] || LOCATION_COORDS["Dubai"];

      // Open-Meteo API - completely free, no key needed
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,surface_pressure,visibility,is_day&hourly=temperature_2m,weather_code&forecast_days=1&timezone=auto`;

      const res = await fetch(url);
      const data = await res.json();

      const current = data.current;
      const weatherCode = current.weather_code;
      const description = WMO_CODES[weatherCode] || "clear sky";

      const weatherInfo: WeatherData = {
        temp: Math.round(current.temperature_2m),
        feels_like: Math.round(current.apparent_temperature),
        humidity: current.relative_humidity_2m,
        wind_speed: Math.round(current.wind_speed_10m),
        visibility: current.visibility || 10000,
        pressure: Math.round(current.surface_pressure),
        description,
        city: coords.name,
        is_day: current.is_day,
      };

      setWeather(weatherInfo);
      setImpact(getConstructionImpact(weatherInfo));

      // Build hourly forecast
      const now = new Date();
      const hourlyForecast = [];
      for (let i = 0; i < 5; i++) {
        const idx = now.getHours() + i;
        if (data.hourly && idx < data.hourly.temperature_2m.length) {
          const forecastHour = new Date(now);
          forecastHour.setHours(now.getHours() + i);
          hourlyForecast.push({
            time: forecastHour.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" }),
            temp: Math.round(data.hourly.temperature_2m[idx]),
            description: WMO_CODES[data.hourly.weather_code[idx]] || "clear",
          });
        }
      }
      setForecast(hourlyForecast);

    } catch (err) {
      console.error("Weather fetch failed:", err);
      // Fallback mock data
      const mock: WeatherData = {
        temp: 32, feels_like: 36, humidity: 55,
        wind_speed: 14, visibility: 8000, pressure: 1012,
        description: "partly cloudy", city: location, is_day: 1,
      };
      setWeather(mock);
      setImpact(getConstructionImpact(mock));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-4 flex items-center justify-center h-32">
        <div className="animate-spin w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!weather) return null;

  const impactColors = {
    low: "border-emerald-500/30 bg-emerald-500/5 text-emerald-400",
    medium: "border-orange-500/30 bg-orange-500/5 text-orange-400",
    high: "border-red-500/30 bg-red-500/5 text-red-400",
    critical: "border-red-600/50 bg-red-600/10 text-red-300",
  };

  if (compact) {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-card border border-border">
        {getWeatherIcon(weather.description, "w-5 h-5")}
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">{weather.temp}°C · {weather.city}</p>
          <p className="text-xs text-muted-foreground capitalize">{weather.description}</p>
        </div>
        <div className={`px-2 py-0.5 rounded-full text-xs border ${impactColors[impact?.level || "low"]}`}>
          {impact?.level}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Main Weather Card */}
      <div className={`rounded-2xl p-6 ${
        weather.is_day
          ? "bg-gradient-to-br from-blue-500/20 via-sky-500/10 to-slate-900"
          : "bg-gradient-to-br from-slate-800 via-blue-900/20 to-slate-900"
      } border border-blue-500/20`}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-bold text-foreground">{weather.city}</p>
            <p className="text-muted-foreground capitalize text-sm mb-3">{weather.description}</p>
            <div className="flex items-end gap-1">
              <p className="text-6xl font-bold text-foreground">{weather.temp}°</p>
              <p className="text-2xl text-muted-foreground mb-2">C</p>
            </div>
            <p className="text-sm text-muted-foreground mt-1">Feels like {weather.feels_like}°C</p>
          </div>
          <motion.div
            animate={{ y: [0, -5, 0] }}
            transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
          >
            {getWeatherIcon(weather.description, "w-20 h-20")}
          </motion.div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          {[
            { icon: Droplets, label: "Humidity", value: `${weather.humidity}%`, color: "text-blue-400" },
            { icon: Wind, label: "Wind", value: `${weather.wind_speed} km/h`, color: "text-emerald-400" },
            { icon: Eye, label: "Visibility", value: `${(weather.visibility / 1000).toFixed(1)} km`, color: "text-purple-400" },
            { icon: Gauge, label: "Pressure", value: `${weather.pressure}`, color: "text-orange-400" },
          ].map((stat, i) => (
            <div key={i} className="bg-black/20 rounded-xl p-2.5 text-center">
              <stat.icon className={`w-4 h-4 ${stat.color} mx-auto mb-1`} />
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-xs font-medium text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Construction Impact */}
      {impact && (
        <div className={`rounded-2xl border p-4 ${impactColors[impact.level]}`}>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <p className="text-sm font-semibold">{impact.message}</p>
          </div>
          <div className="space-y-1.5">
            {impact.affected.map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0 mt-1.5" />
                <p className="text-xs">{item}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hourly Forecast */}
      {forecast.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-sm font-medium text-foreground mb-3">Next 5 Hours</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {forecast.map((f, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5 bg-secondary/50 rounded-xl p-3 min-w-[60px]">
                <p className="text-xs text-muted-foreground whitespace-nowrap">{f.time}</p>
                {getWeatherIcon(f.description, "w-5 h-5")}
                <p className="text-sm font-medium text-foreground">{f.temp}°</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}