import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const alt = "XYVOO — Software that runs your business, not the other way round";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const logoData = await readFile(
    join(process.cwd(), "public/images/xyvoo-logo.png"),
  );
  const logoSrc = `data:image/png;base64,${logoData.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "88px",
          background: "#f8fafc",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} width={300} height={120} alt="" />
        <div
          style={{
            marginTop: 48,
            fontSize: 54,
            fontWeight: 800,
            color: "#000d1f",
            lineHeight: 1.15,
            maxWidth: 920,
            letterSpacing: "-0.02em",
          }}
        >
          Software that runs your business — not the other way round.
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 30,
            color: "#007edf",
            fontWeight: 700,
          }}
        >
          Hotel Management System &amp; Online Storefront
        </div>
      </div>
    ),
    { ...size },
  );
}
