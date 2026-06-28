import { NextRequest, NextResponse } from "next/server";
import { countries } from "countries-list";
import type { LocationCityOption, LocationLookupKind, LocationNominatimRow } from "@/types";

function resolveCountryCode(countryInput: string | null) {
  const countryMap = countries as Record<string, { name: string }>;
  if (!countryInput) return "";
  const raw = countryInput.trim();
  if (!raw) return "";

  const upper = raw.toUpperCase();
  if (countryMap[upper]) return upper.toLowerCase();

  const found = Object.entries(countryMap).find(([, data]) => data.name.toLowerCase() === raw.toLowerCase());
  return found ? found[0].toLowerCase() : "";
}

function mapCityResults(rows: LocationNominatimRow[]) {
  const accepted = new Set(["city", "town", "village", "municipality", "suburb", "neighbourhood", "hamlet", "quarter", "district", "borough"]);
  const mapped = rows
    .filter((r) => accepted.has(r.type || "") || accepted.has(r.addresstype || ""))
    .map((r) => {
      const label =
        r.name ||
        r.address?.suburb ||
        r.address?.neighbourhood ||
        r.address?.quarter ||
        r.address?.city_district ||
        r.address?.city ||
        r.address?.town ||
        r.address?.village;

      return label ? { name: label, display: r.display_name } : null;
    })
    .filter((row): row is LocationCityOption => row !== null);

  return mapped.filter((city, i, arr) => arr.findIndex((x) => x.name.toLowerCase() === city.name.toLowerCase()) === i);
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  const type = (request.nextUrl.searchParams.get("type") || "city") as LocationLookupKind;
  const country = request.nextUrl.searchParams.get("country");

  if (!q) return NextResponse.json({ results: [] });
  if (type !== "city" && type !== "address") return NextResponse.json({ error: "Invalid type" }, { status: 400 });

  const minLength = type === "city" ? 2 : 4;
  if (q.length < minLength) return NextResponse.json({ results: [] });

  const countryCode = resolveCountryCode(country);
  const cc = countryCode ? `&countrycodes=${countryCode}` : "";
  const limit = type === "city" ? 8 : 6;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}${cc}&format=json&addressdetails=1&limit=${limit}`;

  try {
    const res = await fetch(url, {
      headers: {
        "Accept-Language": "en",
        "User-Agent": "xyvoo-hms/1.0 (registration lookup)",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Location lookup failed", results: [] }, { status: 502 });
    }

    const data = (await res.json()) as LocationNominatimRow[];
    if (type === "city") {
      return NextResponse.json({ results: mapCityResults(data) });
    }

    return NextResponse.json({
      results: data.map((r) => ({ display_name: r.display_name })),
    });
  } catch {
    return NextResponse.json({ error: "Location lookup failed", results: [] }, { status: 502 });
  }
}
