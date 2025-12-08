import type {
  ServerAction,
  ActionContext,
  ActionResult,
  SetCookieAction,
  DeleteCookieAction,
  RedirectAction,
  CallApiAction,
  SetVariableAction,
  ActionCondition,
  ConditionalAction,
  ComparisonOperator,
} from "./schema/actions";

/**
 * Evaluates an expression string, replacing template variables with actual values.
 *
 * Supports:
 * - {{cookies.name}} - Access cookie values
 * - {{variables.name}} - Access variable values
 * - {{formData.name}} - Access form data
 * - {{response}} - Access previous action response
 * - {{response.field}} - Access nested response fields
 *
 * @param expression - The expression string to evaluate
 * @param context - The action context containing cookies, variables, etc.
 * @returns The evaluated string with all templates replaced
 */
export const evaluateExpression = (
  expression: string,
  context: ActionContext
): string => {
  return expression.replace(
    /\{\{([^}]+)\}\}/g,
    (match: string, path: string): string => {
      const parts = path.trim().split(".");
      const [source, ...rest] = parts;

      let value: unknown;

      switch (source) {
        case "cookies":
          value = rest.length > 0 ? context.cookies[rest[0]] : context.cookies;
          break;
        case "variables":
          value =
            rest.length > 0 ? context.variables[rest[0]] : context.variables;
          break;
        case "formData":
          value =
            rest.length > 0 ? context.formData?.[rest[0]] : context.formData;
          break;
        case "response":
          if (rest.length === 0) {
            value = context.response;
          } else {
            // Navigate nested response fields
            value = rest.reduce((obj: unknown, key: string) => {
              if (obj && typeof obj === "object" && key in obj) {
                return (obj as Record<string, unknown>)[key];
              }
              return undefined;
            }, context.response);
          }
          break;
        default:
          return match; // Return original if unknown source
      }

      if (value === undefined || value === null) {
        return "";
      }

      if (typeof value === "object") {
        return JSON.stringify(value);
      }

      return String(value);
    }
  );
};

/**
 * Evaluates an expression and returns the raw value (not stringified)
 * Used for condition evaluation where we need to compare actual values
 */
export const evaluateExpressionValue = (
  expression: string,
  context: ActionContext
): unknown => {
  // Check if the entire expression is a single template
  const singleTemplateMatch = expression.match(/^\{\{([^}]+)\}\}$/);
  if (singleTemplateMatch) {
    const path = singleTemplateMatch[1].trim();
    const parts = path.split(".");
    const [source, ...rest] = parts;

    switch (source) {
      case "cookies":
        return rest.length > 0 ? context.cookies[rest[0]] : context.cookies;
      case "variables":
        return rest.length > 0 ? context.variables[rest[0]] : context.variables;
      case "formData":
        return rest.length > 0 ? context.formData?.[rest[0]] : context.formData;
      case "response":
        if (rest.length === 0) {
          return context.response;
        }
        return rest.reduce((obj: unknown, key: string) => {
          if (obj && typeof obj === "object" && key in obj) {
            return (obj as Record<string, unknown>)[key];
          }
          return undefined;
        }, context.response);
      default:
        // Try to parse as JSON literal
        try {
          return JSON.parse(expression);
        } catch {
          return expression;
        }
    }
  }

  // For non-template expressions, try to parse as JSON or return as string
  try {
    return JSON.parse(expression);
  } catch {
    // If it contains templates, evaluate them
    if (expression.includes("{{")) {
      return evaluateExpression(expression, context);
    }
    return expression;
  }
};

/**
 * Evaluates a single condition
 */
export const evaluateCondition = (
  condition: ActionCondition,
  context: ActionContext
): boolean => {
  const leftValue = evaluateExpressionValue(condition.leftOperand, context);
  const rightValue = condition.rightOperand
    ? evaluateExpressionValue(condition.rightOperand, context)
    : undefined;

  const operator = condition.operator as ComparisonOperator;

  switch (operator) {
    case "equals":
      // eslint-disable-next-line eqeqeq
      return leftValue == rightValue;

    case "notEquals":
      // eslint-disable-next-line eqeqeq
      return leftValue != rightValue;

    case "contains":
      if (typeof leftValue === "string" && typeof rightValue === "string") {
        return leftValue.includes(rightValue);
      }
      if (Array.isArray(leftValue)) {
        return leftValue.includes(rightValue);
      }
      return false;

    case "notContains":
      if (typeof leftValue === "string" && typeof rightValue === "string") {
        return !leftValue.includes(rightValue);
      }
      if (Array.isArray(leftValue)) {
        return !leftValue.includes(rightValue);
      }
      return true;

    case "startsWith":
      return (
        typeof leftValue === "string" &&
        typeof rightValue === "string" &&
        leftValue.startsWith(rightValue)
      );

    case "endsWith":
      return (
        typeof leftValue === "string" &&
        typeof rightValue === "string" &&
        leftValue.endsWith(rightValue)
      );

    case "greaterThan":
      return (
        typeof leftValue === "number" &&
        typeof rightValue === "number" &&
        leftValue > rightValue
      );

    case "lessThan":
      return (
        typeof leftValue === "number" &&
        typeof rightValue === "number" &&
        leftValue < rightValue
      );

    case "greaterThanOrEquals":
      return (
        typeof leftValue === "number" &&
        typeof rightValue === "number" &&
        leftValue >= rightValue
      );

    case "lessThanOrEquals":
      return (
        typeof leftValue === "number" &&
        typeof rightValue === "number" &&
        leftValue <= rightValue
      );

    case "isEmpty":
      if (leftValue === null || leftValue === undefined) {
        return true;
      }
      if (leftValue === "") {
        return true;
      }
      if (Array.isArray(leftValue) && leftValue.length === 0) {
        return true;
      }
      if (
        typeof leftValue === "object" &&
        Object.keys(leftValue).length === 0
      ) {
        return true;
      }
      return false;

    case "isNotEmpty":
      if (leftValue === null || leftValue === undefined) {
        return false;
      }
      if (leftValue === "") {
        return false;
      }
      if (Array.isArray(leftValue) && leftValue.length === 0) {
        return false;
      }
      if (
        typeof leftValue === "object" &&
        Object.keys(leftValue).length === 0
      ) {
        return false;
      }
      return true;

    case "isTrue":
      return Boolean(leftValue);

    case "isFalse":
      return !leftValue;

    case "exists":
      return leftValue !== null && leftValue !== undefined;

    case "notExists":
      return leftValue === null || leftValue === undefined;

    default: {
      // TypeScript exhaustive check
      const _exhaustiveCheck: never = operator;
      console.warn(`Unknown operator: ${_exhaustiveCheck}`);
      return false;
    }
  }
};

/**
 * Evaluates all conditions for a conditional action
 * All conditions must be true (AND logic)
 */
export const evaluateConditions = (
  conditionalAction: ConditionalAction,
  context: ActionContext
): boolean => {
  // No conditions means always execute
  if (
    !conditionalAction.conditions ||
    conditionalAction.conditions.length === 0
  ) {
    return true;
  }

  // All conditions must be true (AND logic)
  return conditionalAction.conditions.every((condition) =>
    evaluateCondition(condition, context)
  );
};

/**
 * Executes a SetCookie action
 */
const executeSetCookie = async (
  action: SetCookieAction,
  context: ActionContext
): Promise<ActionResult> => {
  const value = evaluateExpression(action.value, context);

  return {
    success: true,
    setCookies: [
      {
        name: action.name,
        value,
        options: {
          httpOnly: action.httpOnly ?? true,
          secure: action.secure ?? true,
          sameSite: action.sameSite ?? "lax",
          path: action.path ?? "/",
          maxAge: action.expiresIn ?? 604800, // 7 days default
        },
      },
    ],
  };
};

/**
 * Executes a DeleteCookie action
 */
const executeDeleteCookie = async (
  action: DeleteCookieAction,
  _context: ActionContext
): Promise<ActionResult> => {
  return {
    success: true,
    setCookies: [
      {
        name: action.name,
        value: "",
        options: {
          path: action.path ?? "/",
          maxAge: 0, // Immediately expire
        },
      },
    ],
    deleteCookies: [action.name],
  };
};

/**
 * Executes a Redirect action
 */
const executeRedirect = async (
  action: RedirectAction,
  context: ActionContext
): Promise<ActionResult> => {
  const url = evaluateExpression(action.url, context);

  return {
    success: true,
    redirect: {
      url,
      status: action.status ?? 302,
    },
  };
};

/**
 * Executes a CallApi action
 */
const executeCallApi = async (
  action: CallApiAction,
  context: ActionContext
): Promise<ActionResult> => {
  try {
    const url = evaluateExpression(action.url, context);

    // Build headers
    const headers: Record<string, string> = {};

    // Add custom headers
    if (action.headers) {
      for (const header of action.headers) {
        headers[header.name] = evaluateExpression(header.value, context);
      }
    }

    // Map cookie to header (e.g., for Authorization)
    if (action.cookieToHeader) {
      const cookieValue = context.cookies[action.cookieToHeader.cookieName];
      if (cookieValue) {
        const prefix = action.cookieToHeader.prefix ?? "";
        headers[action.cookieToHeader.headerName] = prefix + cookieValue;
      }
    }

    // Build request body
    let body: string | undefined;
    if (action.body) {
      body = evaluateExpression(action.body, context);
    }

    // Make the request
    const response = await fetch(url, {
      method: action.method,
      headers,
      body,
      credentials: action.includeCredentials ? "include" : "omit",
    });

    // Parse response
    let data: unknown;
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    // Handle variable update if specified
    const variableUpdates: Record<string, unknown> = {};
    if (action.responseVariable) {
      variableUpdates[action.responseVariable] = data;
    }

    return {
      success: response.ok,
      data,
      error: response.ok ? undefined : `HTTP ${response.status}`,
      variableUpdates:
        Object.keys(variableUpdates).length > 0 ? variableUpdates : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

/**
 * Executes a SetVariable action
 */
const executeSetVariable = async (
  action: SetVariableAction,
  context: ActionContext
): Promise<ActionResult> => {
  const value = evaluateExpression(action.value, context);

  // Try to parse as JSON if possible
  let parsedValue: unknown = value;
  try {
    parsedValue = JSON.parse(value);
  } catch {
    // Keep as string if not valid JSON
  }

  return {
    success: true,
    variableUpdates: {
      [action.variableName]: parsedValue,
    },
  };
};

/**
 * Executes a server-side action
 *
 * @param action - The action to execute
 * @param context - The action context (cookies, variables, etc.)
 * @returns The result of the action execution
 */
export const executeAction = async (
  action: ServerAction,
  context: ActionContext
): Promise<ActionResult> => {
  switch (action.type) {
    case "setCookie":
      return executeSetCookie(action, context);
    case "deleteCookie":
      return executeDeleteCookie(action, context);
    case "redirect":
      return executeRedirect(action, context);
    case "callApi":
      return executeCallApi(action, context);
    case "setVariable":
      return executeSetVariable(action, context);
    default: {
      // TypeScript exhaustive check
      const exhaustiveCheck: never = action;
      return {
        success: false,
        error: `Unknown action type: ${(exhaustiveCheck as ServerAction).type}`,
      };
    }
  }
};

/**
 * Executes a chain of actions with onSuccess/onError handling
 *
 * @param actions - Map of all available actions
 * @param actionIds - IDs of actions to execute
 * @param context - Initial action context
 * @returns Combined result of all actions
 */
export const executeActionChain = async (
  actions: Map<string, ServerAction>,
  actionIds: string[],
  initialContext: ActionContext
): Promise<ActionResult> => {
  let context = { ...initialContext };
  const combinedResult: ActionResult = {
    success: true,
    setCookies: [],
    deleteCookies: [],
    variableUpdates: {},
  };

  for (const actionId of actionIds) {
    const action = actions.get(actionId);
    if (!action) {
      console.error(`Action not found: ${actionId}`);
      continue;
    }

    const result = await executeAction(action, context);

    // Merge results
    if (result.setCookies) {
      combinedResult.setCookies = [
        ...(combinedResult.setCookies ?? []),
        ...result.setCookies,
      ];
    }
    if (result.deleteCookies) {
      combinedResult.deleteCookies = [
        ...(combinedResult.deleteCookies ?? []),
        ...result.deleteCookies,
      ];
    }
    if (result.variableUpdates) {
      combinedResult.variableUpdates = {
        ...combinedResult.variableUpdates,
        ...result.variableUpdates,
      };
      // Update context for subsequent actions
      context = {
        ...context,
        variables: { ...context.variables, ...result.variableUpdates },
      };
    }
    if (result.data) {
      // Make response available to subsequent actions
      context = { ...context, response: result.data };
    }

    // Handle redirect (stops chain execution)
    if (result.redirect) {
      combinedResult.redirect = result.redirect;
      break;
    }

    // Handle conditional actions (execute based on conditions)
    // This is the key feature for branching based on response values
    if (action.conditionalActions?.length) {
      for (const conditionalAction of action.conditionalActions) {
        // Evaluate conditions with current context (including response from this action)
        if (evaluateConditions(conditionalAction, context)) {
          const conditionalResult = await executeActionChain(
            actions,
            [conditionalAction.actionId],
            context
          );

          // Merge conditional action results
          if (conditionalResult.setCookies) {
            combinedResult.setCookies = [
              ...(combinedResult.setCookies ?? []),
              ...conditionalResult.setCookies,
            ];
          }
          if (conditionalResult.variableUpdates) {
            combinedResult.variableUpdates = {
              ...combinedResult.variableUpdates,
              ...conditionalResult.variableUpdates,
            };
            context = {
              ...context,
              variables: {
                ...context.variables,
                ...conditionalResult.variableUpdates,
              },
            };
          }
          if (conditionalResult.redirect) {
            combinedResult.redirect = conditionalResult.redirect;
            break;
          }
        }
      }

      // If a redirect was triggered by conditional actions, stop here
      if (combinedResult.redirect) {
        break;
      }
    }

    // Handle action chain branching (onSuccess/onError)
    if (result.success && action.onSuccess?.length) {
      const successResult = await executeActionChain(
        actions,
        action.onSuccess,
        context
      );
      // Merge success chain results
      if (successResult.setCookies) {
        combinedResult.setCookies = [
          ...(combinedResult.setCookies ?? []),
          ...successResult.setCookies,
        ];
      }
      if (successResult.variableUpdates) {
        combinedResult.variableUpdates = {
          ...combinedResult.variableUpdates,
          ...successResult.variableUpdates,
        };
        context = {
          ...context,
          variables: { ...context.variables, ...successResult.variableUpdates },
        };
      }
      if (successResult.redirect) {
        combinedResult.redirect = successResult.redirect;
        break;
      }
    }

    if (!result.success && action.onError?.length) {
      const errorResult = await executeActionChain(
        actions,
        action.onError,
        context
      );
      combinedResult.success = false;
      combinedResult.error = result.error;
      // Merge error chain results
      if (errorResult.variableUpdates) {
        combinedResult.variableUpdates = {
          ...combinedResult.variableUpdates,
          ...errorResult.variableUpdates,
        };
      }
      if (errorResult.setCookies) {
        combinedResult.setCookies = [
          ...(combinedResult.setCookies ?? []),
          ...errorResult.setCookies,
        ];
      }
      if (errorResult.redirect) {
        combinedResult.redirect = errorResult.redirect;
        break;
      }
    }

    if (!result.success) {
      combinedResult.success = false;
      combinedResult.error = result.error;
    }
  }

  return combinedResult;
};
