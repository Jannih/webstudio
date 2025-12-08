import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  evaluateExpression,
  evaluateExpressionValue,
  evaluateCondition,
  evaluateConditions,
  executeAction,
  executeActionChain,
} from "./action-executor";
import type {
  ServerAction,
  ActionContext,
  SetCookieAction,
  DeleteCookieAction,
  RedirectAction,
  CallApiAction,
  SetVariableAction,
  ActionCondition,
  ConditionalAction,
} from "./schema/actions";

describe("evaluateExpression", () => {
  const baseContext: ActionContext = {
    cookies: { access_token: "abc123", session_id: "sess456" },
    variables: { userName: "Max", count: 42 },
    formData: { email: "test@example.com", password: "secret" },
    response: { token: "xyz789", user: { id: "1", name: "John" } },
  };

  test("replaces cookie template", () => {
    expect(evaluateExpression("{{cookies.access_token}}", baseContext)).toBe(
      "abc123"
    );
  });

  test("replaces variable template", () => {
    expect(evaluateExpression("{{variables.userName}}", baseContext)).toBe(
      "Max"
    );
  });

  test("replaces formData template", () => {
    expect(evaluateExpression("{{formData.email}}", baseContext)).toBe(
      "test@example.com"
    );
  });

  test("replaces response template", () => {
    expect(evaluateExpression("{{response.token}}", baseContext)).toBe(
      "xyz789"
    );
  });

  test("replaces nested response field", () => {
    expect(evaluateExpression("{{response.user.name}}", baseContext)).toBe(
      "John"
    );
  });

  test("replaces multiple templates", () => {
    expect(
      evaluateExpression(
        "Bearer {{cookies.access_token}} for {{variables.userName}}",
        baseContext
      )
    ).toBe("Bearer abc123 for Max");
  });

  test("returns empty string for missing values", () => {
    expect(evaluateExpression("{{cookies.missing}}", baseContext)).toBe("");
  });

  test("keeps unknown template sources unchanged", () => {
    expect(evaluateExpression("{{unknown.value}}", baseContext)).toBe(
      "{{unknown.value}}"
    );
  });

  test("handles number values", () => {
    expect(evaluateExpression("Count: {{variables.count}}", baseContext)).toBe(
      "Count: 42"
    );
  });

  test("handles object values as JSON", () => {
    expect(evaluateExpression("{{response.user}}", baseContext)).toBe(
      '{"id":"1","name":"John"}'
    );
  });
});

describe("executeAction - SetCookie", () => {
  test("creates httpOnly cookie with defaults", async () => {
    const action: SetCookieAction = {
      id: "1",
      type: "setCookie",
      name: "access_token",
      value: "{{response.token}}",
      expiresIn: 604800,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      includeSubdomains: false,
    };

    const context: ActionContext = {
      cookies: {},
      variables: {},
      response: { token: "test-token-123" },
    };

    const result = await executeAction(action, context);

    expect(result.success).toBe(true);
    expect(result.setCookies).toHaveLength(1);
    expect(result.setCookies?.[0]).toEqual({
      name: "access_token",
      value: "test-token-123",
      options: {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 604800, // 7 days
      },
    });
  });

  test("respects custom cookie options", async () => {
    const action: SetCookieAction = {
      id: "1",
      type: "setCookie",
      name: "session",
      value: "session-value",
      expiresIn: 3600,
      httpOnly: false,
      secure: false,
      sameSite: "strict",
      path: "/admin",
      includeSubdomains: false,
    };

    const context: ActionContext = {
      cookies: {},
      variables: {},
    };

    const result = await executeAction(action, context);

    expect(result.setCookies?.[0].options).toEqual({
      httpOnly: false,
      secure: false,
      sameSite: "strict",
      path: "/admin",
      maxAge: 3600,
    });
  });
});

describe("executeAction - DeleteCookie", () => {
  test("deletes cookie by setting maxAge to 0", async () => {
    const action: DeleteCookieAction = {
      id: "1",
      type: "deleteCookie",
      name: "access_token",
      path: "/",
    };

    const context: ActionContext = {
      cookies: { access_token: "existing-token" },
      variables: {},
    };

    const result = await executeAction(action, context);

    expect(result.success).toBe(true);
    expect(result.setCookies?.[0]).toEqual({
      name: "access_token",
      value: "",
      options: {
        path: "/",
        maxAge: 0,
      },
    });
    expect(result.deleteCookies).toContain("access_token");
  });
});

describe("executeAction - Redirect", () => {
  test("returns redirect with evaluated URL", async () => {
    const action: RedirectAction = {
      id: "1",
      type: "redirect",
      url: "/account",
      status: 302,
    };

    const context: ActionContext = {
      cookies: {},
      variables: {},
    };

    const result = await executeAction(action, context);

    expect(result.success).toBe(true);
    expect(result.redirect).toEqual({
      url: "/account",
      status: 302,
    });
  });

  test("evaluates URL with templates", async () => {
    const action: RedirectAction = {
      id: "1",
      type: "redirect",
      url: "{{variables.redirectUrl}}",
      status: 301,
    };

    const context: ActionContext = {
      cookies: {},
      variables: { redirectUrl: "/dashboard" },
    };

    const result = await executeAction(action, context);

    expect(result.redirect).toEqual({
      url: "/dashboard",
      status: 301,
    });
  });
});

describe("executeAction - SetVariable", () => {
  test("sets variable with evaluated value", async () => {
    const action: SetVariableAction = {
      id: "1",
      type: "setVariable",
      variableName: "errorMessage",
      value: "{{response.message}}",
    };

    const context: ActionContext = {
      cookies: {},
      variables: {},
      response: { message: "Login failed" },
    };

    const result = await executeAction(action, context);

    expect(result.success).toBe(true);
    expect(result.variableUpdates).toEqual({
      errorMessage: "Login failed",
    });
  });

  test("parses JSON values", async () => {
    const action: SetVariableAction = {
      id: "1",
      type: "setVariable",
      variableName: "user",
      value: '{"name": "Max", "id": 1}',
    };

    const context: ActionContext = {
      cookies: {},
      variables: {},
    };

    const result = await executeAction(action, context);

    expect(result.variableUpdates?.user).toEqual({ name: "Max", id: 1 });
  });
});

describe("executeAction - CallApi", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ token: "new-token", user: { id: "123" } }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("makes API call with evaluated URL and headers", async () => {
    const action: CallApiAction = {
      id: "1",
      type: "callApi",
      url: "https://api.example.com/login",
      method: "POST",
      headers: [{ name: "Content-Type", value: "application/json" }],
      body: '{"email": "{{formData.email}}"}',
      includeCredentials: false,
    };

    const context: ActionContext = {
      cookies: {},
      variables: {},
      formData: { email: "test@example.com" },
    };

    const result = await executeAction(action, context);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ token: "new-token", user: { id: "123" } });

    expect(fetch).toHaveBeenCalledWith("https://api.example.com/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"email": "test@example.com"}',
      credentials: "omit",
    });
  });

  test("maps cookie to Authorization header", async () => {
    const action: CallApiAction = {
      id: "1",
      type: "callApi",
      url: "https://api.example.com/protected",
      method: "GET",
      cookieToHeader: {
        cookieName: "access_token",
        headerName: "Authorization",
        prefix: "Bearer ",
      },
      includeCredentials: false,
    };

    const context: ActionContext = {
      cookies: { access_token: "my-token-123" },
      variables: {},
    };

    await executeAction(action, context);

    expect(fetch).toHaveBeenCalledWith("https://api.example.com/protected", {
      method: "GET",
      headers: { Authorization: "Bearer my-token-123" },
      body: undefined,
      credentials: "omit",
    });
  });

  test("stores response in variable", async () => {
    const action: CallApiAction = {
      id: "1",
      type: "callApi",
      url: "https://api.example.com/data",
      method: "GET",
      responseVariable: "apiResponse",
      includeCredentials: false,
    };

    const context: ActionContext = {
      cookies: {},
      variables: {},
    };

    const result = await executeAction(action, context);

    expect(result.variableUpdates).toEqual({
      apiResponse: { token: "new-token", user: { id: "123" } },
    });
  });

  test("handles API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ error: "Unauthorized" }),
      })
    );

    const action: CallApiAction = {
      id: "1",
      type: "callApi",
      url: "https://api.example.com/protected",
      method: "GET",
      includeCredentials: false,
    };

    const context: ActionContext = {
      cookies: {},
      variables: {},
    };

    const result = await executeAction(action, context);

    expect(result.success).toBe(false);
    expect(result.error).toBe("HTTP 401");
  });

  test("handles network errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error"))
    );

    const action: CallApiAction = {
      id: "1",
      type: "callApi",
      url: "https://api.example.com/data",
      method: "GET",
      includeCredentials: false,
    };

    const context: ActionContext = {
      cookies: {},
      variables: {},
    };

    const result = await executeAction(action, context);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Network error");
  });
});

describe("executeActionChain", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ token: "new-token" }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("executes actions in order", async () => {
    const actions = new Map<string, ServerAction>([
      [
        "1",
        {
          id: "1",
          type: "callApi",
          url: "https://api.example.com/login",
          method: "POST",
          includeCredentials: false,
        },
      ],
      [
        "2",
        {
          id: "2",
          type: "setCookie",
          name: "access_token",
          value: "{{response.token}}",
          expiresIn: 604800,
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          includeSubdomains: false,
        },
      ],
      [
        "3",
        {
          id: "3",
          type: "redirect",
          url: "/account",
          status: 302,
        },
      ],
    ]);

    const result = await executeActionChain(actions, ["1", "2", "3"], {
      cookies: {},
      variables: {},
    });

    expect(result.setCookies).toHaveLength(1);
    expect(result.setCookies?.[0].value).toBe("new-token");
    expect(result.redirect?.url).toBe("/account");
  });

  test("executes onSuccess chain", async () => {
    const actions = new Map<string, ServerAction>([
      [
        "login",
        {
          id: "login",
          type: "callApi",
          url: "https://api.example.com/login",
          method: "POST",
          onSuccess: ["setCookie", "redirect"],
          includeCredentials: false,
        },
      ],
      [
        "setCookie",
        {
          id: "setCookie",
          type: "setCookie",
          name: "token",
          value: "{{response.token}}",
          expiresIn: 604800,
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          includeSubdomains: false,
        },
      ],
      [
        "redirect",
        {
          id: "redirect",
          type: "redirect",
          url: "/dashboard",
          status: 302,
        },
      ],
    ]);

    const result = await executeActionChain(actions, ["login"], {
      cookies: {},
      variables: {},
    });

    expect(result.setCookies).toHaveLength(1);
    expect(result.redirect?.url).toBe("/dashboard");
  });

  test("executes onError chain on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ message: "Invalid credentials" }),
      })
    );

    const actions = new Map<string, ServerAction>([
      [
        "login",
        {
          id: "login",
          type: "callApi",
          url: "https://api.example.com/login",
          method: "POST",
          onError: ["setError"],
          includeCredentials: false,
        },
      ],
      [
        "setError",
        {
          id: "setError",
          type: "setVariable",
          variableName: "errorMessage",
          value: "Login failed",
        },
      ],
    ]);

    const result = await executeActionChain(actions, ["login"], {
      cookies: {},
      variables: {},
    });

    expect(result.success).toBe(false);
    expect(result.variableUpdates).toEqual({ errorMessage: "Login failed" });
  });

  test("stops chain on redirect", async () => {
    const actions = new Map<string, ServerAction>([
      [
        "1",
        {
          id: "1",
          type: "redirect",
          url: "/login",
          status: 302,
        },
      ],
      [
        "2",
        {
          id: "2",
          type: "setCookie",
          name: "should-not-run",
          value: "test",
          expiresIn: 604800,
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          includeSubdomains: false,
        },
      ],
    ]);

    const result = await executeActionChain(actions, ["1", "2"], {
      cookies: {},
      variables: {},
    });

    expect(result.redirect?.url).toBe("/login");
    // Second action should not have run
    expect(
      result.setCookies?.find((c) => c.name === "should-not-run")
    ).toBeUndefined();
  });

  test("passes response data between actions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ accessToken: "token123", expiresIn: 3600 }),
      })
    );

    const actions = new Map<string, ServerAction>([
      [
        "api",
        {
          id: "api",
          type: "callApi",
          url: "https://api.example.com/auth",
          method: "POST",
          includeCredentials: false,
        },
      ],
      [
        "cookie",
        {
          id: "cookie",
          type: "setCookie",
          name: "token",
          value: "{{response.accessToken}}",
          expiresIn: 604800,
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          includeSubdomains: false,
        },
      ],
    ]);

    const result = await executeActionChain(actions, ["api", "cookie"], {
      cookies: {},
      variables: {},
    });

    expect(result.setCookies?.[0].value).toBe("token123");
  });
});

describe("evaluateExpressionValue", () => {
  const baseContext: ActionContext = {
    cookies: { access_token: "abc123" },
    variables: { count: 42, verified: true, name: "John" },
    formData: { email: "test@example.com" },
    response: {
      success: true,
      user: { id: 1, verified: false, roles: ["user", "admin"] },
    },
  };

  test("returns raw value for single template", () => {
    expect(evaluateExpressionValue("{{variables.count}}", baseContext)).toBe(
      42
    );
  });

  test("returns boolean value", () => {
    expect(evaluateExpressionValue("{{variables.verified}}", baseContext)).toBe(
      true
    );
    expect(
      evaluateExpressionValue("{{response.user.verified}}", baseContext)
    ).toBe(false);
  });

  test("returns nested object value", () => {
    expect(evaluateExpressionValue("{{response.user}}", baseContext)).toEqual({
      id: 1,
      verified: false,
      roles: ["user", "admin"],
    });
  });

  test("returns array value", () => {
    expect(
      evaluateExpressionValue("{{response.user.roles}}", baseContext)
    ).toEqual(["user", "admin"]);
  });

  test("parses JSON literals", () => {
    expect(evaluateExpressionValue("true", baseContext)).toBe(true);
    expect(evaluateExpressionValue("false", baseContext)).toBe(false);
    expect(evaluateExpressionValue("42", baseContext)).toBe(42);
    expect(evaluateExpressionValue('"hello"', baseContext)).toBe("hello");
  });

  test("returns undefined for missing values", () => {
    expect(
      evaluateExpressionValue("{{response.missing}}", baseContext)
    ).toBeUndefined();
  });
});

describe("evaluateCondition", () => {
  const baseContext: ActionContext = {
    cookies: { access_token: "abc123" },
    variables: { count: 42, name: "John" },
    formData: {},
    response: {
      success: true,
      user: { verified: false, roles: ["user", "admin"], age: 25 },
      status: "pending",
      message: "Email verification required",
    },
  };

  describe("equals operator", () => {
    test("returns true for equal values", () => {
      const condition: ActionCondition = {
        leftOperand: "{{response.status}}",
        operator: "equals",
        rightOperand: '"pending"',
      };
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test("returns false for unequal values", () => {
      const condition: ActionCondition = {
        leftOperand: "{{response.status}}",
        operator: "equals",
        rightOperand: '"completed"',
      };
      expect(evaluateCondition(condition, baseContext)).toBe(false);
    });

    test("compares booleans", () => {
      const condition: ActionCondition = {
        leftOperand: "{{response.user.verified}}",
        operator: "equals",
        rightOperand: "false",
      };
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test("compares numbers", () => {
      const condition: ActionCondition = {
        leftOperand: "{{response.user.age}}",
        operator: "equals",
        rightOperand: "25",
      };
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });
  });

  describe("notEquals operator", () => {
    test("returns true for unequal values", () => {
      const condition: ActionCondition = {
        leftOperand: "{{response.user.verified}}",
        operator: "notEquals",
        rightOperand: "true",
      };
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });
  });

  describe("contains operator", () => {
    test("checks string contains", () => {
      const condition: ActionCondition = {
        leftOperand: "{{response.message}}",
        operator: "contains",
        rightOperand: '"verification"',
      };
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test("checks array includes", () => {
      const condition: ActionCondition = {
        leftOperand: "{{response.user.roles}}",
        operator: "contains",
        rightOperand: '"admin"',
      };
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test("returns false when not contained", () => {
      const condition: ActionCondition = {
        leftOperand: "{{response.user.roles}}",
        operator: "contains",
        rightOperand: '"superadmin"',
      };
      expect(evaluateCondition(condition, baseContext)).toBe(false);
    });
  });

  describe("comparison operators", () => {
    test("greaterThan", () => {
      const condition: ActionCondition = {
        leftOperand: "{{response.user.age}}",
        operator: "greaterThan",
        rightOperand: "18",
      };
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test("lessThan", () => {
      const condition: ActionCondition = {
        leftOperand: "{{response.user.age}}",
        operator: "lessThan",
        rightOperand: "30",
      };
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });
  });

  describe("unary operators", () => {
    test("isTrue", () => {
      const condition: ActionCondition = {
        leftOperand: "{{response.success}}",
        operator: "isTrue",
      };
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test("isFalse", () => {
      const condition: ActionCondition = {
        leftOperand: "{{response.user.verified}}",
        operator: "isFalse",
      };
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test("exists", () => {
      const condition: ActionCondition = {
        leftOperand: "{{cookies.access_token}}",
        operator: "exists",
      };
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test("notExists for missing value", () => {
      const condition: ActionCondition = {
        leftOperand: "{{cookies.missing}}",
        operator: "notExists",
      };
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test("isEmpty for empty string", () => {
      const context = { ...baseContext, variables: { empty: "" } };
      const condition: ActionCondition = {
        leftOperand: "{{variables.empty}}",
        operator: "isEmpty",
      };
      expect(evaluateCondition(condition, context)).toBe(true);
    });
  });
});

describe("evaluateConditions", () => {
  const baseContext: ActionContext = {
    cookies: {},
    variables: {},
    formData: {},
    response: { verified: false, age: 25 },
  };

  test("returns true when no conditions", () => {
    const conditionalAction: ConditionalAction = {
      actionId: "test",
    };
    expect(evaluateConditions(conditionalAction, baseContext)).toBe(true);
  });

  test("returns true when all conditions pass (AND logic)", () => {
    const conditionalAction: ConditionalAction = {
      actionId: "test",
      conditions: [
        { leftOperand: "{{response.verified}}", operator: "isFalse" },
        {
          leftOperand: "{{response.age}}",
          operator: "greaterThan",
          rightOperand: "18",
        },
      ],
    };
    expect(evaluateConditions(conditionalAction, baseContext)).toBe(true);
  });

  test("returns false when any condition fails", () => {
    const conditionalAction: ConditionalAction = {
      actionId: "test",
      conditions: [
        { leftOperand: "{{response.verified}}", operator: "isFalse" }, // true
        {
          leftOperand: "{{response.age}}",
          operator: "lessThan",
          rightOperand: "18",
        }, // false
      ],
    };
    expect(evaluateConditions(conditionalAction, baseContext)).toBe(false);
  });
});

describe("executeActionChain - conditional actions", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ verified: false, redirectUrl: "/verify-email" }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("executes conditional action when condition is met", async () => {
    const actions = new Map<string, ServerAction>([
      [
        "checkAuth",
        {
          id: "checkAuth",
          type: "callApi",
          url: "https://api.example.com/check",
          method: "GET",
          includeCredentials: false,
          conditionalActions: [
            {
              actionId: "redirectToVerify",
              conditions: [
                {
                  leftOperand: "{{response.verified}}",
                  operator: "isFalse",
                },
              ],
            },
          ],
        },
      ],
      [
        "redirectToVerify",
        {
          id: "redirectToVerify",
          type: "redirect",
          url: "{{response.redirectUrl}}",
          status: 302,
        },
      ],
    ]);

    const result = await executeActionChain(actions, ["checkAuth"], {
      cookies: {},
      variables: {},
    });

    expect(result.redirect?.url).toBe("/verify-email");
  });

  test("skips conditional action when condition is not met", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ verified: true }), // User IS verified
      })
    );

    const actions = new Map<string, ServerAction>([
      [
        "checkAuth",
        {
          id: "checkAuth",
          type: "callApi",
          url: "https://api.example.com/check",
          method: "GET",
          includeCredentials: false,
          conditionalActions: [
            {
              actionId: "redirectToVerify",
              conditions: [
                {
                  leftOperand: "{{response.verified}}",
                  operator: "isFalse",
                },
              ],
            },
          ],
          onSuccess: ["setUserVariable"],
        },
      ],
      [
        "redirectToVerify",
        {
          id: "redirectToVerify",
          type: "redirect",
          url: "/verify-email",
          status: 302,
        },
      ],
      [
        "setUserVariable",
        {
          id: "setUserVariable",
          type: "setVariable",
          variableName: "isVerified",
          value: "true",
        },
      ],
    ]);

    const result = await executeActionChain(actions, ["checkAuth"], {
      cookies: {},
      variables: {},
    });

    // Should NOT redirect (user is verified)
    expect(result.redirect).toBeUndefined();
    // Should execute onSuccess chain instead
    expect(result.variableUpdates).toEqual({ isVerified: true });
  });

  test("handles multiple conditional branches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ status: "pending", code: "EMAIL_UNVERIFIED" }),
      })
    );

    const actions = new Map<string, ServerAction>([
      [
        "checkStatus",
        {
          id: "checkStatus",
          type: "callApi",
          url: "https://api.example.com/status",
          method: "GET",
          includeCredentials: false,
          conditionalActions: [
            {
              actionId: "redirectToDashboard",
              conditions: [
                {
                  leftOperand: "{{response.status}}",
                  operator: "equals",
                  rightOperand: '"active"',
                },
              ],
            },
            {
              actionId: "redirectToVerify",
              conditions: [
                {
                  leftOperand: "{{response.status}}",
                  operator: "equals",
                  rightOperand: '"pending"',
                },
                {
                  leftOperand: "{{response.code}}",
                  operator: "equals",
                  rightOperand: '"EMAIL_UNVERIFIED"',
                },
              ],
            },
            {
              actionId: "redirectToSubscribe",
              conditions: [
                {
                  leftOperand: "{{response.status}}",
                  operator: "equals",
                  rightOperand: '"pending"',
                },
                {
                  leftOperand: "{{response.code}}",
                  operator: "equals",
                  rightOperand: '"SUBSCRIPTION_EXPIRED"',
                },
              ],
            },
          ],
        },
      ],
      [
        "redirectToDashboard",
        {
          id: "redirectToDashboard",
          type: "redirect",
          url: "/dashboard",
          status: 302,
        },
      ],
      [
        "redirectToVerify",
        {
          id: "redirectToVerify",
          type: "redirect",
          url: "/verify-email",
          status: 302,
        },
      ],
      [
        "redirectToSubscribe",
        {
          id: "redirectToSubscribe",
          type: "redirect",
          url: "/subscribe",
          status: 302,
        },
      ],
    ]);

    const result = await executeActionChain(actions, ["checkStatus"], {
      cookies: {},
      variables: {},
    });

    // Should match the EMAIL_UNVERIFIED condition
    expect(result.redirect?.url).toBe("/verify-email");
  });
});
