/**
 * Foundation Alpha waitlist share banner — minimal known-working version.
 *
 * 1216×768 (19:12). Caryatid background. Glass card on the left with the
 * PFP + @handle + member serial. Brand statement floats on the right.
 * Gold corner brackets frame the canvas.
 *
 * No <svg><image> nesting — PFP is a plain rounded <img>. No complex
 * filters or gradients on raster elements.
 */

import { readFileSync } from "fs";
import path from "path";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WIDTH = 1216;
const HEIGHT = 768;

const NAVY_DARK = "#040e1a";
const GOLD_500 = "#b8960c";
const GOLD_400 = "#d4af37";
const OFF_WHITE = "#f8fafc";

function loadPublicAsDataUrl(rel: string, mime: string): string {
  const buf = readFileSync(path.join(process.cwd(), "public", rel));
  return `data:${mime};base64,${buf.toString("base64")}`;
}

let _bgDataUrl: string | null = null;
function getBgDataUrl(): string {
  if (!_bgDataUrl) _bgDataUrl = loadPublicAsDataUrl("assets/art/caryatid_colonnade.png", "image/png");
  return _bgDataUrl;
}

let _logoDataUrl: string | null = null;
function getLogoDataUrl(): string {
  if (!_logoDataUrl) _logoDataUrl = loadPublicAsDataUrl("partners/rounded-nobg.png", "image/png");
  return _logoDataUrl;
}

type LoadedFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 500;
  style: "normal" | "italic";
};
let _fontsCache: LoadedFont[] | null = null;

function loadFonts(): LoadedFont[] {
  if (_fontsCache) return _fontsCache;
  const fontPath = (rel: string) => path.join(process.cwd(), "public/fonts", rel);
  const readTtf = (file: string): ArrayBuffer => {
    const buf = readFileSync(fontPath(file));
    const ab = new ArrayBuffer(buf.byteLength);
    new Uint8Array(ab).set(buf);
    return ab;
  };
  _fontsCache = [
    { name: "Cormorant Garamond", data: readTtf("CormorantGaramond-Regular.ttf"), weight: 400, style: "normal" },
    { name: "Cormorant Garamond", data: readTtf("CormorantGaramond-Medium.ttf"),  weight: 500, style: "normal" },
    { name: "Cormorant Garamond", data: readTtf("CormorantGaramond-Italic.ttf"),  weight: 400, style: "italic" },
    { name: "DM Mono",            data: readTtf("DMMono-Medium.ttf"),              weight: 500, style: "normal" },
  ];
  return _fontsCache;
}

async function loadPfpAsDataUrl(rawUrl: string | null): Promise<string | null> {
  if (!rawUrl) return null;
  try {
    const upgraded = rawUrl.replace(/_normal(\.\w+)$/, "$1");
    for (const candidate of [upgraded, rawUrl]) {
      const res = await fetch(candidate, {
        headers: { "User-Agent": "Mozilla/5.0 FoundationBanner/1.0" },
        cache: "force-cache",
      });
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      const contentType = res.headers.get("content-type") ?? "image/jpeg";
      return `data:${contentType};base64,${Buffer.from(buf).toString("base64")}`;
    }
    return null;
  } catch {
    return null;
  }
}

function handleFontSize(handle: string): number {
  if (handle.length <= 9) return 56;
  if (handle.length <= 13) return 48;
  if (handle.length <= 17) return 40;
  return 34;
}

/** Member tier label based on waitlist position.
 *  1–500   → ALPHA MEMBER (the elite cohort)
 *  501+    → MEMBER       (still on the waitlist, no flex) */
function memberTier(position: number): string {
  if (position >= 1 && position <= 500) return "ALPHA MEMBER";
  return "MEMBER";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const handle = (url.searchParams.get("handle") || "user")
    .replace(/^@/, "")
    .slice(0, 24);
  const pfpUrlParam =
    url.searchParams.get("pfp_url") || url.searchParams.get("pfp");
  const numberRaw =
    url.searchParams.get("number") || url.searchParams.get("n") || "1";
  const paddedNumber = numberRaw.replace(/\D/g, "").padStart(3, "0").slice(-5);
  const tierLabel = memberTier(parseInt(numberRaw.replace(/\D/g, ""), 10) || 0);

  const fonts = loadFonts();
  const pfpDataUrl = await loadPfpAsDataUrl(pfpUrlParam);
  const bgDataUrl = getBgDataUrl();
  const logoDataUrl = getLogoDataUrl();
  const hFontSize = handleFontSize(handle);

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          position: "relative",
          backgroundColor: NAVY_DARK,
          fontFamily: "DM Mono",
        }}
      >
        {/* Caryatid background */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bgDataUrl}
          alt=""
          width={WIDTH}
          height={HEIGHT}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: WIDTH,
            height: HEIGHT,
            objectFit: "cover",
          }}
        />
        {/* Navy tint */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: WIDTH,
            height: HEIGHT,
            background:
              "linear-gradient(135deg, rgba(29,78,110,0.6) 0%, rgba(12,35,64,0.78) 45%, rgba(4,14,26,0.9) 100%)",
            display: "flex",
          }}
        />
        {/* Vignette */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: WIDTH,
            height: HEIGHT,
            background:
              "radial-gradient(ellipse at center, rgba(0,0,0,0) 35%, rgba(0,0,0,0.55) 100%)",
            display: "flex",
          }}
        />

        {/* Top-left corner bracket */}
        <div style={{ position: "absolute", top: 44, left: 44, width: 110, height: 2, background: GOLD_500, display: "flex" }} />
        <div style={{ position: "absolute", top: 44, left: 44, width: 2, height: 110, background: GOLD_500, display: "flex" }} />
        {/* Bottom-right corner bracket */}
        <div style={{ position: "absolute", bottom: 44, right: 44, width: 110, height: 2, background: GOLD_500, display: "flex" }} />
        <div style={{ position: "absolute", bottom: 44, right: 44, width: 2, height: 110, background: GOLD_500, display: "flex" }} />

        {/* Vertical glass card — LEFT */}
        <div
          style={{
            position: "absolute",
            left: 96,
            top: 96,
            width: 380,
            height: 576,
            borderRadius: 22,
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.025) 100%)",
            border: "1.5px solid rgba(255,255,255,0.32)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px 28px",
            boxShadow:
              "0 28px 70px rgba(0,0,0,0.55), inset 0 1.5px 0 rgba(255,255,255,0.45)",
          }}
        >
          {/* PFP — plain rounded img with gold ring via box-shadow */}
          {pfpDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pfpDataUrl}
              alt=""
              width={200}
              height={200}
              style={{
                width: 200,
                height: 200,
                borderRadius: 100,
                objectFit: "cover",
                border: `3px solid ${GOLD_500}`,
                boxShadow: `0 0 0 10px rgba(184,150,12,0.18), 0 0 30px rgba(184,150,12,0.3)`,
              }}
            />
          ) : (
            <div
              style={{
                width: 200,
                height: 200,
                borderRadius: 100,
                background: "#6d28d9",
                border: `3px solid ${GOLD_500}`,
                display: "flex",
              }}
            />
          )}

          {/* Hairline */}
          <div
            style={{
              display: "flex",
              marginTop: 28,
              width: 80,
              height: 1,
              background: "rgba(184,150,12,0.5)",
            }}
          />

          {/* Handle */}
          <div
            style={{
              display: "flex",
              marginTop: 20,
              fontSize: hFontSize,
              color: OFF_WHITE,
              fontFamily: "Cormorant Garamond",
              fontWeight: 400,
              lineHeight: 1,
            }}
          >
            {`@${handle}`}
          </div>

          {/* Tier label — ALPHA MEMBER (first 500) / MEMBER otherwise */}
          <div
            style={{
              display: "flex",
              marginTop: 20,
              fontSize: 17,
              color: "rgba(184,150,12,0.85)",
              fontFamily: "DM Mono",
              fontWeight: 500,
              letterSpacing: 7,
              lineHeight: 1,
            }}
          >
            {tierLabel}
          </div>

          {/* Serial */}
          <div
            style={{
              display: "flex",
              marginTop: 12,
              fontSize: 38,
              color: GOLD_400,
              fontFamily: "DM Mono",
              fontWeight: 500,
              letterSpacing: 5,
              lineHeight: 1,
            }}
          >
            {`No. ${paddedNumber}`}
          </div>
        </div>

        {/* Brand statement — RIGHT, no card */}
        <div
          style={{
            position: "absolute",
            left: 520,
            top: 96,
            width: 600,
            height: 576,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "0 40px",
          }}
        >
          {/* Logo */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoDataUrl}
            alt="Foundation"
            width={56}
            height={56}
            style={{ width: 56, height: 56 }}
          />

          {/* FOUNDATION wordmark */}
          <div
            style={{
              display: "flex",
              marginTop: 14,
              fontSize: 18,
              color: GOLD_400,
              fontFamily: "DM Mono",
              fontWeight: 500,
              letterSpacing: 8,
            }}
          >
            FOUNDATION
          </div>

          {/* Tagline */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 36,
              lineHeight: 1.08,
            }}
          >
            <div
              style={{
                display: "flex",
                fontFamily: "Cormorant Garamond",
                fontStyle: "italic",
                fontWeight: 400,
                fontSize: 46,
                color: OFF_WHITE,
              }}
            >
              The Financing Layer
            </div>
            <div
              style={{
                display: "flex",
                fontFamily: "Cormorant Garamond",
                fontStyle: "italic",
                fontWeight: 400,
                fontSize: 46,
                color: OFF_WHITE,
              }}
            >
              for the AI Super-Cycle.
            </div>
          </div>

          {/* Hairline */}
          <div
            style={{
              display: "flex",
              marginTop: 42,
              width: 60,
              height: 1,
              background: "rgba(184,150,12,0.5)",
            }}
          />

          {/* Product caption */}
          <div
            style={{
              display: "flex",
              marginTop: 24,
              fontSize: 17,
              color: GOLD_400,
              fontFamily: "DM Mono",
              fontWeight: 500,
              letterSpacing: 7,
            }}
          >
            FOUNDATION COMPUTE YIELD
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 12,
              fontSize: 14,
              color: "rgba(184,150,12,0.65)",
              fontFamily: "DM Mono",
              fontWeight: 500,
              letterSpacing: 6,
            }}
          >
            EST. MMXXVI
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, immutable, no-transform, max-age=31536000",
      },
    },
  );
}
