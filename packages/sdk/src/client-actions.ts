/**
 * Client-side utilities for executing server actions
 *
 * This module provides the bridge between client-side form submissions
 * and server-side action execution for authentication flows.
 */

import type { ServerAction } from "./schema/actions";

/**
 * Result returned from server action execution
 */
export interface ActionExecutionResult {
  success: boolean;
  /** Redirect URL if a redirect action was executed */
  redirect?: {
    url: string;
    status: number;
  };
  /** Variable updates from SetVariable actions */
  variableUpdates?: Record<string, unknown>;
  /** Response data from CallApi actions */
  response?: unknown;
  /** Error message if execution failed */
  error?: string;
  /** Cookies that were set (names only, values are httpOnly) */
  cookiesSet?: string[];
}

/**
 * Options for executing server actions
 */
export interface ExecuteActionsOptions {
  /** The actions to potentially execute (full action definitions) */
  actions: ServerAction[];
  /** IDs of actions to execute (in order) */
  executeIds: string[];
  /** Form data to pass to actions (available as {{formData.x}}) */
  formData?: Record<string, unknown>;
  /** Additional variables to pass to actions */
  variables?: Record<string, unknown>;
  /** CSRF token for protection */
  csrfToken?: string;
}

/**
 * Execute server actions from the client
 *
 * This function POSTs to the /rest/actions endpoint which executes
 * the action chain server-side, setting cookies and handling redirects.
 *
 * @example
 * ```typescript
 * const result = await executeServerActions({
 *   actions: [
 *     { id: "login", type: "callApi", url: "/api/auth", method: "POST", ... },
 *     { id: "setCookie", type: "setCookie", name: "token", value: "{{response.token}}", ... },
 *     { id: "redirect", type: "redirect", url: "/dashboard", ... }
 *   ],
 *   executeIds: ["login"],
 *   formData: { email: "user@example.com", password: "secret" }
 * });
 *
 * if (result.redirect) {
 *   window.location.href = result.redirect.url;
 * }
 * ```
 */
export const executeServerActions = async (
  options: ExecuteActionsOptions
): Promise<ActionExecutionResult> => {
  const { actions, executeIds, formData, variables, csrfToken } = options;

  try {
    const response = await fetch("/rest/actions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      },
      credentials: "include", // Important: include cookies
      body: JSON.stringify({
        actions,
        executeIds,
        formData,
        variables,
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      return {
        success: false,
        error: errorData.error || `HTTP ${response.status}`,
      };
    }

    const result = (await response.json()) as {
      success?: boolean;
      redirect?: { url: string; status: number };
      variableUpdates?: Record<string, unknown>;
      response?: unknown;
      cookiesSet?: string[];
      error?: string;
    };

    // Note: Set-Cookie headers are automatically processed by the browser
    // We just need to handle redirects and variable updates

    return {
      success: result.success ?? true,
      redirect: result.redirect,
      variableUpdates: result.variableUpdates,
      response: result.response,
      cookiesSet: result.cookiesSet,
      error: result.error,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
};

/**
 * Collect form data from a form element
 *
 * @param form - The form element to collect data from
 * @returns Object with form field names and values
 */
export const collectFormData = (
  form: HTMLFormElement
): Record<string, unknown> => {
  const formData = new FormData(form);
  const data: Record<string, unknown> = {};

  for (const [key, value] of formData.entries()) {
    // Handle multiple values for same field (e.g., checkboxes)
    if (key in data) {
      const existing = data[key];
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        data[key] = [existing, value];
      }
    } else {
      data[key] = value;
    }
  }

  return data;
};

/**
 * Create a form submit handler that executes server actions
 *
 * @example
 * ```tsx
 * const handleSubmit = createActionFormHandler({
 *   actions: pageActions,
 *   executeIds: ["login-action"],
 *   onSuccess: (result) => console.log("Login successful"),
 *   onError: (error) => setError(error),
 *   onRedirect: (url) => navigate(url),
 * });
 *
 * <form onSubmit={handleSubmit}>
 *   <input name="email" />
 *   <input name="password" type="password" />
 *   <button type="submit">Login</button>
 * </form>
 * ```
 */
export const createActionFormHandler = (options: {
  actions: ServerAction[];
  executeIds: string[];
  variables?: Record<string, unknown>;
  csrfToken?: string;
  onSuccess?: (result: ActionExecutionResult) => void;
  onError?: (error: string) => void;
  onRedirect?: (url: string) => void;
  onVariableUpdate?: (updates: Record<string, unknown>) => void;
}) => {
  return async (event: React.FormEvent<HTMLFormElement> | Event) => {
    event.preventDefault();

    const form = event.currentTarget as HTMLFormElement;
    const formData = collectFormData(form);

    const result = await executeServerActions({
      actions: options.actions,
      executeIds: options.executeIds,
      formData,
      variables: options.variables,
      csrfToken: options.csrfToken,
    });

    if (result.success) {
      options.onSuccess?.(result);

      if (result.variableUpdates) {
        options.onVariableUpdate?.(result.variableUpdates);
      }

      if (result.redirect) {
        if (options.onRedirect) {
          options.onRedirect(result.redirect.url);
        } else {
          // Default: navigate to redirect URL
          window.location.href = result.redirect.url;
        }
      }
    } else {
      options.onError?.(result.error || "Action failed");
    }

    return result;
  };
};

/**
 * Hook-like function for React components to use server actions
 * (Note: This is a factory, not a true hook - can be used in event handlers)
 *
 * @example
 * ```tsx
 * function LoginForm({ actions }) {
 *   const [state, setState] = useState("initial");
 *   const [error, setError] = useState("");
 *
 *   const handleSubmit = async (e) => {
 *     e.preventDefault();
 *     setState("loading");
 *
 *     const result = await executeServerActions({
 *       actions,
 *       executeIds: ["login"],
 *       formData: collectFormData(e.target)
 *     });
 *
 *     if (result.success) {
 *       setState("success");
 *       if (result.redirect) window.location.href = result.redirect.url;
 *     } else {
 *       setState("error");
 *       setError(result.error);
 *     }
 *   };
 *
 *   return <form onSubmit={handleSubmit}>...</form>;
 * }
 * ```
 */
