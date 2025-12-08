import {
  forwardRef,
  useCallback,
  useState,
  type ElementRef,
  type ComponentProps,
} from "react";

type State = "initial" | "success" | "error" | "loading";

/**
 * Server action type - matches the SDK schema
 */
interface ServerAction {
  id: string;
  type: string;
  [key: string]: unknown;
}

/**
 * Result of action execution - passed to onActionResult callback
 */
interface ActionResult {
  success: boolean;
  error?: string;
  data?: unknown;
  variableUpdates?: Record<string, unknown>;
}

type Props = ComponentProps<"form"> & {
  encType?:
    | "application/x-www-form-urlencoded"
    | "multipart/form-data"
    | "text/plain";
  /** Use this property to reveal the Success and Error states on the canvas so they can be styled. The Initial state is displayed when the page first opens. The Success and Error states are displayed depending on whether the Form submits successfully or unsuccessfully. */
  state?: State;
  onStateChange?: (state: State) => void;
  /**
   * Server-side actions to execute on form submit.
   * When provided, these actions are executed server-side enabling:
   * - httpOnly cookies (secure authentication)
   * - Server-proxied API calls
   * - Redirects after login
   *
   * The legacy `action` resource prop is still supported for backward compatibility.
   */
  onSubmitActions?: ServerAction[];
  /**
   * Callback invoked with the result of action execution.
   * Provides access to success/error status, error messages, and response data.
   * Can be used to display error messages or update UI based on response.
   */
  onActionResult?: (result: ActionResult) => void;
};

/**
 * Collect form data from a form element
 */
const collectFormData = (form: HTMLFormElement): Record<string, unknown> => {
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
 * Check if we're in an iframe (builder canvas)
 */
const isInIframe = (): boolean => {
  try {
    return window.self !== window.top;
  } catch {
    // Cross-origin access blocked - we're in an iframe
    return true;
  }
};

/**
 * Execute server actions via postMessage (for cross-origin builder preview)
 */
const executeViaPostMessage = (options: {
  actions: ServerAction[];
  formData: Record<string, unknown>;
}): Promise<{
  success: boolean;
  redirect?: { url: string };
  error?: string;
}> => {
  return new Promise((resolve) => {
    const requestId = Math.random().toString(36).substring(2, 15);

    // Listen for response
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = event.data;
        if (
          typeof data === "object" &&
          data !== null &&
          "action" in data &&
          data.action?.type === "executeActionsResponse" &&
          data.action?.payload?.requestId === requestId
        ) {
          window.removeEventListener("message", handleMessage);
          const result = data.action.payload.result ?? {
            success: false,
            error: "No result received",
          };

          // Handle redirect - redirect the top window, not the iframe
          // In builder preview mode, we're in an iframe and should redirect the parent
          if (result.redirect) {
            try {
              // Try to redirect the top-level window
              if (window.top && window.top !== window.self) {
                window.top.location.href = result.redirect.url;
              } else {
                window.location.href = result.redirect.url;
              }
            } catch {
              // Cross-origin access blocked, fallback to current window
              window.location.href = result.redirect.url;
            }
            resolve({ success: true });
            return;
          }

          resolve(result);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    window.addEventListener("message", handleMessage);

    // Set timeout to clean up listener
    setTimeout(() => {
      window.removeEventListener("message", handleMessage);
      resolve({ success: false, error: "Action execution timed out" });
    }, 30000);

    // Send request to parent (builder)
    window.parent.postMessage(
      {
        action: {
          type: "executeActionsRequest",
          payload: {
            requestId,
            actions: options.actions,
            formData: options.formData,
          },
        },
        token: "development-token", // Match the token in pubsub create.ts for dev mode
      },
      "*"
    );
  });
};

/**
 * Execute server actions via postMessage (when in builder preview iframe)
 * or directly via the actions endpoint (when in published site)
 */
const executeServerActions = async (options: {
  actions: ServerAction[];
  formData: Record<string, unknown>;
}): Promise<{
  success: boolean;
  redirect?: { url: string };
  error?: string;
}> => {
  try {
    // If we're in an iframe (builder canvas), use postMessage to communicate
    // with the builder which will execute the actions server-side
    if (isInIframe()) {
      return await executeViaPostMessage(options);
    }

    // Direct fetch for published sites (not in iframe)
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

    // Handle redirect response
    if (response.redirected) {
      window.location.href = response.url;
      return { success: true };
    }

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      return {
        success: false,
        error: errorData.error ?? `HTTP ${response.status}`,
      };
    }

    const result = (await response.json()) as {
      success?: boolean;
      redirect?: { url: string };
      error?: string;
    };

    // Handle redirect from result
    if (result.redirect) {
      window.location.href = result.redirect.url;
      return { success: true };
    }

    return {
      success: result.success ?? true,
      error: result.error,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
};

export const WebhookForm = forwardRef<ElementRef<"form">, Props>(
  (
    {
      children,
      state = "initial",
      onStateChange,
      onSubmitActions,
      onActionResult,
      onSubmit,
      action,
      ...props
    },
    ref
  ) => {
    // When onSubmitActions is provided, we use fetch-based submission
    // so we need to remove the action attribute to prevent native form submission
    const useActionsSystem = onSubmitActions && onSubmitActions.length > 0;

    // Track last error message for display
    const [errorMessage, setErrorMessage] = useState<string | undefined>();

    const handleSubmit = useCallback(
      async (event: React.FormEvent<HTMLFormElement>) => {
        // If onSubmitActions is provided, use the new server-side actions system
        if (useActionsSystem) {
          event.preventDefault();

          // Clear previous error
          setErrorMessage(undefined);

          // Collect form data
          const form = event.currentTarget;
          const formData = collectFormData(form);

          // Update state to loading
          onStateChange?.("loading");

          // Execute server actions
          const result = await executeServerActions({
            actions: onSubmitActions!,
            formData,
          });

          // Store error message for display
          if (!result.success && result.error) {
            setErrorMessage(result.error);
          }

          // Notify about the result
          onActionResult?.({
            success: result.success,
            error: result.error,
            data: (result as { data?: unknown }).data,
            variableUpdates: (
              result as { variableUpdates?: Record<string, unknown> }
            ).variableUpdates,
          });

          if (result.success) {
            onStateChange?.("success");
          } else {
            onStateChange?.("error");
          }
        } else {
          // Fall back to the original onSubmit handler (legacy resource behavior)
          onSubmit?.(event);
        }
      },
      [
        useActionsSystem,
        onSubmitActions,
        onStateChange,
        onActionResult,
        onSubmit,
      ]
    );

    return (
      <form
        {...props}
        // Only include action if NOT using the actions system
        // This prevents native form submission when using fetch
        action={useActionsSystem ? undefined : action}
        ref={ref}
        data-state={state}
        // Expose error message via data attribute for styling/scripting
        data-error={errorMessage ?? undefined}
        onSubmit={handleSubmit}
      >
        {children}
      </form>
    );
  }
);

WebhookForm.displayName = "WebhookForm";
