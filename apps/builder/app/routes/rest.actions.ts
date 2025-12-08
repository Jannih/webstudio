import { z } from "zod";
import { type ActionFunctionArgs, data } from "@remix-run/server-runtime";
import {
  ServerAction,
  ActionContext,
  executeActionChain,
} from "@webstudio-is/sdk";
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
      cookies[name] = valueParts.join("=");
    }
  }

  return cookies;
};

/**
 * Request schema for action execution
 */
const ActionRequest = z.object({
  // Actions to execute (as a map for lookup)
  actions: z.array(ServerAction),
  // IDs of actions to execute (in order)
  executeIds: z.array(z.string()),
  // Optional form data
  formData: z.record(z.unknown()).optional(),
  // Optional variables state
  variables: z.record(z.unknown()).optional(),
});

/**
 * Server-side action execution endpoint
 *
 * This endpoint handles:
 * - SetCookie actions (setting httpOnly cookies)
 * - DeleteCookie actions
 * - Redirect actions
 * - CallApi actions (server-to-server API calls with cookie forwarding)
 * - SetVariable actions
 *
 * Security:
 * - CSRF protection via token
 * - Cross-origin cookie prevention
 * - httpOnly cookies for auth tokens
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  preventCrossOriginCookie(request);
  await checkCsrf(request);

  const requestJson = await request.json();
  const parsed = ActionRequest.safeParse(requestJson);

  if (parsed.success === false) {
    console.error("Invalid action request:", parsed.error.format());
    throw data(parsed.error.format(), { status: 400 });
  }

  const { actions, executeIds, formData, variables } = parsed.data;

  // Build actions map for lookup
  const actionsMap = new Map<string, ServerAction>();
  for (const action of actions) {
    actionsMap.set(action.id, action);
  }

  // Parse cookies from request
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const cookies = parseCookies(cookieHeader);

  // Build action context
  const context: ActionContext = {
    cookies,
    variables: variables ?? {},
    formData,
  };

  // Execute action chain
  const result = await executeActionChain(actionsMap, executeIds, context);

  // Handle redirect - return JSON with redirect URL instead of HTTP redirect
  // This allows the client to control the redirect (e.g., redirect parent window from iframe)
  if (result.redirect) {
    const headers = new Headers();
    headers.set("Content-Type", "application/json");

    // Set cookies before returning
    if (result.setCookies) {
      for (const cookie of result.setCookies) {
        const parts = [`${cookie.name}=${cookie.value}`];

        if (cookie.options.httpOnly) {
          parts.push("HttpOnly");
        }
        if (cookie.options.secure) {
          parts.push("Secure");
        }
        if (cookie.options.sameSite) {
          parts.push(`SameSite=${cookie.options.sameSite}`);
        }
        if (cookie.options.path) {
          parts.push(`Path=${cookie.options.path}`);
        }
        if (cookie.options.maxAge !== undefined) {
          parts.push(`Max-Age=${cookie.options.maxAge}`);
        }

        headers.append("Set-Cookie", parts.join("; "));
      }
    }

    // Return redirect info in JSON body so client can handle it
    return new Response(
      JSON.stringify({
        success: true,
        redirect: {
          url: result.redirect.url,
          status: result.redirect.status,
        },
      }),
      {
        status: 200, // Return 200 so client can read the body
        headers,
      }
    );
  }

  // Build response headers with cookies
  const headers = new Headers();
  headers.set("Content-Type", "application/json");

  if (result.setCookies) {
    for (const cookie of result.setCookies) {
      const parts = [`${cookie.name}=${cookie.value}`];

      if (cookie.options.httpOnly) {
        parts.push("HttpOnly");
      }
      if (cookie.options.secure) {
        parts.push("Secure");
      }
      if (cookie.options.sameSite) {
        parts.push(`SameSite=${cookie.options.sameSite}`);
      }
      if (cookie.options.path) {
        parts.push(`Path=${cookie.options.path}`);
      }
      if (cookie.options.maxAge !== undefined) {
        parts.push(`Max-Age=${cookie.options.maxAge}`);
      }

      headers.append("Set-Cookie", parts.join("; "));
    }
  }

  return new Response(
    JSON.stringify({
      success: result.success,
      data: result.data,
      error: result.error,
      variableUpdates: result.variableUpdates,
    }),
    {
      status: result.success ? 200 : 400,
      headers,
    }
  );
};

/**
 * GET endpoint to check authentication status
 *
 * Returns the current cookie state (without values for httpOnly cookies)
 */
export const loader = async ({ request }: ActionFunctionArgs) => {
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const cookies = parseCookies(cookieHeader);

  // Return cookie names only (for httpOnly security)
  const cookieNames = Object.keys(cookies);

  return {
    authenticated: cookies["access_token"] !== undefined,
    cookies: cookieNames,
  };
};
