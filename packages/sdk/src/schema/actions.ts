import { z } from "zod";

/**
 * Server-side Actions for Authentication and Data Operations
 *
 * These actions are executed on the server (not client-side) to enable:
 * - httpOnly cookie management (secure authentication)
 * - Server-proxied API calls (with cookie forwarding)
 *
 */

// Action identifiers
export const ActionId = z.string();
export type ActionId = z.infer<typeof ActionId>;

// Cookie SameSite policy
export const CookieSameSite = z.enum(["strict", "lax", "none"]);
export type CookieSameSite = z.infer<typeof CookieSameSite>;

/**
 * Comparison operators for conditional branching
 */
export const ComparisonOperator = z.enum([
  "equals", // ==
  "notEquals", // !=
  "contains", // string contains or array includes
  "notContains",
  "startsWith",
  "endsWith",
  "greaterThan", // >
  "lessThan", // <
  "greaterThanOrEquals", // >=
  "lessThanOrEquals", // <=
  "isEmpty", // null, undefined, empty string, empty array
  "isNotEmpty",
  "isTrue", // truthy value
  "isFalse", // falsy value
  "exists", // not null/undefined
  "notExists",
]);
export type ComparisonOperator = z.infer<typeof ComparisonOperator>;

/**
 * Condition for conditional action execution
 *
 * Allows branching based on response values, form data, cookies, or variables.
 * Examples:
 * - Execute action only if {{response.verified}} equals "true"
 * - Execute action if {{response.status}} equals "pending"
 * - Execute action if {{cookies.access_token}} exists
 */
export const ActionCondition = z.object({
  // Left side of comparison - expression like {{response.verified}}
  leftOperand: z.string(),
  // Comparison operator
  operator: ComparisonOperator,
  // Right side of comparison - expression or literal value (optional for unary operators)
  rightOperand: z.string().optional(),
});
export type ActionCondition = z.infer<typeof ActionCondition>;

/**
 * Conditional action reference
 * Execute an action only if all conditions are met
 */
export const ConditionalAction = z.object({
  // Action ID to execute
  actionId: ActionId,
  // Conditions that must ALL be true (AND logic)
  conditions: z.array(ActionCondition).optional(),
});
export type ConditionalAction = z.infer<typeof ConditionalAction>;

// Base action properties shared by all action types
const baseAction = {
  id: ActionId,
  // Actions to execute on success (simple list - all execute)
  onSuccess: z.array(ActionId).optional(),
  // Actions to execute on error (simple list - all execute)
  onError: z.array(ActionId).optional(),
  // Conditional actions - execute based on response/variable values
  // This enables branching like "if response.verified == false, redirect to /verify"
  conditionalActions: z.array(ConditionalAction).optional(),
};

/**
 * Set HttpOnly Cookie Action
 *
 * Sets a secure httpOnly cookie on the server.
 * Used for storing authentication tokens securely.
 *
 * Example use case:
 * - After successful login, store the access token
 * - Value can be an expression: {{response.token}}
 */
export const SetCookieAction = z.object({
  ...baseAction,
  type: z.literal("setCookie"),
  // Cookie name (e.g., "access_token")
  name: z.string(),
  // Cookie value - can be an expression like {{response.token}}
  value: z.string(),
  // Expiration time in seconds (default: 7 days = 604800)
  expiresIn: z.number().optional().default(604800),
  // httpOnly prevents JavaScript access (XSS protection)
  httpOnly: z.boolean().optional().default(true),
  // secure ensures HTTPS only
  secure: z.boolean().optional().default(true),
  // SameSite policy for CSRF protection
  sameSite: CookieSameSite.optional().default("lax"),
  // Cookie path (default: "/")
  path: z.string().optional().default("/"),
  // Include subdomains
  includeSubdomains: z.boolean().optional().default(false),
});
export type SetCookieAction = z.infer<typeof SetCookieAction>;

/**
 * Delete Cookie Action
 *
 * Removes a cookie from the browser.
 * Used for logout functionality.
 */
export const DeleteCookieAction = z.object({
  ...baseAction,
  type: z.literal("deleteCookie"),
  // Cookie name to delete
  name: z.string(),
  // Path must match the cookie's path
  path: z.string().optional().default("/"),
});
export type DeleteCookieAction = z.infer<typeof DeleteCookieAction>;

/**
 * Redirect Action
 *
 * Redirects the user to a different URL.
 * Can use expressions for dynamic URLs.
 *
 * Example use cases:
 * - Redirect to /account after login
 * - Redirect to /login when not authenticated
 */
export const RedirectAction = z.object({
  ...baseAction,
  type: z.literal("redirect"),
  // Target URL - can be an expression like {{variables.redirectUrl}}
  url: z.string(),
  // HTTP status code (default: 302 temporary redirect)
  status: z.number().optional().default(302),
});
export type RedirectAction = z.infer<typeof RedirectAction>;

/**
 * Call API Action
 *
 * Makes an HTTP request from the server.
 * This allows including httpOnly cookies in the request.
 *
 * Key features:
 * - Server-side execution (cookies accessible)
 * - Can map cookies to Authorization headers
 * - CORS bypass (server-to-server)
 */
export const CallApiAction = z.object({
  ...baseAction,
  type: z.literal("callApi"),
  // API endpoint URL - can be an expression
  url: z.string(),
  // HTTP method
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  // Request headers - values can be expressions
  headers: z
    .array(
      z.object({
        name: z.string(),
        value: z.string(),
      })
    )
    .optional(),
  // Request body - can be an expression
  body: z.string().optional(),
  // Automatically include cookies in request
  includeCredentials: z.boolean().optional().default(true),
  // Map a cookie value to a header (e.g., cookie → Authorization: Bearer {cookie})
  cookieToHeader: z
    .object({
      // Cookie name to read
      cookieName: z.string(),
      // Header name to set
      headerName: z.string(),
      // Prefix for the value (e.g., "Bearer ")
      prefix: z.string().optional(),
    })
    .optional(),
  // Variable name to store the response
  responseVariable: z.string().optional(),
});
export type CallApiAction = z.infer<typeof CallApiAction>;

/**
 * Set Variable Action
 *
 * Sets a Webstudio variable value.
 * Used for storing form data, error messages, etc.
 */
export const SetVariableAction = z.object({
  ...baseAction,
  type: z.literal("setVariable"),
  // Variable name (references a DataSource)
  variableName: z.string(),
  // Value to set - can be an expression like {{response.user}}
  value: z.string(),
});
export type SetVariableAction = z.infer<typeof SetVariableAction>;

/**
 * Union of all server-side action types
 */
export const ServerAction = z.discriminatedUnion("type", [
  SetCookieAction,
  DeleteCookieAction,
  RedirectAction,
  CallApiAction,
  SetVariableAction,
]);
export type ServerAction = z.infer<typeof ServerAction>;

/**
 * Map of actions by ID for normalized storage
 */
export const ServerActions = z.map(ActionId, ServerAction);
export type ServerActions = z.infer<typeof ServerActions>;

/**
 * Action execution context
 * Passed to the action executor on the server
 */
export const ActionContext = z.object({
  // Current cookies from the request
  cookies: z.record(z.string()),
  // Current variables state
  variables: z.record(z.unknown()),
  // Form data (if triggered by form submit)
  formData: z.record(z.unknown()).optional(),
  // Response from previous CallApiAction
  response: z.unknown().optional(),
});
export type ActionContext = z.infer<typeof ActionContext>;

/**
 * Result of action execution
 */
export const ActionResult = z.object({
  success: z.boolean(),
  // Data returned by the action (e.g., API response)
  data: z.unknown().optional(),
  // Error message if failed
  error: z.string().optional(),
  // Cookies to set on the response
  setCookies: z
    .array(
      z.object({
        name: z.string(),
        value: z.string(),
        options: z.object({
          httpOnly: z.boolean().optional(),
          secure: z.boolean().optional(),
          sameSite: CookieSameSite.optional(),
          path: z.string().optional(),
          maxAge: z.number().optional(),
          expires: z.date().optional(),
        }),
      })
    )
    .optional(),
  // Cookies to delete
  deleteCookies: z.array(z.string()).optional(),
  // Redirect URL if action triggers a redirect
  redirect: z
    .object({
      url: z.string(),
      status: z.number(),
    })
    .optional(),
  // Variable updates
  variableUpdates: z.record(z.unknown()).optional(),
});
export type ActionResult = z.infer<typeof ActionResult>;
