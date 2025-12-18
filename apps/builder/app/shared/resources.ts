import { atom, computed } from "nanostores";
import hash from "@emotion/hash";
import type { DataSource, Resource, ResourceRequest } from "@webstudio-is/sdk";
import { restResourcesLoader } from "./router-utils";
import { computeExpression } from "./data-variables";
import { fetch } from "./fetch.client";

const MAX_PENDING_RESOURCES = 5;

export const getResourceKey = (resource: ResourceRequest) => {
  try {
    return hash(
      JSON.stringify([
        // explicitly list all fields to keep hash stable
        resource.name,
        resource.method,
        resource.url,
        resource.searchParams,
        resource.headers,
        resource.body,
      ])
    );
  } catch {
    // guard from invalid resources
    return "";
  }
};

const queue = new Map<string, ResourceRequest>();
const pending = new Map<string, ResourceRequest>();
const cache = new Map<string, unknown>();

export const $resourcesCache = atom(cache);

const updateCache = () => {
  $resourcesCache.set(new Map(cache));
};

const $pendingUpdater = atom({});

const updatePending = () => {
  $pendingUpdater.set({});
};

export const $hasPendingResources = computed(
  $pendingUpdater,
  () => queue.size > 0 || pending.size > 0
);

const loadResources = async () => {
  const list = Array.from(queue.values()).slice(0, MAX_PENDING_RESOURCES);
  for (const resource of list) {
    const key = getResourceKey(resource);
    queue.delete(key);
    pending.set(key, resource);
  }
  updatePending();
  const response = await fetch(restResourcesLoader(), {
    method: "POST",
    body: JSON.stringify(Array.from(pending.values())),
  });
  if (response.ok) {
    const results = new Map<string, unknown>(await response.json());
    for (const [key, result] of results) {
      cache.set(key, result);
      pending.delete(key);
    }
  }
  updateCache();
  updatePending();
  // restart loading until queue is empty
  scheduleLoading();
};

let timeoutId: undefined | number;

const scheduleLoading = () => {
  // scheduling will be restarted after finishing pending one
  // skip when there is nothing in queue
  if (pending.size > 0 || queue.size === 0) {
    return;
  }
  window.clearTimeout(timeoutId);
  // start loading after one second of "preload" call
  timeoutId = window.setTimeout(loadResources, 1000);
};

export const preloadResource = (resource: ResourceRequest) => {
  const key = getResourceKey(resource);
  if (queue.has(key) || pending.has(key) || cache.has(key)) {
    return;
  }
  // deduplicate resources in queue
  queue.set(key, resource);
  updatePending();
  scheduleLoading();
};

export const invalidateResource = (resource: ResourceRequest) => {
  const key = getResourceKey(resource);
  cache.delete(key);
  preloadResource(resource);
};

export const computeResourceRequest = (
  resource: Resource,
  values: Map<DataSource["id"], unknown>
): ResourceRequest => {
  const request: ResourceRequest = {
    name: resource.name,
    method: resource.method,
    url: computeExpression(resource.url, values),
    searchParams: (resource.searchParams ?? []).map(({ name, value }) => ({
      name,
      value: computeExpression(value, values),
    })),
    headers: resource.headers.map(({ name, value }) => ({
      name,
      value: computeExpression(value, values),
    })),
  };
  if (resource.body !== undefined) {
    request.body = computeExpression(resource.body, values);
  }
  return request;
};

/**
 * Action config type for CallApi actions
 */
type CallApiActionConfig = {
  id: string;
  url?: string;
  method?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: string;
};

/**
 * Convert a CallApi action config to a ResourceRequest for caching.
 * This allows actions to use the same caching infrastructure as resources.
 *
 * @param action - The CallApi action configuration
 * @param values - Variable values for expression evaluation
 * @param testCredentials - Optional test credentials for formData substitution
 */
export const computeActionRequest = (
  action: CallApiActionConfig,
  values: Map<DataSource["id"], unknown>,
  testCredentials?: Record<string, string>
): ResourceRequest => {
  // Merge test credentials into a formData-like structure for expression evaluation
  const mergedValues = new Map(values);
  if (testCredentials && Object.keys(testCredentials).length > 0) {
    mergedValues.set("formData", testCredentials);
  }

  const request: ResourceRequest = {
    name: `action_${action.id}`,
    method: (action.method ?? "POST").toLowerCase() as
      | "get"
      | "post"
      | "put"
      | "delete",
    url: action.url ? computeExpression(action.url, mergedValues) : "",
    searchParams: [],
    headers: (action.headers ?? []).map(({ name, value }) => ({
      name,
      value: computeExpression(value, mergedValues),
    })),
  };
  if (action.body !== undefined) {
    request.body = computeExpression(action.body, mergedValues);
  }
  return request;
};
