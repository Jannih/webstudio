import { atom } from "nanostores";
import { createPubsub } from "./create";

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

export interface PubsubMap {
  command: {
    source: string;
    name: string;
  };
  /**
   * Request from canvas to execute server actions
   */
  executeActionsRequest: {
    requestId: string;
    actions: ServerAction[];
    formData: Record<string, unknown>;
  };
  /**
   * Response from builder with action execution result
   */
  executeActionsResponse: {
    requestId: string;
    result: ActionExecutionResult;
  };
}

export const { publish, usePublish, useSubscribe, subscribe } =
  createPubsub<PubsubMap>();
export type Publish = typeof publish;
export type UsePublish = typeof usePublish;

export const $publisher = atom<{ publish?: Publish }>({});
