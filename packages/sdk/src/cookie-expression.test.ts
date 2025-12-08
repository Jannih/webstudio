import { describe, it, expect } from "vitest";
import {
  cookieFunctions,
  hasCookieReference,
  getCookieReferences,
  evaluateCookieExpression,
  isAuthenticated,
  parseCookieHeader,
  serializeCookie,
  type CookieContext,
} from "./cookie-expression";

describe("cookieFunctions", () => {
  const context: CookieContext = {
    cookies: {
      access_token: "abc123",
      session_id: "xyz789",
    },
  };

  describe("getCookie", () => {
    it("returns cookie value when cookie exists", () => {
      expect(cookieFunctions.getCookie("access_token", context)).toBe("abc123");
    });

    it("returns null when cookie does not exist", () => {
      expect(cookieFunctions.getCookie("nonexistent", context)).toBeNull();
    });
  });

  describe("getHttpOnlyCookie", () => {
    it("returns cookie value when cookie exists", () => {
      expect(cookieFunctions.getHttpOnlyCookie("access_token", context)).toBe(
        "abc123"
      );
    });

    it("returns null when cookie does not exist", () => {
      expect(
        cookieFunctions.getHttpOnlyCookie("nonexistent", context)
      ).toBeNull();
    });
  });

  describe("hasCookie", () => {
    it("returns true when cookie exists", () => {
      expect(cookieFunctions.hasCookie("access_token", context)).toBe(true);
    });

    it("returns false when cookie does not exist", () => {
      expect(cookieFunctions.hasCookie("nonexistent", context)).toBe(false);
    });
  });
});

describe("hasCookieReference", () => {
  it("detects template syntax", () => {
    expect(hasCookieReference("{{cookies.token}}")).toBe(true);
    expect(hasCookieReference("Bearer {{cookies.access_token}}")).toBe(true);
  });

  it("detects function calls", () => {
    expect(hasCookieReference('getCookie("token")')).toBe(true);
    expect(hasCookieReference("getHttpOnlyCookie('token')")).toBe(true);
    expect(hasCookieReference('hasCookie("token")')).toBe(true);
  });

  it("returns false for no cookie references", () => {
    expect(hasCookieReference("hello world")).toBe(false);
    expect(hasCookieReference("{{variables.name}}")).toBe(false);
  });
});

describe("getCookieReferences", () => {
  it("extracts cookie names from template syntax", () => {
    const refs = getCookieReferences("{{cookies.token}} and {{cookies.user}}");
    expect(refs.has("token")).toBe(true);
    expect(refs.has("user")).toBe(true);
    expect(refs.size).toBe(2);
  });

  it("extracts cookie names from function calls", () => {
    const refs = getCookieReferences(
      'getCookie("token") && hasCookie("session")'
    );
    expect(refs.has("token")).toBe(true);
    expect(refs.has("session")).toBe(true);
  });

  it("handles mixed syntax", () => {
    const refs = getCookieReferences(
      '{{cookies.token}} && getCookie("session")'
    );
    expect(refs.has("token")).toBe(true);
    expect(refs.has("session")).toBe(true);
  });

  it("returns empty set for no references", () => {
    const refs = getCookieReferences("no cookies here");
    expect(refs.size).toBe(0);
  });
});

describe("evaluateCookieExpression", () => {
  const context: CookieContext = {
    cookies: {
      access_token: "abc123",
      user_id: "user456",
    },
  };

  describe("template syntax", () => {
    it("replaces single template", () => {
      expect(
        evaluateCookieExpression("{{cookies.access_token}}", context)
      ).toBe("abc123");
    });

    it("replaces multiple templates", () => {
      expect(
        evaluateCookieExpression(
          "Token: {{cookies.access_token}}, User: {{cookies.user_id}}",
          context
        )
      ).toBe("Token: abc123, User: user456");
    });

    it("returns null for missing cookie (single template)", () => {
      expect(
        evaluateCookieExpression("{{cookies.nonexistent}}", context)
      ).toBeNull();
    });

    it("replaces missing cookie with empty string in mixed content", () => {
      expect(
        evaluateCookieExpression("Token: {{cookies.nonexistent}}!", context)
      ).toBe("Token: !");
    });
  });

  describe("function calls", () => {
    it("evaluates getCookie", () => {
      expect(
        evaluateCookieExpression('getCookie("access_token")', context)
      ).toBe("abc123");
    });

    it("evaluates getHttpOnlyCookie", () => {
      expect(
        evaluateCookieExpression('getHttpOnlyCookie("access_token")', context)
      ).toBe("abc123");
    });

    it("evaluates hasCookie for existing cookie", () => {
      expect(
        evaluateCookieExpression('hasCookie("access_token")', context)
      ).toBe(true);
    });

    it("evaluates hasCookie for missing cookie", () => {
      expect(
        evaluateCookieExpression('hasCookie("nonexistent")', context)
      ).toBe(false);
    });

    it("returns null for getCookie with missing cookie", () => {
      expect(
        evaluateCookieExpression('getCookie("nonexistent")', context)
      ).toBeNull();
    });
  });

  describe("comparison expressions", () => {
    it("evaluates getCookie != null (exists)", () => {
      expect(
        evaluateCookieExpression('getCookie("access_token") != null', context)
      ).toBe(true);
    });

    it("evaluates getCookie != null (not exists)", () => {
      expect(
        evaluateCookieExpression('getCookie("nonexistent") != null', context)
      ).toBe(false);
    });

    it("evaluates getCookie == null (not exists)", () => {
      expect(
        evaluateCookieExpression('getCookie("nonexistent") == null', context)
      ).toBe(true);
    });

    it("evaluates getCookie === null (not exists)", () => {
      expect(
        evaluateCookieExpression('getCookie("nonexistent") === null', context)
      ).toBe(true);
    });

    it("evaluates getCookie !== null (exists)", () => {
      expect(
        evaluateCookieExpression('getCookie("access_token") !== null', context)
      ).toBe(true);
    });
  });

  it("returns expression unchanged if no cookie references", () => {
    expect(evaluateCookieExpression("hello world", context)).toBe(
      "hello world"
    );
  });
});

describe("isAuthenticated", () => {
  it("returns true when access_token exists", () => {
    expect(isAuthenticated({ cookies: { access_token: "abc123" } })).toBe(true);
  });

  it("returns false when access_token is missing", () => {
    expect(isAuthenticated({ cookies: {} })).toBe(false);
  });

  it("returns false when access_token is empty", () => {
    expect(isAuthenticated({ cookies: { access_token: "" } })).toBe(false);
  });

  it("uses custom cookie name", () => {
    expect(isAuthenticated({ cookies: { session: "abc123" } }, "session")).toBe(
      true
    );
  });
});

describe("parseCookieHeader", () => {
  it("parses simple cookie header", () => {
    const cookies = parseCookieHeader("access_token=abc123");
    expect(cookies).toEqual({ access_token: "abc123" });
  });

  it("parses multiple cookies", () => {
    const cookies = parseCookieHeader("access_token=abc123; session_id=xyz789");
    expect(cookies).toEqual({
      access_token: "abc123",
      session_id: "xyz789",
    });
  });

  it("handles cookies with = in value", () => {
    const cookies = parseCookieHeader("data=key=value");
    expect(cookies).toEqual({ data: "key=value" });
  });

  it("handles URL-encoded values", () => {
    const cookies = parseCookieHeader("name=hello%20world");
    expect(cookies).toEqual({ name: "hello world" });
  });

  it("returns empty object for empty header", () => {
    expect(parseCookieHeader("")).toEqual({});
  });

  it("trims whitespace around cookie name", () => {
    const cookies = parseCookieHeader("  token=abc123;  name=value");
    expect(cookies).toEqual({ token: "abc123", name: "value" });
  });
});

describe("serializeCookie", () => {
  it("serializes simple cookie", () => {
    const result = serializeCookie("name", "value");
    expect(result).toBe("name=value");
  });

  it("URL-encodes name and value", () => {
    const result = serializeCookie("my cookie", "hello world");
    expect(result).toBe("my%20cookie=hello%20world");
  });

  it("adds HttpOnly flag", () => {
    const result = serializeCookie("name", "value", { httpOnly: true });
    expect(result).toBe("name=value; HttpOnly");
  });

  it("adds Secure flag", () => {
    const result = serializeCookie("name", "value", { secure: true });
    expect(result).toBe("name=value; Secure");
  });

  it("adds SameSite", () => {
    const result = serializeCookie("name", "value", { sameSite: "strict" });
    expect(result).toBe("name=value; SameSite=strict");
  });

  it("adds Path", () => {
    const result = serializeCookie("name", "value", { path: "/" });
    expect(result).toBe("name=value; Path=/");
  });

  it("adds Max-Age", () => {
    const result = serializeCookie("name", "value", { maxAge: 3600 });
    expect(result).toBe("name=value; Max-Age=3600");
  });

  it("adds Expires", () => {
    const expires = new Date("2024-01-01T00:00:00Z");
    const result = serializeCookie("name", "value", { expires });
    expect(result).toBe("name=value; Expires=Mon, 01 Jan 2024 00:00:00 GMT");
  });

  it("adds Domain", () => {
    const result = serializeCookie("name", "value", { domain: ".example.com" });
    expect(result).toBe("name=value; Domain=.example.com");
  });

  it("combines all options", () => {
    const result = serializeCookie("token", "abc123", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 604800,
    });
    expect(result).toBe(
      "token=abc123; HttpOnly; Secure; SameSite=lax; Path=/; Max-Age=604800"
    );
  });
});
