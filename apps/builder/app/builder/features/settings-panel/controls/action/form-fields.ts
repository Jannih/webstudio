import type { Instance, Instances, Props } from "@webstudio-is/sdk";

/**
 * Form input components that have a "name" attribute
 */
const FORM_FIELD_COMPONENTS = new Set(["Input", "Textarea", "Select"]);

/**
 * Find the parent Form instance for a given instance ID
 */
export const findParentForm = (
  instances: Instances,
  instanceId: Instance["id"]
): Instance["id"] | undefined => {
  // Build parent map
  const parentMap = new Map<Instance["id"], Instance["id"]>();
  for (const instance of instances.values()) {
    for (const child of instance.children) {
      if (child.type === "id") {
        parentMap.set(child.value, instance.id);
      }
    }
  }

  // Traverse up to find Form
  let currentId: Instance["id"] | undefined = instanceId;
  while (currentId) {
    const instance = instances.get(currentId);
    if (instance?.component === "Form") {
      return currentId;
    }
    currentId = parentMap.get(currentId);
  }
  return undefined;
};

/**
 * Extract form field names from Input, Textarea, and Select components
 * within a Form instance tree.
 */
export const extractFormFieldNames = (
  formInstanceId: Instance["id"],
  instances: Instances,
  props: Props
): string[] => {
  const fieldNames: string[] = [];

  // Collect all instance IDs within the form
  const instanceIds = new Set<Instance["id"]>();
  const collectIds = (id: Instance["id"]) => {
    instanceIds.add(id);
    const instance = instances.get(id);
    if (instance) {
      for (const child of instance.children) {
        if (child.type === "id") {
          collectIds(child.value);
        }
      }
    }
  };
  collectIds(formInstanceId);

  // Find all form field components and extract their "name" prop
  for (const instanceId of instanceIds) {
    const instance = instances.get(instanceId);
    if (instance && FORM_FIELD_COMPONENTS.has(instance.component)) {
      // Find the "name" prop for this instance
      for (const prop of props.values()) {
        if (
          prop.instanceId === instanceId &&
          prop.name === "name" &&
          prop.type === "string" &&
          typeof prop.value === "string" &&
          prop.value.length > 0
        ) {
          fieldNames.push(prop.value);
        }
      }
    }
  }

  return fieldNames;
};
