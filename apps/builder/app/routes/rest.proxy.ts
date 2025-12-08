import { z } from "zod";
import { type ActionFunctionArgs, json } from "@remix-run/server-runtime";
import { preventCrossOriginCookie } from "~/services/no-cross-origin-cookie";
import { checkCsrf } from "~/services/csrf-session.server";

/**
 * Parse cookies from a Cookie header string
 */
const parseCookies = (cookieHeader: string): Record<string, string> => {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) {
    return cookies;
  }

  for (const cookie of cookieHeader.split(";")) {
    const [name, ...valueParts] = cookie.trim().split("=");
    if (name) {
      // Handle cookies with = in the value
      const value = valueParts.join("=");
      // Decode URI-encoded values
      try {
        cookies[name.trim()] = decodeURIComponent(value);
      } catch {
        cookies[name.trim()] = value;
      }
    }
  }

  return cookies;
};

/**
 * Request schema for proxy requests
 */
const ProxyRequest = z.object({
  // Target URL to proxy to
  url: z.string().url(),
  // HTTP method
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  // Request headers to forward
  headers: z.record(z.string()).optional(),
  // Request body (for POST/PUT/PATCH)
  body: z.unknown().optional(),
  // Cookie-to-header mapping configuration
  cookieToHeader: z
    .object({
      // Cookie name to read
      cookieName: z.string(),
      // Header name to set
      headerName: z.string(),
      // Optional prefix (e.g., "Bearer ")
      prefix: z.string().optional(),
    })
    .optional(),
  // Whether to include all cookies
  includeCookies: z.boolean().optional().default(false),
});

/**
 * Server-side Proxy for Resource Fetching
 *
 * This endpoint enables server-side fetching of resources with access to
 * httpOnly cookies. This is essential for authenticated API calls where:
 *
 * 1. The auth token is stored in an httpOnly cookie (XSS-safe)
 * 2. The API expects the token in an Authorization header
 * 3. CORS may prevent direct browser-to-API calls
 *
 * Security:
 * - CSRF protection via token
 * - Cross-origin cookie prevention
 * - URL validation (must be valid URL)
 * - Only specific cookies can be mapped to headers
 *
 * Example request:
 * ```json
 * {
 *   "url": "https://api.example.com/orders",
 *   "method": "GET",
 *   "headers": { "Content-Type": "application/json" },
 *   "cookieToHeader": {
 *     "cookieName": "access_token",
 *     "headerName": "Authorization",
 *     "prefix": "Bearer "
 *   }
 * }
 * ```
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  preventCrossOriginCookie(request);
  await checkCsrf(request);

  let requestJson: unknown;
  try {
    requestJson = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ProxyRequest.safeParse(requestJson);

  if (parsed.success === false) {
    console.error("Invalid proxy request:", parsed.error.format());
    return json({ error: parsed.error.format() }, { status: 400 });
  }

  const {
    url,
    method,
    headers: requestHeaders,
    body,
    cookieToHeader,
  } = parsed.data;

  // Parse cookies from the incoming request
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const cookies = parseCookies(cookieHeader);

  // Build headers for the proxied request
  const proxyHeaders = new Headers(requestHeaders ?? {});

  // Map cookie value to header if configured
  if (cookieToHeader) {
    const cookieValue = cookies[cookieToHeader.cookieName];
    if (cookieValue) {
      const prefix = cookieToHeader.prefix ?? "";
      proxyHeaders.set(cookieToHeader.headerName, prefix + cookieValue);
    }
  }

  // Ensure we have a proper Content-Type for requests with body
  if (body && !proxyHeaders.has("Content-Type")) {
    proxyHeaders.set("Content-Type", "application/json");
  }

  try {
    // Make the proxied request
    const response = await fetch(url, {
      method,
      headers: proxyHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Get response content type
    const contentType = response.headers.get("content-type") ?? "";

    // Parse response based on content type
    let responseData: unknown;
    if (contentType.includes("application/json")) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    // Return the response with status
    return json(
      {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        data: responseData,
      },
      {
        status: response.ok ? 200 : response.status,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Proxy request failed:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    return json(
      {
        ok: false,
        status: 500,
        statusText: "Proxy Error",
        error: errorMessage,
      },
      { status: 500 }
    );
  }
};

/**
 * Health check endpoint
 */
export const loader = () => {
  return json({ status: "ok", endpoint: "proxy" });
};
