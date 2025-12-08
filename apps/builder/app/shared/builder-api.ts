import { createRecursiveProxy } from "@trpc/server/shared";
import invariant from "tiny-invariant";
import { toast } from "@webstudio-is/design-system";
import { uploadAssets } from "~/builder/shared/assets/use-assets";
import { fetch } from "~/shared/fetch.client";

const apiWindowNamespace = "__webstudio__$__builderApi";

type ToastHandler = (message: string) => void;

/**
 * Server action type for action execution
 */
interface ServerAction {
  id: string;
  type: string;
  [key: string]: unknown;
}

/**
 * Result of executing server actions
 */
interface ActionExecutionResult {
  success: boolean;
  redirect?: { url: string };
  error?: string;
  data?: unknown;
  variableUpdates?: Record<string, unknown>;
}

const _builderApi = {
  isInitialized: () => true,
  toast: {
    info: toast.info as ToastHandler,
    warn: toast.warn as ToastHandler,
    error: toast.error as ToastHandler,
    success: toast.success as ToastHandler,
  },
  uploadImages: async (srcs: string[]) => {
    const urlToIds = await uploadAssets(
      "image",
      srcs.map((src) => new URL(src))
    );

    return new Map([...urlToIds.entries()].map(([url, id]) => [url.href, id]));
  },
  /**
   * Execute server actions from the canvas (builder preview mode)
   * This method is called from the canvas iframe to execute actions
   * with proper CSRF token authentication.
   */
  executeActions: async (options: {
    actions: ServerAction[];
    formData: Record<string, unknown>;
  }): Promise<ActionExecutionResult> => {
    try {
      const executeIds = options.actions.map((action) => action.id);

      const response = await fetch("/rest/actions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          actions: options.actions,
          executeIds,
          formData: options.formData,
          variables: {},
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        try {
          const errorData = JSON.parse(errorText) as { error?: string };
          return {
            success: false,
            error: errorData.error ?? `HTTP ${response.status}`,
          };
        } catch {
          return {
            success: false,
            error: `HTTP ${response.status}: ${errorText.substring(0, 100)}`,
          };
        }
      }

      const result = (await response.json()) as ActionExecutionResult;

      return {
        success: result.success ?? true,
        redirect: result.redirect,
        error: result.error,
        data: result.data,
        variableUpdates: result.variableUpdates,
      };
    } catch (error) {
      console.error("[builderApi.executeActions] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Network error",
      };
    }
  },
};

declare global {
  interface Window {
    [apiWindowNamespace]: typeof _builderApi;
  }
}

const isInTop = () => {
  try {
    return window.self === window.top;
  } catch {
    return true;
  }
};

const getTopApi = () => {
  if (isInTop()) {
    // Inside the iframe, use the local window.api
    return _builderApi;
  } else {
    // Find first iframe with the API
    invariant(window.top);
    return window.top[apiWindowNamespace];
  }
};

const isKeyOf = <T>(key: unknown, obj: T): key is keyof T => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  return key in obj;
};

/**
 * Forwards the call from the builder to the iframe, invoking the original API in the iframe.
 */
export const builderApi = createRecursiveProxy((options) => {
  const api = getTopApi();

  if (api == null) {
    if (
      options.path.join(".") ===
      ("isInitialized" satisfies keyof typeof _builderApi)
    ) {
      return false;
    }

    console.warn(
      `API not found in the iframe, skipping ${options.path.join(".")} call, iframe probably not loaded yet`
    );
    return null;
  }

  let currentMethod = api as unknown;

  for (const key of options.path) {
    invariant(
      isKeyOf(key, currentMethod),
      `API method ${options.path.join(".")} not found`
    );
    invariant(typeof currentMethod === "object");
    invariant(currentMethod != null);

    currentMethod = currentMethod[key];
  }

  invariant(
    typeof currentMethod === "function",
    `API method ${options.path.join(".")} is not a function`
  );

  return currentMethod.call(null, ...options.args);
}) as typeof _builderApi;

/**
 * Initializes the builder API in the window. Must be called in the builder context.
 */
export const initBuilderApi = () => {
  if (isInTop()) {
    window[apiWindowNamespace] = _builderApi;
  }
  return () => {};
};
