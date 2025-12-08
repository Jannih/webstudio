/**
 * Cookie Expression Utilities
 *
 * Provides server-side cookie access for expressions.
 * Used in conjunction with the action system for authentication flows.
 *
 * Unlike standard Webstudio expressions which run at build time,
 * these functions are evaluated at runtime on the server.
 */

/**
 * Cookie context passed to expression evaluation
 */
export interface CookieContext {
  cookies: Record<string, string>;
}

/**
 * Allowed cookie expression functions
 *
 * These are the only functions that can be called in cookie expressions.
 * They are evaluated server-side where cookies are accessible.
 */
export const cookieFunctions = {
  /**
   * Get a cookie value by name
   *
   * @param name - The cookie name
   * @param context - The cookie context
   * @returns The cookie value or null if not found
   *
   * @example
   * // In an expression: getCookie("access_token")
   * getCookie("access_token", { cookies: { access_token: "abc123" } }) // "abc123"
   */
  getCookie: (name: string, context: CookieContext): string | null => {
    return context.cookies[name] ?? null;
  },

  /**
   * Get an httpOnly cookie value by name
   *
   * Semantically equivalent to getCookie, but makes it clear
   * that this is for httpOnly cookies (which is why we need
   * server-side evaluation in the first place).
   *
   * @param name - The cookie name
   * @param context - The cookie context
   * @returns The cookie value or null if not found
   *
   * @example
   * // In an expression: getHttpOnlyCookie("access_token")
   */
  getHttpOnlyCookie: (name: string, context: CookieContext): string | null => {
    return context.cookies[name] ?? null;
  },

  /**
   * Check if a cookie exists
   *
   * @param name - The cookie name
   * @param context - The cookie context
   * @returns True if the cookie exists
   *
   * @example
   * // In an expression: hasCookie("access_token")
   */
  hasCookie: (name: string, context: CookieContext): boolean => {
    return name in context.cookies;
  },
};

/**
 * Pattern to match cookie template syntax: {{cookies.name}}
 */
const COOKIE_TEMPLATE_PATTERN = /\{\{cookies\.(\w+)\}\}/g;

/**
 * Pattern to match cookie function calls: getCookie("name") or getHttpOnlyCookie("name")
 */
const COOKIE_FUNCTION_PATTERN =
  /(?:getCookie|getHttpOnlyCookie|hasCookie)\s*\(\s*["'](\w+)["']\s*\)/g;

/**
 * Check if an expression contains cookie references
 *
 * @param expression - The expression to check
 * @returns True if the expression references cookies
 */
export const hasCookieReference = (expression: string): boolean => {
  // Use fresh regex instances to avoid lastIndex state issues with global patterns
  const templatePattern = /\{\{cookies\.(\w+)\}\}/;
  const functionPattern =
    /(?:getCookie|getHttpOnlyCookie|hasCookie)\s*\(\s*["'](\w+)["']\s*\)/;
  return templatePattern.test(expression) || functionPattern.test(expression);
};

/**
 * Extract cookie names referenced in an expression
 *
 * @param expression - The expression to analyze
 * @returns Set of cookie names referenced
 */
export const getCookieReferences = (expression: string): Set<string> => {
  const references = new Set<string>();

  // Match template syntax: {{cookies.name}}
  let match;
  const templatePattern = new RegExp(COOKIE_TEMPLATE_PATTERN.source, "g");
  while ((match = templatePattern.exec(expression)) !== null) {
    references.add(match[1]);
  }

  // Match function calls: getCookie("name")
  const functionPattern = new RegExp(COOKIE_FUNCTION_PATTERN.source, "g");
  while ((match = functionPattern.exec(expression)) !== null) {
    references.add(match[1]);
  }

  return references;
};

/**
 * Evaluate a cookie expression
 *
 * Supports:
 * - Template syntax: {{cookies.name}}
 * - Function calls: getCookie("name"), getHttpOnlyCookie("name"), hasCookie("name")
 *
 * @param expression - The expression to evaluate
 * @param context - The cookie context
 * @returns The evaluated result
 */
export const evaluateCookieExpression = (
  expression: string,
  context: CookieContext
): unknown => {
  // Handle template syntax: {{cookies.name}}
  const templateResult = expression.replace(
    COOKIE_TEMPLATE_PATTERN,
    (_, name: string) => {
      return context.cookies[name] ?? "";
    }
  );

  // If it was purely a template expression, return the result
  if (templateResult !== expression) {
    // If the entire expression was a single template, return null for missing cookies
    if (expression.match(/^\{\{cookies\.(\w+)\}\}$/) && templateResult === "") {
      return null;
    }
    return templateResult;
  }

  // Handle function calls
  const getCookieMatch = expression.match(
    /^getCookie\s*\(\s*["'](\w+)["']\s*\)$/
  );
  if (getCookieMatch) {
    return cookieFunctions.getCookie(getCookieMatch[1], context);
  }

  const getHttpOnlyCookieMatch = expression.match(
    /^getHttpOnlyCookie\s*\(\s*["'](\w+)["']\s*\)$/
  );
  if (getHttpOnlyCookieMatch) {
    return cookieFunctions.getHttpOnlyCookie(
      getHttpOnlyCookieMatch[1],
      context
    );
  }

  const hasCookieMatch = expression.match(
    /^hasCookie\s*\(\s*["'](\w+)["']\s*\)$/
  );
  if (hasCookieMatch) {
    return cookieFunctions.hasCookie(hasCookieMatch[1], context);
  }

  // Handle comparison expressions for show/hide
  // e.g., getCookie("token") != null
  const comparisonMatch = expression.match(
    /^(?:getCookie|getHttpOnlyCookie)\s*\(\s*["'](\w+)["']\s*\)\s*(===?|!==?)\s*(null|undefined|""|'')$/
  );
  if (comparisonMatch) {
    const [, cookieName, operator, rightSide] = comparisonMatch;
    const cookieValue = context.cookies[cookieName];
    const isNull = cookieValue === undefined || cookieValue === null;
    const isEmpty = cookieValue === "";

    // Determine what we're comparing against
    const comparingToNull = rightSide === "null" || rightSide === "undefined";
    const comparingToEmpty = rightSide === '""' || rightSide === "''";

    // Evaluate comparison
    if (operator === "==" || operator === "===") {
      if (comparingToNull) {
        return isNull;
      }
      if (comparingToEmpty) {
        return isEmpty;
      }
    }
    if (operator === "!=" || operator === "!==") {
      if (comparingToNull) {
        return !isNull;
      }
      if (comparingToEmpty) {
        return !isEmpty;
      }
    }
  }

  // Return expression unchanged if no cookie references
  return expression;
};

/**
 * Check if user is authenticated based on a cookie
 *
 * Convenience function for common auth check pattern.
 *
 * @param context - The cookie context
 * @param cookieName - The cookie name to check (default: "access_token")
 * @returns True if the cookie exists and is not empty
 */
export const isAuthenticated = (
  context: CookieContext,
  cookieName: string = "access_token"
): boolean => {
  const value = context.cookies[cookieName];
  return value !== undefined && value !== null && value !== "";
};

/**
 * Parse cookies from a Cookie header string
 *
 * @param cookieHeader - The Cookie header value
 * @returns Map of cookie name to value
 */
export const parseCookieHeader = (
  cookieHeader: string
): Record<string, string> => {
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
 * Serialize a cookie value for Set-Cookie header
 *
 * @param name - Cookie name
 * @param value - Cookie value
 * @param options - Cookie options
 * @returns Serialized cookie string
 */
export const serializeCookie = (
  name: string,
  value: string,
  options: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "strict" | "lax" | "none";
    path?: string;
    maxAge?: number;
    expires?: Date;
    domain?: string;
  } = {}
): string => {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];

  if (options.httpOnly) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }

  if (options.path) {
    parts.push(`Path=${options.path}`);
  }

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  if (options.domain) {
    parts.push(`Domain=${options.domain}`);
  }

  return parts.join("; ");
};
