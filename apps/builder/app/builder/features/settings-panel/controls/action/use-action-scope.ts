import { useMemo } from "react";
import { useStore } from "@nanostores/react";
import { $instances, $props } from "~/shared/nano-states";
import { $selectedInstanceKeyWithRoot } from "~/shared/awareness";
import { $selectedInstanceScope } from "../../shared";
import { findParentForm, extractFormFieldNames } from "./form-fields";

/**
 * Hook that creates scope and aliases for action configuration.
 * Extends the base instance scope with formData fields extracted from the parent form.
 */
export const useActionScope = (
  testCredentials?: Record<string, string>
): { scope: Record<string, unknown>; aliases: Map<string, string> } => {
  const instances = useStore($instances);
  const props = useStore($props);
  const selectedInstanceKey = useStore($selectedInstanceKeyWithRoot);
  const baseScope = useStore($selectedInstanceScope);

  return useMemo(() => {
    const scope: Record<string, unknown> = { ...baseScope.scope };
    const aliases = new Map<string, string>(baseScope.aliases);

    // Find the parent Form for the selected instance
    if (selectedInstanceKey) {
      // Extract instance ID from instance key (format: "instanceId" or "instanceId,parentId,...")
      const instanceId = selectedInstanceKey.split(",")[0];
      const formInstanceId = findParentForm(instances, instanceId);

      if (formInstanceId) {
        // Extract form field names
        const fieldNames = extractFormFieldNames(
          formInstanceId,
          instances,
          props
        );

        // Create formData object with field names as keys
        // Use test credentials if provided, otherwise use empty string placeholders
        const formData: Record<string, string> = {};
        for (const fieldName of fieldNames) {
          formData[fieldName] = testCredentials?.[fieldName] ?? "";
        }

        // Add formData to scope
        scope["formData"] = formData;
        aliases.set("formData", "Form Data");
      }
    }

    return { scope, aliases };
  }, [instances, props, selectedInstanceKey, baseScope, testCredentials]);
};

/**
 * Get form field names for the selected instance's parent form.
 * Useful for displaying which fields are available.
 */
export const useFormFieldNames = (): string[] => {
  const instances = useStore($instances);
  const props = useStore($props);
  const selectedInstanceKey = useStore($selectedInstanceKeyWithRoot);

  return useMemo(() => {
    if (!selectedInstanceKey) {
      return [];
    }

    const instanceId = selectedInstanceKey.split(",")[0];
    const formInstanceId = findParentForm(instances, instanceId);

    if (!formInstanceId) {
      return [];
    }

    return extractFormFieldNames(formInstanceId, instances, props);
  }, [instances, props, selectedInstanceKey]);
};
