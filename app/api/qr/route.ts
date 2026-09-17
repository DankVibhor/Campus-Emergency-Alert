import QRCode from "qrcode";

export const runtime = "nodejs";

/**
 * Renders a QR PNG that deep-links into the report form with the block and
 * floor pre-selected: /report?campus=<id>&location=<id>
 *
 * The encoded origin is always the canonical public URL, never the current
 * request host, because per-deployment Vercel URLs sit behind SSO and a
 * printed code pointing at one would be unusable.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const campus = url.searchParams.get("campus");
  const location = url.searchParams.get("location");
  const size = Math.min(
    1200,
    Math.max(160, Number(url.searchParams.get("size")) || 512),
  );

  if (!campus) {
    return new Response("campus query parameter is required", { status: 400 });
  }

  const origin = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    `${req.headers.get("x-forwarded-proto") ?? "https"}://${
      req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? ""
    }`
  ).replace(/\/$/, "");

  const target = new URL(`${origin}/report`);
  target.searchParams.set("campus", campus);
  if (location) target.searchParams.set("location", location);

  try {
    const png = await QRCode.toBuffer(target.toString(), {
      type: "png",
      width: size,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#0f172a", light: "#ffffff" },
    });

    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        // Printed codes never change for a given location.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    return new Response(
      `Could not generate QR: ${err instanceof Error ? err.message : "unknown"}`,
      { status: 500 },
    );
  }
}
