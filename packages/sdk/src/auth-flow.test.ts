/**
 * Comprehensive E2E-style tests for authentication flows
 *
 * These tests simulate real-world authentication scenarios including:
 * - Complete login flows (Supabase, API-based, OAuth token exchange)
 * - Cookie setting and verification
 * - Protected content access patterns
 * - Error handling and edge cases
 * - E-commerce authentication patterns
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { executeActionChain } from "./action-executor";
import {
  evaluateCookieExpression,
  isAuthenticated,
  parseCookieHeader,
  serializeCookie,
} from "./cookie-expression";
import type { ServerAction, ActionContext } from "./schema/actions";

/**
 * Helper to create an action map from an array
 */
const createActionMap = (
  actions: ServerAction[]
): Map<string, ServerAction> => {
  return new Map(actions.map((a) => [a.id, a]));
};

// ============================================================================
// SCENARIO 1: Supabase Email/Password Login
// ============================================================================

describe("Supabase Auth Flow", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          access_token:
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlRlc3QgVXNlciIsImlhdCI6MTUxNjIzOTAyMn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: "refresh_token_123",
          user: {
            id: "user-uuid-123",
            email: "test@example.com",
            user_metadata: { name: "Test User" },
          },
        }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("complete Supabase login flow with token storage", async () => {
    const actions = createActionMap([
      {
        id: "supabase-login",
        type: "callApi",
        url: "https://myproject.supabase.co/auth/v1/token?grant_type=password",
        method: "POST",
        headers: [
          { name: "Content-Type", value: "application/json" },
          { name: "apikey", value: "supabase-anon-key" },
        ],
        body: '{"email": "{{formData.email}}", "password": "{{formData.password}}"}',
        onSuccess: [
          "set-access-token",
          "set-refresh-token",
          "redirect-dashboard",
        ],
        onError: ["set-error"],
        includeCredentials: false,
      },
      {
        id: "set-access-token",
        type: "setCookie",
        name: "sb-access-token",
        value: "{{response.access_token}}",
        expiresIn: 3600,
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        includeSubdomains: false,
      },
      {
        id: "set-refresh-token",
        type: "setCookie",
        name: "sb-refresh-token",
        value: "{{response.refresh_token}}",
        expiresIn: 604800, // 7 days
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        includeSubdomains: false,
      },
      {
        id: "redirect-dashboard",
        type: "redirect",
        url: "/dashboard",
        status: 302,
      },
      {
        id: "set-error",
        type: "setVariable",
        variableName: "loginError",
        value: "{{response.error_description}}",
      },
    ]);

    const context: ActionContext = {
      cookies: {},
      variables: {},
      formData: {
        email: "test@example.com",
        password: "securePassword123",
      },
    };

    const result = await executeActionChain(
      actions,
      ["supabase-login"],
      context
    );

    // Verify success
    expect(result.success).toBe(true);

    // Verify access token cookie was set
    const accessTokenCookie = result.setCookies?.find(
      (c) => c.name === "sb-access-token"
    );
    expect(accessTokenCookie).toBeDefined();
    expect(accessTokenCookie?.value).toContain(
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    );
    expect(accessTokenCookie?.options.httpOnly).toBe(true);
    expect(accessTokenCookie?.options.secure).toBe(true);

    // Verify refresh token cookie was set
    const refreshTokenCookie = result.setCookies?.find(
      (c) => c.name === "sb-refresh-token"
    );
    expect(refreshTokenCookie).toBeDefined();
    expect(refreshTokenCookie?.value).toBe("refresh_token_123");

    // Verify redirect to dashboard
    expect(result.redirect?.url).toBe("/dashboard");
    expect(result.redirect?.status).toBe(302);
  });

  test("handles Supabase login failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          error: "invalid_grant",
          error_description: "Invalid login credentials",
        }),
      })
    );

    const actions = createActionMap([
      {
        id: "supabase-login",
        type: "callApi",
        url: "https://myproject.supabase.co/auth/v1/token?grant_type=password",
        method: "POST",
        headers: [{ name: "Content-Type", value: "application/json" }],
        body: '{"email": "{{formData.email}}", "password": "{{formData.password}}"}',
        onError: ["set-error"],
        includeCredentials: false,
      },
      {
        id: "set-error",
        type: "setVariable",
        variableName: "loginError",
        value: "Invalid email or password",
      },
    ]);

    const result = await executeActionChain(actions, ["supabase-login"], {
      cookies: {},
      variables: {},
      formData: { email: "test@example.com", password: "wrongpassword" },
    });

    expect(result.success).toBe(false);
    expect(result.variableUpdates).toEqual({
      loginError: "Invalid email or password",
    });
    // No cookies should be set
    expect(result.setCookies?.length ?? 0).toBe(0);
  });
});

// ============================================================================
// SCENARIO 2: Protected Content Access
// ============================================================================

describe("Protected Content Access", () => {
  test("detects authenticated state from cookies", () => {
    const authenticatedContext = {
      cookies: { "sb-access-token": "valid-token-123" },
    };

    const unauthenticatedContext = {
      cookies: {},
    };

    expect(isAuthenticated(authenticatedContext, "sb-access-token")).toBe(true);
    expect(isAuthenticated(unauthenticatedContext, "sb-access-token")).toBe(
      false
    );
  });

  test("evaluates show/hide conditions with cookies", () => {
    const authenticatedContext = {
      cookies: { access_token: "valid-token" },
    };

    // Show when authenticated
    expect(
      evaluateCookieExpression(
        'getCookie("access_token") != null',
        authenticatedContext
      )
    ).toBe(true);

    // Hide when authenticated
    expect(
      evaluateCookieExpression(
        'getCookie("access_token") == null',
        authenticatedContext
      )
    ).toBe(false);

    // Show when NOT authenticated
    const unauthContext = { cookies: {} };
    expect(
      evaluateCookieExpression(
        'getCookie("access_token") == null',
        unauthContext
      )
    ).toBe(true);
  });

  test("API call with cookie-to-header mapping", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          data: [
            { id: 1, title: "Protected Data 1" },
            { id: 2, title: "Protected Data 2" },
          ],
        }),
      })
    );

    const actions = createActionMap([
      {
        id: "fetch-protected",
        type: "callApi",
        url: "https://api.example.com/protected/data",
        method: "GET",
        cookieToHeader: {
          cookieName: "access_token",
          headerName: "Authorization",
          prefix: "Bearer ",
        },
        responseVariable: "protectedData",
        includeCredentials: false,
      },
    ]);

    const result = await executeActionChain(actions, ["fetch-protected"], {
      cookies: { access_token: "my-jwt-token-123" },
      variables: {},
    });

    expect(result.success).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/protected/data",
      {
        method: "GET",
        headers: { Authorization: "Bearer my-jwt-token-123" },
        body: undefined,
        credentials: "omit",
      }
    );
    expect(result.variableUpdates?.protectedData).toEqual({
      data: [
        { id: 1, title: "Protected Data 1" },
        { id: 2, title: "Protected Data 2" },
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});

// ============================================================================
// SCENARIO 3: Logout Flow
// ============================================================================

describe("Logout Flow", () => {
  test("deletes auth cookies and redirects", async () => {
    const actions = createActionMap([
      {
        id: "delete-access-token",
        type: "deleteCookie",
        name: "access_token",
        path: "/",
      },
      {
        id: "delete-refresh-token",
        type: "deleteCookie",
        name: "refresh_token",
        path: "/",
      },
      {
        id: "redirect-home",
        type: "redirect",
        url: "/",
        status: 302,
      },
    ]);

    const result = await executeActionChain(
      actions,
      ["delete-access-token", "delete-refresh-token", "redirect-home"],
      {
        cookies: { access_token: "old-token", refresh_token: "old-refresh" },
        variables: {},
      }
    );

    expect(result.success).toBe(true);
    expect(result.deleteCookies).toContain("access_token");
    expect(result.deleteCookies).toContain("refresh_token");
    expect(result.redirect?.url).toBe("/");
  });

  test("logout with API call (revoke token)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({}),
      })
    );

    // Execute actions in explicit order (not relying on onSuccess chains for this test)
    const actions = createActionMap([
      {
        id: "revoke-token",
        type: "callApi",
        url: "https://api.example.com/auth/logout",
        method: "POST",
        cookieToHeader: {
          cookieName: "access_token",
          headerName: "Authorization",
          prefix: "Bearer ",
        },
        includeCredentials: false,
      },
      {
        id: "delete-token",
        type: "deleteCookie",
        name: "access_token",
        path: "/",
      },
      {
        id: "redirect",
        type: "redirect",
        url: "/login",
        status: 302,
      },
    ]);

    const result = await executeActionChain(
      actions,
      ["revoke-token", "delete-token", "redirect"],
      {
        cookies: { access_token: "current-token" },
        variables: {},
      }
    );

    expect(result.success).toBe(true);
    expect(fetch).toHaveBeenCalledWith("https://api.example.com/auth/logout", {
      method: "POST",
      headers: { Authorization: "Bearer current-token" },
      body: undefined,
      credentials: "omit",
    });
    expect(result.deleteCookies).toContain("access_token");
    expect(result.redirect?.url).toBe("/login");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});

// ============================================================================
// SCENARIO 4: E-Commerce (Shopify-style) Authentication
// ============================================================================

describe("E-Commerce Auth Flow", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          data: {
            customerAccessTokenCreate: {
              customerAccessToken: {
                accessToken: "shopify-customer-token-abc123",
                expiresAt: "2025-01-10T00:00:00Z",
              },
              customerUserErrors: [],
            },
          },
        }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("Shopify customer login with GraphQL", async () => {
    const actions = createActionMap([
      {
        id: "shopify-login",
        type: "callApi",
        url: "https://myshop.myshopify.com/api/2025-01/graphql.json",
        method: "POST",
        headers: [
          { name: "Content-Type", value: "application/json" },
          {
            name: "X-Shopify-Storefront-Access-Token",
            value: "storefront-token",
          },
        ],
        body: JSON.stringify({
          query: `mutation customerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {
            customerAccessTokenCreate(input: $input) {
              customerAccessToken {
                accessToken
                expiresAt
              }
              customerUserErrors {
                code
                message
              }
            }
          }`,
          variables: {
            input: {
              email: "{{formData.email}}",
              password: "{{formData.password}}",
            },
          },
        }),
        responseVariable: "shopifyResponse",
        onSuccess: ["set-customer-token", "redirect-account"],
        includeCredentials: false,
      },
      {
        id: "set-customer-token",
        type: "setCookie",
        name: "shopify_customer_token",
        value:
          "{{response.data.customerAccessTokenCreate.customerAccessToken.accessToken}}",
        expiresIn: 604800,
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        includeSubdomains: false,
      },
      {
        id: "redirect-account",
        type: "redirect",
        url: "/account",
        status: 302,
      },
    ]);

    const result = await executeActionChain(actions, ["shopify-login"], {
      cookies: {},
      variables: {},
      formData: { email: "customer@example.com", password: "customerpass123" },
    });

    expect(result.success).toBe(true);
    const customerToken = result.setCookies?.find(
      (c) => c.name === "shopify_customer_token"
    );
    expect(customerToken?.value).toBe("shopify-customer-token-abc123");
    expect(result.redirect?.url).toBe("/account");
  });

  test("fetches customer orders with auth token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          data: {
            customer: {
              orders: {
                edges: [
                  {
                    node: {
                      id: "order-1",
                      name: "#1001",
                      totalPrice: { amount: "99.99", currencyCode: "USD" },
                    },
                  },
                  {
                    node: {
                      id: "order-2",
                      name: "#1002",
                      totalPrice: { amount: "149.99", currencyCode: "USD" },
                    },
                  },
                ],
              },
            },
          },
        }),
      })
    );

    const actions = createActionMap([
      {
        id: "fetch-orders",
        type: "callApi",
        url: "https://myshop.myshopify.com/api/2025-01/graphql.json",
        method: "POST",
        headers: [
          { name: "Content-Type", value: "application/json" },
          {
            name: "X-Shopify-Storefront-Access-Token",
            value: "storefront-token",
          },
        ],
        cookieToHeader: {
          cookieName: "shopify_customer_token",
          headerName: "X-Shopify-Customer-Access-Token",
        },
        responseVariable: "customerOrders",
        includeCredentials: false,
      },
    ]);

    const result = await executeActionChain(actions, ["fetch-orders"], {
      cookies: { shopify_customer_token: "customer-token-123" },
      variables: {},
    });

    expect(result.success).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "https://myshop.myshopify.com/api/2025-01/graphql.json",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Shopify-Customer-Access-Token": "customer-token-123",
        }),
      })
    );
  });
});

// ============================================================================
// SCENARIO 5: Token Refresh Flow
// ============================================================================

describe("Token Refresh Flow", () => {
  test("refreshes expired token using refresh token cookie", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          access_token: "new-access-token-xyz",
          expires_in: 3600,
          refresh_token: "new-refresh-token-abc",
        }),
      })
    );

    const actions = createActionMap([
      {
        id: "refresh-token",
        type: "callApi",
        url: "https://auth.example.com/token",
        method: "POST",
        headers: [
          { name: "Content-Type", value: "application/x-www-form-urlencoded" },
        ],
        body: "grant_type=refresh_token&refresh_token={{cookies.refresh_token}}",
        onSuccess: ["update-access-token", "update-refresh-token"],
        includeCredentials: false,
      },
      {
        id: "update-access-token",
        type: "setCookie",
        name: "access_token",
        value: "{{response.access_token}}",
        expiresIn: 3600,
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        includeSubdomains: false,
      },
      {
        id: "update-refresh-token",
        type: "setCookie",
        name: "refresh_token",
        value: "{{response.refresh_token}}",
        expiresIn: 604800,
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        includeSubdomains: false,
      },
    ]);

    const result = await executeActionChain(actions, ["refresh-token"], {
      cookies: {
        access_token: "expired-token",
        refresh_token: "valid-refresh-token",
      },
      variables: {},
    });

    expect(result.success).toBe(true);

    const newAccessToken = result.setCookies?.find(
      (c) => c.name === "access_token"
    );
    expect(newAccessToken?.value).toBe("new-access-token-xyz");

    const newRefreshToken = result.setCookies?.find(
      (c) => c.name === "refresh_token"
    );
    expect(newRefreshToken?.value).toBe("new-refresh-token-abc");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});

// ============================================================================
// SCENARIO 6: Edge Cases and Error Handling
// ============================================================================

describe("Edge Cases and Error Handling", () => {
  test("handles network timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network timeout"))
    );

    const actions = createActionMap([
      {
        id: "api-call",
        type: "callApi",
        url: "https://api.example.com/slow-endpoint",
        method: "GET",
        onError: ["set-timeout-error"],
        includeCredentials: false,
      },
      {
        id: "set-timeout-error",
        type: "setVariable",
        variableName: "errorMessage",
        value: "Request timed out. Please try again.",
      },
    ]);

    const result = await executeActionChain(actions, ["api-call"], {
      cookies: {},
      variables: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Network timeout");
    expect(result.variableUpdates).toEqual({
      errorMessage: "Request timed out. Please try again.",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("handles empty form data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ error: "Email and password required" }),
      })
    );

    const actions = createActionMap([
      {
        id: "login",
        type: "callApi",
        url: "https://api.example.com/login",
        method: "POST",
        body: '{"email": "{{formData.email}}", "password": "{{formData.password}}"}',
        includeCredentials: false,
      },
    ]);

    const result = await executeActionChain(actions, ["login"], {
      cookies: {},
      variables: {},
      formData: { email: "", password: "" },
    });

    expect(result.success).toBe(false);
  });

  test("handles malformed API response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => {
          throw new Error("Invalid JSON");
        },
      })
    );

    const actions = createActionMap([
      {
        id: "api-call",
        type: "callApi",
        url: "https://api.example.com/malformed",
        method: "GET",
        includeCredentials: false,
      },
    ]);

    const result = await executeActionChain(actions, ["api-call"], {
      cookies: {},
      variables: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid JSON");
  });

  test("handles missing action in chain", async () => {
    const actions = createActionMap([
      {
        id: "first-action",
        type: "setVariable",
        variableName: "test",
        value: "value",
        onSuccess: ["missing-action"], // This action doesn't exist
      },
    ]);

    const result = await executeActionChain(actions, ["first-action"], {
      cookies: {},
      variables: {},
    });

    // Should succeed for the first action, but skip missing ones
    expect(result.success).toBe(true);
  });

  test("handles special characters in form data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ success: true }),
      })
    );

    const actions = createActionMap([
      {
        id: "submit",
        type: "callApi",
        url: "https://api.example.com/submit",
        method: "POST",
        body: '{"email": "{{formData.email}}"}',
        includeCredentials: false,
      },
    ]);

    await executeActionChain(actions, ["submit"], {
      cookies: {},
      variables: {},
      formData: { email: "test+special@example.com" },
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/submit",
      expect.objectContaining({
        body: '{"email": "test+special@example.com"}',
      })
    );
  });

  test("handles concurrent cookie operations", async () => {
    const actions = createActionMap([
      {
        id: "set-cookie-1",
        type: "setCookie",
        name: "cookie1",
        value: "value1",
        expiresIn: 3600,
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        includeSubdomains: false,
      },
      {
        id: "set-cookie-2",
        type: "setCookie",
        name: "cookie2",
        value: "value2",
        expiresIn: 3600,
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        includeSubdomains: false,
      },
      {
        id: "set-cookie-3",
        type: "setCookie",
        name: "cookie3",
        value: "value3",
        expiresIn: 3600,
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        includeSubdomains: false,
      },
    ]);

    const result = await executeActionChain(
      actions,
      ["set-cookie-1", "set-cookie-2", "set-cookie-3"],
      { cookies: {}, variables: {} }
    );

    expect(result.setCookies).toHaveLength(3);
    expect(result.setCookies?.map((c) => c.name)).toEqual([
      "cookie1",
      "cookie2",
      "cookie3",
    ]);
  });
});

// ============================================================================
// SCENARIO 7: Cookie Parsing and Serialization
// ============================================================================

describe("Cookie Header Handling", () => {
  test("parses complex cookie headers", () => {
    const header =
      "access_token=jwt.token.here; refresh_token=refresh123; session=sess_abc; preferences=%7B%22theme%22%3A%22dark%22%7D";
    const cookies = parseCookieHeader(header);

    expect(cookies).toEqual({
      access_token: "jwt.token.here",
      refresh_token: "refresh123",
      session: "sess_abc",
      preferences: '{"theme":"dark"}',
    });
  });

  test("serializes cookie with all security options", () => {
    const serialized = serializeCookie("auth_token", "secure-value-123", {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 3600,
      domain: ".example.com",
    });

    expect(serialized).toContain("auth_token=secure-value-123");
    expect(serialized).toContain("HttpOnly");
    expect(serialized).toContain("Secure");
    expect(serialized).toContain("SameSite=strict");
    expect(serialized).toContain("Path=/");
    expect(serialized).toContain("Max-Age=3600");
    expect(serialized).toContain("Domain=.example.com");
  });
});

// ============================================================================
// SCENARIO 8: OAuth Token Exchange
// ============================================================================

describe("OAuth Token Exchange", () => {
  test("exchanges authorization code for tokens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          access_token: "oauth-access-token-123",
          id_token: "oauth-id-token-456",
          token_type: "Bearer",
          expires_in: 3600,
          refresh_token: "oauth-refresh-token-789",
          scope: "openid profile email",
        }),
      })
    );

    const actions = createActionMap([
      {
        id: "exchange-code",
        type: "callApi",
        url: "https://oauth.provider.com/token",
        method: "POST",
        headers: [
          { name: "Content-Type", value: "application/x-www-form-urlencoded" },
        ],
        body: "grant_type=authorization_code&code={{variables.authCode}}&redirect_uri=https://myapp.com/callback&client_id=my-client-id",
        onSuccess: ["set-tokens", "redirect"],
        includeCredentials: false,
      },
      {
        id: "set-tokens",
        type: "setCookie",
        name: "oauth_access_token",
        value: "{{response.access_token}}",
        expiresIn: 3600,
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        includeSubdomains: false,
      },
      {
        id: "redirect",
        type: "redirect",
        url: "/dashboard",
        status: 302,
      },
    ]);

    const result = await executeActionChain(actions, ["exchange-code"], {
      cookies: {},
      variables: { authCode: "authorization-code-from-oauth" },
    });

    expect(result.success).toBe(true);
    expect(result.setCookies?.[0].value).toBe("oauth-access-token-123");
    expect(result.redirect?.url).toBe("/dashboard");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});

// ============================================================================
// SCENARIO 9: Multi-Step Registration Flow
// ============================================================================

describe("Multi-Step Registration Flow", () => {
  test("register and auto-login", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            user: { id: "new-user-123", email: "new@example.com" },
            message: "Registration successful",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            access_token: "new-user-token-abc",
            expires_in: 3600,
          }),
        })
    );

    const actions = createActionMap([
      {
        id: "register",
        type: "callApi",
        url: "https://api.example.com/auth/register",
        method: "POST",
        headers: [{ name: "Content-Type", value: "application/json" }],
        body: '{"email": "{{formData.email}}", "password": "{{formData.password}}", "name": "{{formData.name}}"}',
        onSuccess: ["auto-login"],
        includeCredentials: false,
      },
      {
        id: "auto-login",
        type: "callApi",
        url: "https://api.example.com/auth/login",
        method: "POST",
        headers: [{ name: "Content-Type", value: "application/json" }],
        body: '{"email": "{{formData.email}}", "password": "{{formData.password}}"}',
        onSuccess: ["set-token", "redirect"],
        includeCredentials: false,
      },
      {
        id: "set-token",
        type: "setCookie",
        name: "access_token",
        value: "{{response.access_token}}",
        expiresIn: 3600,
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        includeSubdomains: false,
      },
      {
        id: "redirect",
        type: "redirect",
        url: "/welcome",
        status: 302,
      },
    ]);

    const result = await executeActionChain(actions, ["register"], {
      cookies: {},
      variables: {},
      formData: {
        email: "new@example.com",
        password: "NewPassword123!",
        name: "New User",
      },
    });

    expect(result.success).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.setCookies?.[0].value).toBe("new-user-token-abc");
    expect(result.redirect?.url).toBe("/welcome");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});
