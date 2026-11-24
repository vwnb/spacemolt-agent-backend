export function corsHeaders(
  allowedOrigin: string,
  originHeader: string | string[] | undefined,
): Record<string, string> {
  if (!allowedOrigin) return {};
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
  if (!origin || origin !== allowedOrigin) return {};
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    Vary: "Origin",
  };
}
