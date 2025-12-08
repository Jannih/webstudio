import { nanoid } from "nanoid";
import { useState, type ReactNode } from "react";
import {
  Box,
  Button,
  Flex,
  FloatingPanel,
  Grid,
  IconButton,
  InputField,
  Label,
  Select,
  Separator,
  Switch,
  Text,
  TextArea,
  Tooltip,
  theme,
  ScrollArea,
  EnhancedTooltip,
} from "@webstudio-is/design-system";
import {
  PlusIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@webstudio-is/icons";
import type { ControlProps, PropValue } from "../../shared";
import { VerticalLayout } from "../../shared";
import { PropertyLabel, FieldLabel } from "../../property-label";

/**
 * Server-side action types that can be configured visually.
 * These mirror the schema in packages/sdk/src/schema/actions.ts
 */
type ActionType =
  | "setCookie"
  | "deleteCookie"
  | "redirect"
  | "callApi"
  | "setVariable";

type ComparisonOperator =
  | "equals"
  | "notEquals"
  | "contains"
  | "notContains"
  | "startsWith"
  | "endsWith"
  | "greaterThan"
  | "lessThan"
  | "greaterThanOrEquals"
  | "lessThanOrEquals"
  | "isEmpty"
  | "isNotEmpty"
  | "isTrue"
  | "isFalse"
  | "exists"
  | "notExists";

interface ActionCondition {
  leftOperand: string;
  operator: ComparisonOperator;
  rightOperand?: string;
}

interface ConditionalActionRef {
  actionId: string;
  conditions?: ActionCondition[];
}

interface ActionConfig {
  id: string;
  type: ActionType;
  // Common fields
  onSuccess?: string[];
  onError?: string[];
  // Conditional actions - NEW: branch based on response values
  conditionalActions?: ConditionalActionRef[];
  // SetCookie fields
  cookieName?: string;
  cookieValue?: string;
  expiresIn?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "strict" | "lax" | "none";
  path?: string;
  // Redirect fields
  redirectUrl?: string;
  redirectStatus?: number;
  // CallApi fields
  apiUrl?: string;
  apiMethod?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  apiHeaders?: Array<{ name: string; value: string }>;
  apiBody?: string;
  cookieToHeader?: {
    cookieName: string;
    headerName: string;
    prefix?: string;
  };
  responseVariable?: string;
  // SetVariable fields
  variableName?: string;
  variableValue?: string;
}

const actionTypeLabels: Record<ActionType, string> = {
  callApi: "Call API",
  setCookie: "Set Cookie",
  deleteCookie: "Delete Cookie",
  redirect: "Redirect",
  setVariable: "Set Variable",
};

/**
 * Expression syntax examples for documentation
 */
const expressionExamples = [
  {
    source: "formData",
    example: "{{formData.email}}",
    desc: "Form field values",
  },
  {
    source: "response",
    example: "{{response.token}}",
    desc: "API response data",
  },
  {
    source: "cookies",
    example: "{{cookies.access_token}}",
    desc: "Cookie values",
  },
  {
    source: "variables",
    example: "{{variables.user}}",
    desc: "Variable values",
  },
];

const actionTypeDescriptions: Record<ActionType, string> = {
  callApi: "Make a server-side API call with optional cookie forwarding",
  setCookie: "Set an httpOnly cookie for secure authentication",
  deleteCookie: "Delete a cookie by name",
  redirect: "Redirect to a URL after the action completes",
  setVariable: "Set a variable with a value from the response",
};

const operatorLabels: Record<ComparisonOperator, string> = {
  equals: "Equals",
  notEquals: "Not Equals",
  contains: "Contains",
  notContains: "Not Contains",
  startsWith: "Starts With",
  endsWith: "Ends With",
  greaterThan: "Greater Than",
  lessThan: "Less Than",
  greaterThanOrEquals: "≥",
  lessThanOrEquals: "≤",
  isEmpty: "Is Empty",
  isNotEmpty: "Is Not Empty",
  isTrue: "Is True",
  isFalse: "Is False",
  exists: "Exists",
  notExists: "Not Exists",
};

// Unary operators don't need a right operand
const unaryOperators: ComparisonOperator[] = [
  "isEmpty",
  "isNotEmpty",
  "isTrue",
  "isFalse",
  "exists",
  "notExists",
];

const defaultActionConfig = (type: ActionType): ActionConfig => ({
  id: nanoid(),
  type,
  ...(type === "setCookie" && {
    cookieName: "",
    cookieValue: "",
    expiresIn: 604800,
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
  }),
  ...(type === "deleteCookie" && {
    cookieName: "",
    path: "/",
  }),
  ...(type === "redirect" && {
    redirectUrl: "",
    redirectStatus: 302,
  }),
  ...(type === "callApi" && {
    apiUrl: "",
    apiMethod: "POST" as const,
    apiHeaders: [],
    apiBody: "",
  }),
  ...(type === "setVariable" && {
    variableName: "",
    variableValue: "",
  }),
});

/**
 * Field row component for consistent form field layout
 */
const FieldRow = ({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) => (
  <Grid gap="1">
    <FieldLabel description={description}>{label}</FieldLabel>
    {children}
  </Grid>
);

/**
 * Headers editor for API calls
 */
const HeadersEditor = ({
  headers,
  onChange,
}: {
  headers: Array<{ name: string; value: string }>;
  onChange: (headers: Array<{ name: string; value: string }>) => void;
}) => {
  const addHeader = () => {
    onChange([...headers, { name: "", value: "" }]);
  };

  const updateHeader = (
    index: number,
    field: "name" | "value",
    value: string
  ) => {
    const newHeaders = [...headers];
    newHeaders[index] = { ...newHeaders[index], [field]: value };
    onChange(newHeaders);
  };

  const removeHeader = (index: number) => {
    onChange(headers.filter((_, i) => i !== index));
  };

  return (
    <Grid gap="2">
      <Flex justify="between" align="center">
        <Label>Headers</Label>
        <EnhancedTooltip content="Add header">
          <IconButton onClick={addHeader}>
            <PlusIcon />
          </IconButton>
        </EnhancedTooltip>
      </Flex>
      {headers.map((header, index) => (
        <Grid
          key={index}
          gap="1"
          css={{ gridTemplateColumns: "1fr 1fr auto" }}
          align="center"
        >
          <InputField
            placeholder="Name"
            value={header.name}
            onChange={(e) => updateHeader(index, "name", e.target.value)}
          />
          <InputField
            placeholder="Value"
            value={header.value}
            onChange={(e) => updateHeader(index, "value", e.target.value)}
          />
          <IconButton onClick={() => removeHeader(index)}>
            <TrashIcon />
          </IconButton>
        </Grid>
      ))}
      {headers.length === 0 && (
        <Text color="moreSubtle">No headers configured</Text>
      )}
    </Grid>
  );
};

/**
 * Condition editor for a single condition
 */
const ConditionEditor = ({
  condition,
  onChange,
  onDelete,
}: {
  condition: ActionCondition;
  onChange: (condition: ActionCondition) => void;
  onDelete: () => void;
}) => {
  const isUnary = unaryOperators.includes(condition.operator);

  return (
    <Grid
      gap="2"
      css={{
        gridTemplateColumns: isUnary
          ? "minmax(120px, 1fr) minmax(100px, auto) auto"
          : "minmax(100px, 1fr) minmax(90px, auto) minmax(100px, 1fr) auto",
      }}
      align="center"
    >
      <InputField
        placeholder="{{response.status}}"
        value={condition.leftOperand}
        onChange={(e) =>
          onChange({ ...condition, leftOperand: e.target.value })
        }
      />
      <Select
        options={Object.keys(operatorLabels) as ComparisonOperator[]}
        getLabel={(op: ComparisonOperator) => operatorLabels[op]}
        value={condition.operator}
        onChange={(operator) =>
          onChange({
            ...condition,
            operator,
            // Clear right operand when switching to unary
            rightOperand: unaryOperators.includes(operator)
              ? undefined
              : condition.rightOperand,
          })
        }
      />
      {!isUnary && (
        <InputField
          placeholder='"value"'
          value={condition.rightOperand ?? ""}
          onChange={(e) =>
            onChange({ ...condition, rightOperand: e.target.value })
          }
        />
      )}
      <EnhancedTooltip content="Remove condition">
        <IconButton onClick={onDelete}>
          <TrashIcon />
        </IconButton>
      </EnhancedTooltip>
    </Grid>
  );
};

/**
 * Get a descriptive label for an action based on its type and configuration
 */
const getActionLabel = (action: ActionConfig, index: number): string => {
  const typeLabel = actionTypeLabels[action.type];
  switch (action.type) {
    case "redirect":
      return action.redirectUrl
        ? `${typeLabel} → ${action.redirectUrl}`
        : `${index + 1}. ${typeLabel}`;
    case "setCookie":
      return action.cookieName
        ? `${typeLabel}: ${action.cookieName}`
        : `${index + 1}. ${typeLabel}`;
    case "deleteCookie":
      return action.cookieName
        ? `${typeLabel}: ${action.cookieName}`
        : `${index + 1}. ${typeLabel}`;
    case "setVariable":
      return action.variableName
        ? `${typeLabel}: ${action.variableName}`
        : `${index + 1}. ${typeLabel}`;
    case "callApi":
      return action.apiUrl
        ? `${typeLabel}: ${new URL(action.apiUrl, "http://x").pathname}`
        : `${index + 1}. ${typeLabel}`;
    default:
      return `${index + 1}. ${typeLabel}`;
  }
};

/**
 * Conditional action editor - allows branching based on conditions
 */
const ConditionalActionsEditor = ({
  conditionalActions,
  availableActions,
  onChange,
}: {
  conditionalActions: ConditionalActionRef[];
  availableActions: ActionConfig[];
  onChange: (conditionalActions: ConditionalActionRef[]) => void;
}) => {
  const [isExpanded, setIsExpanded] = useState(conditionalActions.length > 0);

  const addConditionalAction = () => {
    onChange([
      ...conditionalActions,
      {
        actionId: "",
        conditions: [{ leftOperand: "", operator: "equals", rightOperand: "" }],
      },
    ]);
    setIsExpanded(true);
  };

  const updateConditionalAction = (
    index: number,
    updated: ConditionalActionRef
  ) => {
    const newActions = [...conditionalActions];
    newActions[index] = updated;
    onChange(newActions);
  };

  const removeConditionalAction = (index: number) => {
    onChange(conditionalActions.filter((_, i) => i !== index));
  };

  const addCondition = (actionIndex: number) => {
    const action = conditionalActions[actionIndex];
    updateConditionalAction(actionIndex, {
      ...action,
      conditions: [
        ...(action.conditions ?? []),
        { leftOperand: "", operator: "equals", rightOperand: "" },
      ],
    });
  };

  const updateCondition = (
    actionIndex: number,
    conditionIndex: number,
    condition: ActionCondition
  ) => {
    const action = conditionalActions[actionIndex];
    const newConditions = [...(action.conditions ?? [])];
    newConditions[conditionIndex] = condition;
    updateConditionalAction(actionIndex, {
      ...action,
      conditions: newConditions,
    });
  };

  const removeCondition = (actionIndex: number, conditionIndex: number) => {
    const action = conditionalActions[actionIndex];
    updateConditionalAction(actionIndex, {
      ...action,
      conditions: (action.conditions ?? []).filter(
        (_, i) => i !== conditionIndex
      ),
    });
  };

  return (
    <Grid gap="2">
      <Flex justify="between" align="center">
        <Flex
          align="center"
          gap="2"
          css={{ cursor: "pointer" }}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
          <Text variant="labelsSentenceCase">Conditional Branches</Text>
          {conditionalActions.length > 0 && (
            <Text color="moreSubtle">({conditionalActions.length})</Text>
          )}
        </Flex>
        <EnhancedTooltip content="Add conditional branch">
          <IconButton onClick={addConditionalAction}>
            <PlusIcon />
          </IconButton>
        </EnhancedTooltip>
      </Flex>

      {isExpanded && (
        <Box css={{ pl: theme.spacing[5] }}>
          {conditionalActions.length === 0 ? (
            <Box
              css={{
                p: theme.spacing[3],
                borderRadius: theme.borderRadius[4],
                backgroundColor: theme.colors.backgroundTopbar,
              }}
            >
              <Text color="moreSubtle" css={{ lineHeight: 1.5 }}>
                Execute different actions based on API response.
                <br />
                Example: If <code>{"{{response.verified}}"}</code> equals{" "}
                <code>"false"</code>, redirect to /verify.
              </Text>
            </Box>
          ) : (
            <Grid gap="3">
              {conditionalActions.map((conditionalAction, actionIndex) => (
                <Box
                  key={actionIndex}
                  css={{
                    p: theme.spacing[4],
                    border: `1px solid ${theme.colors.borderMain}`,
                    borderRadius: theme.borderRadius[4],
                    backgroundColor: theme.colors.backgroundControls,
                  }}
                >
                  <Grid gap="3">
                    <Flex justify="between" align="center">
                      <Text variant="labelsSentenceCase" color="main">
                        If conditions met → Execute:
                      </Text>
                      <EnhancedTooltip content="Remove branch">
                        <IconButton
                          onClick={() => removeConditionalAction(actionIndex)}
                        >
                          <TrashIcon />
                        </IconButton>
                      </EnhancedTooltip>
                    </Flex>

                    {availableActions.length > 0 ? (
                      <Select
                        placeholder="Select action..."
                        options={availableActions.map((a) => a.id)}
                        getLabel={(id: string) => {
                          const actionIdx = availableActions.findIndex(
                            (a) => a.id === id
                          );
                          const action = availableActions[actionIdx];
                          return action
                            ? getActionLabel(action, actionIdx)
                            : "Select action...";
                        }}
                        value={conditionalAction.actionId}
                        onChange={(actionId) =>
                          updateConditionalAction(actionIndex, {
                            ...conditionalAction,
                            actionId,
                          })
                        }
                      />
                    ) : (
                      <Text color="moreSubtle">
                        Add more actions above to select from here.
                      </Text>
                    )}

                    <Separator />

                    <Flex justify="between" align="center">
                      <Label>Conditions (AND)</Label>
                      <EnhancedTooltip content="Add condition">
                        <IconButton onClick={() => addCondition(actionIndex)}>
                          <PlusIcon />
                        </IconButton>
                      </EnhancedTooltip>
                    </Flex>

                    {(conditionalAction.conditions ?? []).map(
                      (condition, conditionIndex) => (
                        <ConditionEditor
                          key={conditionIndex}
                          condition={condition}
                          onChange={(updated) =>
                            updateCondition(
                              actionIndex,
                              conditionIndex,
                              updated
                            )
                          }
                          onDelete={() =>
                            removeCondition(actionIndex, conditionIndex)
                          }
                        />
                      )
                    )}

                    {(conditionalAction.conditions ?? []).length === 0 && (
                      <Text color="moreSubtle">
                        Add conditions to define when this action executes.
                      </Text>
                    )}
                  </Grid>
                </Box>
              ))}
            </Grid>
          )}
        </Box>
      )}
    </Grid>
  );
};

/**
 * Action chain editor for onSuccess/onError handlers
 */
const ActionChainEditor = ({
  label,
  description,
  chainIds,
  availableActions,
  onChange,
}: {
  label: string;
  description: string;
  chainIds: string[];
  availableActions: ActionConfig[];
  onChange: (chainIds: string[]) => void;
}) => {
  const addToChain = () => {
    onChange([...chainIds, ""]);
  };

  const updateChainItem = (index: number, actionId: string) => {
    const newChain = [...chainIds];
    newChain[index] = actionId;
    onChange(newChain);
  };

  const removeFromChain = (index: number) => {
    onChange(chainIds.filter((_, i) => i !== index));
  };

  return (
    <Grid gap="2">
      <Flex justify="between" align="center">
        <FieldLabel description={description}>{label}</FieldLabel>
        <EnhancedTooltip content={`Add action to ${label.toLowerCase()}`}>
          <IconButton
            onClick={addToChain}
            disabled={availableActions.length === 0}
          >
            <PlusIcon />
          </IconButton>
        </EnhancedTooltip>
      </Flex>
      {availableActions.length === 0 ? (
        <Text color="moreSubtle">Add more actions to chain them here.</Text>
      ) : chainIds.length === 0 ? (
        <Text color="moreSubtle">No actions configured</Text>
      ) : (
        <Grid gap="2">
          {chainIds.map((actionId, index) => (
            <Grid
              key={index}
              gap="2"
              css={{ gridTemplateColumns: "1fr auto" }}
              align="center"
            >
              <Select
                placeholder="Select action..."
                options={availableActions.map((a) => a.id)}
                getLabel={(id: string) => {
                  const actionIdx = availableActions.findIndex(
                    (a) => a.id === id
                  );
                  const action = availableActions[actionIdx];
                  return action
                    ? getActionLabel(action, actionIdx)
                    : "Select action...";
                }}
                value={actionId}
                onChange={(newId) => updateChainItem(index, newId)}
              />
              <EnhancedTooltip content="Remove from chain">
                <IconButton onClick={() => removeFromChain(index)}>
                  <TrashIcon />
                </IconButton>
              </EnhancedTooltip>
            </Grid>
          ))}
        </Grid>
      )}
    </Grid>
  );
};

/**
 * Configuration panel for Call API action
 */
const CallApiConfig = ({
  action,
  onChange,
}: {
  action: ActionConfig;
  onChange: (action: ActionConfig) => void;
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <Grid gap="3">
      <FieldRow
        label="URL"
        description="API endpoint URL. Use expressions like {{formData.email}}"
      >
        <InputField
          placeholder="https://api.example.com/auth/login"
          value={action.apiUrl ?? ""}
          onChange={(e) => onChange({ ...action, apiUrl: e.target.value })}
        />
      </FieldRow>

      <FieldRow label="Method">
        <Select
          options={["GET", "POST", "PUT", "PATCH", "DELETE"]}
          value={action.apiMethod ?? "POST"}
          onChange={(method) =>
            onChange({
              ...action,
              apiMethod: method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
            })
          }
        />
      </FieldRow>

      <FieldRow
        label="Request Body"
        description="JSON body with expression support"
      >
        <TextArea
          placeholder={
            '{\n  "email": "{{formData.email}}",\n  "password": "{{formData.password}}"\n}'
          }
          value={action.apiBody ?? ""}
          onChange={(value) => onChange({ ...action, apiBody: value })}
          rows={3}
          autoGrow
          maxRows={8}
        />
      </FieldRow>

      <FieldRow
        label="Response Variable"
        description="Store the API response in a variable for use in subsequent actions"
      >
        <InputField
          placeholder="response"
          value={action.responseVariable ?? ""}
          onChange={(e) =>
            onChange({ ...action, responseVariable: e.target.value })
          }
        />
      </FieldRow>

      <HeadersEditor
        headers={action.apiHeaders ?? []}
        onChange={(apiHeaders) => onChange({ ...action, apiHeaders })}
      />

      <Separator />

      <Flex
        align="center"
        gap="2"
        css={{ cursor: "pointer" }}
        onClick={() => setShowAdvanced(!showAdvanced)}
      >
        {showAdvanced ? <ChevronDownIcon /> : <ChevronRightIcon />}
        <Text variant="labelsSentenceCase">Cookie to Header Mapping</Text>
      </Flex>

      {showAdvanced && (
        <Box css={{ pl: theme.spacing[5] }}>
          <Grid gap="2">
            <Text color="moreSubtle">
              Forward a cookie value to an Authorization header
            </Text>
            <FieldRow label="Cookie Name">
              <InputField
                placeholder="access_token"
                value={action.cookieToHeader?.cookieName ?? ""}
                onChange={(e) =>
                  onChange({
                    ...action,
                    cookieToHeader: {
                      cookieName: e.target.value,
                      headerName: action.cookieToHeader?.headerName ?? "",
                      prefix: action.cookieToHeader?.prefix,
                    },
                  })
                }
              />
            </FieldRow>
            <FieldRow label="Header Name">
              <InputField
                placeholder="Authorization"
                value={action.cookieToHeader?.headerName ?? ""}
                onChange={(e) =>
                  onChange({
                    ...action,
                    cookieToHeader: {
                      cookieName: action.cookieToHeader?.cookieName ?? "",
                      headerName: e.target.value,
                      prefix: action.cookieToHeader?.prefix,
                    },
                  })
                }
              />
            </FieldRow>
            <FieldRow
              label="Prefix"
              description='e.g., "Bearer " for JWT tokens'
            >
              <InputField
                placeholder="Bearer "
                value={action.cookieToHeader?.prefix ?? ""}
                onChange={(e) =>
                  onChange({
                    ...action,
                    cookieToHeader: {
                      cookieName: action.cookieToHeader?.cookieName ?? "",
                      headerName: action.cookieToHeader?.headerName ?? "",
                      prefix: e.target.value,
                    },
                  })
                }
              />
            </FieldRow>
          </Grid>
        </Box>
      )}
    </Grid>
  );
};

/**
 * Configuration panel for Set Cookie action
 */
const SetCookieConfig = ({
  action,
  onChange,
}: {
  action: ActionConfig;
  onChange: (action: ActionConfig) => void;
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <Grid gap="3">
      <FieldRow label="Name" description="Cookie name (e.g., access_token)">
        <InputField
          placeholder="access_token"
          value={action.cookieName ?? ""}
          onChange={(e) => onChange({ ...action, cookieName: e.target.value })}
        />
      </FieldRow>

      <FieldRow
        label="Value"
        description="Cookie value. Use expressions like {{response.token}}"
      >
        <InputField
          placeholder="{{response.token}}"
          value={action.cookieValue ?? ""}
          onChange={(e) => onChange({ ...action, cookieValue: e.target.value })}
        />
      </FieldRow>

      <Separator />

      <Flex
        align="center"
        gap="2"
        css={{ cursor: "pointer" }}
        onClick={() => setShowAdvanced(!showAdvanced)}
      >
        {showAdvanced ? <ChevronDownIcon /> : <ChevronRightIcon />}
        <Text variant="labelsSentenceCase">Advanced Options</Text>
      </Flex>

      {showAdvanced && (
        <Box css={{ pl: theme.spacing[5] }}>
          <Grid gap="3">
            <FieldRow
              label="Expires In"
              description="Cookie lifetime in seconds (default: 7 days)"
            >
              <InputField
                type="number"
                placeholder="604800"
                value={action.expiresIn?.toString() ?? "604800"}
                onChange={(e) =>
                  onChange({
                    ...action,
                    expiresIn: parseInt(e.target.value, 10),
                  })
                }
              />
            </FieldRow>

            <Flex gap="4">
              <Flex gap="2" align="center">
                <Switch
                  checked={action.httpOnly ?? true}
                  onCheckedChange={(httpOnly) =>
                    onChange({ ...action, httpOnly })
                  }
                />
                <Label>HttpOnly</Label>
              </Flex>
              <Flex gap="2" align="center">
                <Switch
                  checked={action.secure ?? true}
                  onCheckedChange={(secure) => onChange({ ...action, secure })}
                />
                <Label>Secure</Label>
              </Flex>
            </Flex>

            <FieldRow label="SameSite" description="CSRF protection policy">
              <Select
                options={["strict", "lax", "none"]}
                value={action.sameSite ?? "lax"}
                onChange={(sameSite) =>
                  onChange({
                    ...action,
                    sameSite: sameSite as "strict" | "lax" | "none",
                  })
                }
              />
            </FieldRow>

            <FieldRow label="Path">
              <InputField
                placeholder="/"
                value={action.path ?? "/"}
                onChange={(e) => onChange({ ...action, path: e.target.value })}
              />
            </FieldRow>
          </Grid>
        </Box>
      )}
    </Grid>
  );
};

/**
 * Configuration panel for Delete Cookie action
 */
const DeleteCookieConfig = ({
  action,
  onChange,
}: {
  action: ActionConfig;
  onChange: (action: ActionConfig) => void;
}) => (
  <Grid gap="3">
    <FieldRow label="Name" description="Name of the cookie to delete">
      <InputField
        placeholder="access_token"
        value={action.cookieName ?? ""}
        onChange={(e) => onChange({ ...action, cookieName: e.target.value })}
      />
    </FieldRow>
  </Grid>
);

/**
 * Configuration panel for Redirect action
 */
const RedirectConfig = ({
  action,
  onChange,
}: {
  action: ActionConfig;
  onChange: (action: ActionConfig) => void;
}) => (
  <Grid gap="3">
    <FieldRow
      label="URL"
      description="Redirect URL. Use expressions like {{variables.redirectUrl}}"
    >
      <InputField
        placeholder="/dashboard"
        value={action.redirectUrl ?? ""}
        onChange={(e) => onChange({ ...action, redirectUrl: e.target.value })}
      />
    </FieldRow>

    <FieldRow label="Status" description="HTTP redirect status code">
      <Select
        options={["301", "302", "303", "307", "308"]}
        value={action.redirectStatus?.toString() ?? "302"}
        onChange={(status) =>
          onChange({ ...action, redirectStatus: parseInt(status, 10) })
        }
      />
    </FieldRow>
  </Grid>
);

/**
 * Configuration panel for Set Variable action
 */
const SetVariableConfig = ({
  action,
  onChange,
}: {
  action: ActionConfig;
  onChange: (action: ActionConfig) => void;
}) => (
  <Grid gap="3">
    <FieldRow label="Variable Name" description="Name of the variable to set">
      <InputField
        placeholder="user"
        value={action.variableName ?? ""}
        onChange={(e) => onChange({ ...action, variableName: e.target.value })}
      />
    </FieldRow>

    <FieldRow
      label="Value"
      description="Value to set. Use expressions like {{response.user}}"
    >
      <InputField
        placeholder="{{response.user}}"
        value={action.variableValue ?? ""}
        onChange={(e) => onChange({ ...action, variableValue: e.target.value })}
      />
    </FieldRow>
  </Grid>
);

/**
 * Single action item in the list
 */
const ActionItem = ({
  action,
  index,
  allActions,
  onChange,
  onDelete,
}: {
  action: ActionConfig;
  index: number;
  allActions: ActionConfig[];
  onChange: (action: ActionConfig) => void;
  onDelete: () => void;
}) => {
  const [isOpen, setIsOpen] = useState(true);

  const ConfigComponent = {
    callApi: CallApiConfig,
    setCookie: SetCookieConfig,
    deleteCookie: DeleteCookieConfig,
    redirect: RedirectConfig,
    setVariable: SetVariableConfig,
  }[action.type];

  // Get available actions for conditional branching (exclude self)
  const availableActionsForConditions = allActions.filter(
    (a) => a.id !== action.id
  );

  // Show conditional actions only for action types that can produce responses
  const showConditionalActions = action.type === "callApi";

  return (
    <Box
      css={{
        border: `1px solid ${theme.colors.borderMain}`,
        borderRadius: theme.borderRadius[4],
        overflow: "hidden",
      }}
    >
      <Flex
        justify="between"
        align="center"
        css={{
          px: theme.spacing[5],
          py: theme.spacing[3],
          backgroundColor: theme.colors.backgroundPanel,
          cursor: "pointer",
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Flex align="center" gap="2">
          {isOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
          <Text variant="labelsTitleCase">
            {index + 1}. {actionTypeLabels[action.type]}
          </Text>
        </Flex>
        <Tooltip content="Delete action">
          <IconButton
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <TrashIcon />
          </IconButton>
        </Tooltip>
      </Flex>

      {isOpen && (
        <Box css={{ p: theme.spacing[5] }}>
          <Text color="moreSubtle" css={{ mb: theme.spacing[4] }}>
            {actionTypeDescriptions[action.type]}
          </Text>
          <ConfigComponent action={action} onChange={onChange} />

          {/* Conditional Actions - branch based on response values */}
          {showConditionalActions &&
            availableActionsForConditions.length > 0 && (
              <>
                <Separator css={{ my: theme.spacing[4] }} />
                <ConditionalActionsEditor
                  conditionalActions={action.conditionalActions ?? []}
                  availableActions={availableActionsForConditions}
                  onChange={(conditionalActions) =>
                    onChange({ ...action, conditionalActions })
                  }
                />
              </>
            )}

          {/* Action Chains - onSuccess/onError */}
          {availableActionsForConditions.length > 0 && (
            <>
              <Separator css={{ my: theme.spacing[4] }} />
              <Grid gap="3">
                <ActionChainEditor
                  label="On Success"
                  description="Actions to execute after this action succeeds"
                  chainIds={action.onSuccess ?? []}
                  availableActions={availableActionsForConditions}
                  onChange={(onSuccess) => onChange({ ...action, onSuccess })}
                />
                <ActionChainEditor
                  label="On Error"
                  description="Actions to execute if this action fails"
                  chainIds={action.onError ?? []}
                  availableActions={availableActionsForConditions}
                  onChange={(onError) => onChange({ ...action, onError })}
                />
              </Grid>
            </>
          )}
        </Box>
      )}
    </Box>
  );
};

/**
 * Action type selector with icons
 */
const ActionTypeSelector = ({
  onSelect,
}: {
  onSelect: (type: ActionType) => void;
}) => {
  return (
    <Select
      placeholder="Add action..."
      options={Object.keys(actionTypeLabels) as ActionType[]}
      getLabel={(type: ActionType) => actionTypeLabels[type]}
      onChange={onSelect}
    />
  );
};

/**
 * Main actions panel content
 */
const ActionsPanel = ({
  actions,
  onChange,
}: {
  actions: ActionConfig[];
  onChange: (actions: ActionConfig[]) => void;
}) => {
  const handleAddAction = (type: ActionType) => {
    onChange([...actions, defaultActionConfig(type)]);
  };

  const handleUpdateAction = (index: number, action: ActionConfig) => {
    const newActions = [...actions];
    newActions[index] = action;
    onChange(newActions);
  };

  const handleDeleteAction = (index: number) => {
    onChange(actions.filter((_, i) => i !== index));
  };

  return (
    <Flex
      direction="column"
      css={{
        width: theme.spacing[35],
        maxHeight: "70vh",
        overflow: "hidden",
      }}
    >
      <Flex
        justify="between"
        align="center"
        css={{
          p: theme.spacing[5],
          borderBottom: `1px solid ${theme.colors.borderMain}`,
        }}
      >
        <Text variant="titles">Actions</Text>
        <ActionTypeSelector onSelect={handleAddAction} />
      </Flex>

      <ScrollArea css={{ flex: 1 }}>
        <Flex direction="column" gap="2" css={{ p: theme.spacing[5] }}>
          {actions.length === 0 ? (
            <Box
              css={{
                py: theme.spacing[9],
                textAlign: "center",
                border: `1px dashed ${theme.colors.borderMain}`,
                borderRadius: theme.borderRadius[4],
              }}
            >
              <Text color="moreSubtle">
                No actions configured.
                <br />
                Add an action to get started.
              </Text>
            </Box>
          ) : (
            actions.map((action, index) => (
              <ActionItem
                key={action.id}
                action={action}
                index={index}
                allActions={actions}
                onChange={(updated) => handleUpdateAction(index, updated)}
                onDelete={() => handleDeleteAction(index)}
              />
            ))
          )}
        </Flex>
      </ScrollArea>

      <Box
        css={{
          p: theme.spacing[5],
          borderTop: `1px solid ${theme.colors.borderMain}`,
        }}
      >
        <Grid gap="2">
          <Text variant="labelsSentenceCase">Available Expressions:</Text>
          <Grid gap="1">
            {expressionExamples.map((expr) => (
              <Flex key={expr.source} justify="between" align="center">
                <code style={{ fontSize: "11px" }}>{expr.example}</code>
                <Text color="moreSubtle" css={{ fontSize: "11px" }}>
                  {expr.desc}
                </Text>
              </Flex>
            ))}
          </Grid>
        </Grid>
      </Box>
    </Flex>
  );
};

/**
 * Convert ActionConfig[] to the prop value format for storage
 */
const actionConfigsToServerActions = (configs: ActionConfig[]) => {
  return configs.map((config) => {
    const base = {
      id: config.id,
      type: config.type,
      onSuccess: config.onSuccess,
      onError: config.onError,
      // Include conditional actions for branching
      conditionalActions: config.conditionalActions,
    };

    switch (config.type) {
      case "setCookie":
        return {
          ...base,
          name: config.cookieName ?? "",
          value: config.cookieValue ?? "",
          expiresIn: config.expiresIn ?? 604800,
          httpOnly: config.httpOnly ?? true,
          secure: config.secure ?? true,
          sameSite: config.sameSite ?? "lax",
          path: config.path ?? "/",
        };
      case "deleteCookie":
        return {
          ...base,
          name: config.cookieName ?? "",
          path: config.path ?? "/",
        };
      case "redirect":
        return {
          ...base,
          url: config.redirectUrl ?? "",
          status: config.redirectStatus ?? 302,
        };
      case "callApi":
        return {
          ...base,
          url: config.apiUrl ?? "",
          method: config.apiMethod ?? "POST",
          headers: config.apiHeaders ?? [],
          body: config.apiBody ?? "",
          cookieToHeader: config.cookieToHeader,
          responseVariable: config.responseVariable,
        };
      case "setVariable":
        return {
          ...base,
          variableName: config.variableName ?? "",
          value: config.variableValue ?? "",
        };
      default:
        return base;
    }
  });
};

/**
 * Convert stored server actions back to ActionConfig[]
 */
const serverActionsToActionConfigs = (
  serverActions: Array<Record<string, unknown>>
): ActionConfig[] => {
  return serverActions.map((action) => {
    const base: ActionConfig = {
      id: (action.id as string) ?? nanoid(),
      type: action.type as ActionType,
      onSuccess: action.onSuccess as string[] | undefined,
      onError: action.onError as string[] | undefined,
      conditionalActions: action.conditionalActions as
        | ConditionalActionRef[]
        | undefined,
    };

    switch (action.type) {
      case "setCookie":
        return {
          ...base,
          cookieName: action.name as string,
          cookieValue: action.value as string,
          expiresIn: action.expiresIn as number,
          httpOnly: action.httpOnly as boolean,
          secure: action.secure as boolean,
          sameSite: action.sameSite as "strict" | "lax" | "none",
          path: action.path as string,
        };
      case "deleteCookie":
        return {
          ...base,
          cookieName: action.name as string,
          path: action.path as string,
        };
      case "redirect":
        return {
          ...base,
          redirectUrl: action.url as string,
          redirectStatus: action.status as number,
        };
      case "callApi":
        return {
          ...base,
          apiUrl: action.url as string,
          apiMethod: action.method as
            | "GET"
            | "POST"
            | "PUT"
            | "PATCH"
            | "DELETE",
          apiHeaders: action.headers as Array<{ name: string; value: string }>,
          apiBody: action.body as string,
          cookieToHeader:
            action.cookieToHeader as ActionConfig["cookieToHeader"],
          responseVariable: action.responseVariable as string,
        };
      case "setVariable":
        return {
          ...base,
          variableName: action.variableName as string,
          variableValue: action.value as string,
        };
      default:
        return base;
    }
  });
};

/**
 * Convert ActionConfig[] to prop value format
 */
const actionsToPropValue = (actions: ActionConfig[]): PropValue => {
  const serverActions = actionConfigsToServerActions(actions);
  return {
    type: "json",
    value: serverActions,
  };
};

/**
 * Parse prop value back to ActionConfig[]
 */
const parseActionsFromProp = (
  prop: ControlProps<"action">["prop"]
): ActionConfig[] => {
  // Handle JSON type (new format)
  if (prop?.type === "json" && Array.isArray(prop.value)) {
    return serverActionsToActionConfigs(
      prop.value as Array<Record<string, unknown>>
    );
  }

  // Handle action type with code (legacy format)
  if (prop?.type === "action" && prop.value?.[0]?.code) {
    try {
      const code = prop.value[0].code;
      const match = code.match(/const actions = (\[[\s\S]*?\]);/);
      if (match) {
        const parsed = JSON.parse(match[1]);
        return serverActionsToActionConfigs(parsed);
      }
    } catch {
      // Ignore parse errors
    }
  }

  return [];
};

/**
 * Trigger button for the floating panel
 */
const ActionsTriggerButton = ({
  count,
  ...props
}: { count: number } & React.ComponentProps<typeof Button>) => (
  <Button
    {...props}
    color={count > 0 ? "positive" : "neutral"}
    css={{ width: "100%", justifyContent: "center" }}
  >
    {count > 0
      ? `${count} action${count > 1 ? "s" : ""} configured`
      : "Configure actions"}
  </Button>
);

/**
 * Main ActionControl component for the settings panel
 */
export const ActionControl = ({
  prop,
  propName,
  onChange,
}: Omit<ControlProps<"action">, "meta">) => {
  const actions = parseActionsFromProp(prop);

  const handleActionsChange = (newActions: ActionConfig[]) => {
    if (newActions.length === 0) {
      onChange({
        type: "action",
        value: [],
      });
    } else {
      onChange(actionsToPropValue(newActions));
    }
  };

  return (
    <VerticalLayout label={<PropertyLabel name={propName} />}>
      <FloatingPanel
        title="Configure Actions"
        content={
          <ActionsPanel actions={actions} onChange={handleActionsChange} />
        }
      >
        <ActionsTriggerButton count={actions.length} />
      </FloatingPanel>
    </VerticalLayout>
  );
};
