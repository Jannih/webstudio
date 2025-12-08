import { z } from "zod";

const ResourceId = z.string();

const Method = z.union([
  z.literal("get"),
  z.literal("post"),
  z.literal("put"),
  z.literal("delete"),
]);

/**
 * Proxy configuration for server-side resource fetching
 *
 * When enabled, the resource will be fetched through the Webstudio server,
 * allowing access to httpOnly cookies and adding them to request headers.
 *
 * This is essential for authenticated API calls where:
 * - The auth token is stored in an httpOnly cookie (XSS-safe)
 * - The API expects the token in an Authorization header
 * - CORS prevents direct browser-to-API calls
 */
export const ResourceProxy = z.object({
  // Enable server-side proxying for this resource
  enabled: z.boolean().default(false),
  // Include all cookies in the proxied request
  includeCookies: z.boolean().default(true),
  // Map a specific cookie value to a request header
  // e.g., access_token cookie → Authorization: Bearer {token}
  cookieToHeader: z
    .object({
      // The cookie name to read (e.g., "access_token")
      cookieName: z.string(),
      // The header name to set (e.g., "Authorization")
      headerName: z.string(),
      // Optional prefix for the value (e.g., "Bearer ")
      prefix: z.string().optional(),
    })
    .optional(),
});

export type ResourceProxy = z.infer<typeof ResourceProxy>;

export const Resource = z.object({
  id: ResourceId,
  name: z.string(),
  control: z.optional(z.union([z.literal("system"), z.literal("graphql")])),
  method: Method,
  // expression
  url: z.string(),
  searchParams: z
    .array(
      z.object({
        name: z.string(),
        // expression
        value: z.string(),
      })
    )
    .optional(),
  headers: z.array(
    z.object({
      name: z.string(),
      // expression
      value: z.string(),
    })
  ),
  // expression
  body: z.optional(z.string()),
  // Proxy configuration for server-side fetching with cookie access
  proxy: ResourceProxy.optional(),
});

export type Resource = z.infer<typeof Resource>;

// evaluated variant of resource
export const ResourceRequest = z.object({
  name: z.string(),
  method: Method,
  url: z.string(),
  searchParams: z.array(
    z.object({
      name: z.string(),
      // can be string or object which should be serialized
      value: z.unknown(),
    })
  ),
  headers: z.array(
    z.object({
      name: z.string(),
      // can be string or object which should be serialized
      value: z.unknown(),
    })
  ),
  body: z.optional(z.unknown()),
});

export type ResourceRequest = z.infer<typeof ResourceRequest>;

export const Resources = z.map(ResourceId, Resource);

export type Resources = z.infer<typeof Resources>;
