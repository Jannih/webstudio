import { WebhookFormIcon } from "@webstudio-is/icons/svg";
import type { WsComponentMeta } from "@webstudio-is/sdk";
import { form } from "@webstudio-is/sdk/normalize.css";
import { props } from "./__generated__/webhook-form.props";

export const meta: WsComponentMeta = {
  label: "Webhook Form",
  icon: WebhookFormIcon,
  presetStyle: {
    form,
  },
  states: [
    { selector: "[data-state=error]", label: "Error" },
    { selector: "[data-state=success]", label: "Success" },
    { selector: "[data-state=loading]", label: "Loading" },
  ],
  initialProps: ["id", "class", "state", "action", "onSubmitActions"],
  props: {
    ...props,
    action: {
      type: "resource",
      control: "resource",
      description:
        "The URI of a program that processes the information submitted via the form.",
      required: false,
    },
    onSubmitActions: {
      type: "json",
      control: "action",
      description:
        "Server-side actions to execute on form submit. Use for authentication flows with httpOnly cookies.",
      required: false,
    },
  },
};
