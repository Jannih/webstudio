/**
 * Hook to handle server action execution requests from the canvas
 *
 * When the canvas is in preview mode on a subdomain, it cannot directly
 * call the /rest/actions endpoint due to cross-origin restrictions.
 * Instead, it sends a postMessage to the builder, which executes the
 * action on behalf of the canvas and sends the result back.
 */

import { useEffect, useRef } from "react";
import { useSubscribe, type Publish } from "~/shared/pubsub";
import { builderApi } from "~/shared/builder-api";

/**
 * Get the canvas iframe element
 */
const getCanvasIframe = (): HTMLIFrameElement | null => {
  // Try multiple selectors to find the canvas iframe
  return document.querySelector("iframe[title]") as HTMLIFrameElement | null;
};

/**
 * Subscribe to action execution requests from the canvas and
 * respond with the result
 */
export const useActionExecutor = (_publish: Publish | undefined) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Keep reference to iframe updated
  useEffect(() => {
    const updateRef = () => {
      iframeRef.current = getCanvasIframe();
    };
    updateRef();

    // Update periodically in case iframe changes
    const interval = setInterval(updateRef, 1000);
    return () => clearInterval(interval);
  }, []);

  useSubscribe("executeActionsRequest", async (payload) => {
    const { requestId, actions, formData } = payload;

    // Execute actions using the builder API
    const result = await builderApi.executeActions({
      actions,
      formData,
    });

    // Send response back to canvas via postMessage
    try {
      const iframe = iframeRef.current ?? getCanvasIframe();

      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(
          {
            action: {
              type: "executeActionsResponse",
              payload: { requestId, result },
            },
            token: "development-token", // Match the token in create.ts for dev mode
          },
          "*"
        );
      } else {
        console.error("[useActionExecutor] No iframe found to send response");
      }
    } catch (error) {
      console.error("[useActionExecutor] Failed to send response:", error);
    }
  });
};
