import { useStore } from "@nanostores/react";
import {
  $blockChildOutline,
  $instances,
  $isContentMode,
  $registeredComponentMetas,
  type BlockChildOutline,
} from "~/shared/nano-states";
import {
  Box,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Flex,
  theme,
  IconButton,
  Tooltip,
  toast,
  Kbd,
  Text,
  iconButtonSize,
} from "@webstudio-is/design-system";
import { BlockChildAddButtonOutline } from "./outline";
import { applyScale } from "./apply-scale";
import { $scale } from "~/builder/shared/nano-states";
import { PlusIcon } from "@webstudio-is/icons";
import { BoxIcon } from "@webstudio-is/icons/svg";
import { useRef, useState } from "react";
import { isFeatureEnabled } from "@webstudio-is/feature-flags";
import type { DroppableTarget, InstanceSelector } from "~/shared/tree-utils";
import type { Instance, Instances } from "@webstudio-is/sdk";
import {
  blockComponent,
  blockTemplateComponent,
} from "@webstudio-is/react-sdk";
import {
  extractWebstudioFragment,
  findAvailableDataSources,
  getWebstudioData,
  insertInstanceChildrenMutable,
  insertWebstudioFragmentCopy,
  updateWebstudioData,
} from "~/shared/instance-utils";
import { shallowEqual } from "shallow-equal";
import { MetaIcon } from "~/builder/shared/meta-icon";

export const findBlockSelector = (
  anchor: InstanceSelector,
  instances: Instances
) => {
  if (anchor === undefined) {
    return;
  }

  if (anchor.length === 0) {
    return;
  }

  let blockInstanceSelector: InstanceSelector | undefined = undefined;

  for (let i = 0; i < anchor.length; ++i) {
    const instanceId = anchor[i];

    const instance = instances.get(instanceId);
    if (instance === undefined) {
      return;
    }

    if (instance.component === blockComponent) {
      blockInstanceSelector = anchor.slice(i);
      break;
    }
  }

  if (blockInstanceSelector === undefined) {
    return;
  }

  return blockInstanceSelector;
};

const findTemplates = (anchor: InstanceSelector, instances: Instances) => {
  const blockInstanceSelector = findBlockSelector(anchor, instances);
  if (blockInstanceSelector === undefined) {
    toast.error("Editable block not found");
    return;
  }

  const blockInstance = instances.get(blockInstanceSelector[0]);

  if (blockInstance === undefined) {
    toast.error("Editable block instance not found");
    return;
  }

  const templateInstanceId = blockInstance.children.find(
    (child) =>
      child.type === "id" &&
      instances.get(child.value)?.component === blockTemplateComponent
  )?.value;

  if (templateInstanceId === undefined) {
    toast.error("Templates instance id not found");
    return;
  }

  const templateInstance = instances.get(templateInstanceId);

  if (templateInstance === undefined) {
    toast.error("Templates instance not found");
    return;
  }

  const result: [instance: Instance, instanceSelector: InstanceSelector][] =
    templateInstance.children
      .filter((child) => child.type === "id")
      .map((child) => child.value)
      .map((childId) => instances.get(childId))
      .filter((child) => child !== undefined)
      .map((child) => [
        child,
        [child.id, templateInstanceId, ...blockInstanceSelector],
      ]);

  return result;
};

const getInsertionIndex = (
  anchor: InstanceSelector,
  instances: Instances,
  insertBefore: boolean = false
) => {
  const blockSelector = findBlockSelector(anchor, instances);
  if (blockSelector === undefined) {
    return;
  }

  const insertAtInitialPosition = shallowEqual(blockSelector, anchor);

  const blockInstance = instances.get(blockSelector[0]);

  if (blockInstance === undefined) {
    toast.error("Editable block instance not found");
    return;
  }

  const index = blockInstance.children.findIndex((child) => {
    if (child.type !== "id") {
      return false;
    }

    if (insertAtInitialPosition) {
      return instances.get(child.value)?.component === blockTemplateComponent;
    }

    return child.value === anchor[0];
  });

  if (index === -1) {
    return;
  }

  // Independent of insertBefore, we always insert after the Templates instance
  if (insertAtInitialPosition) {
    return index + 1;
  }

  return insertBefore ? index : index + 1;
};

const TemplatesMenu = ({
  onOpenChange,
  children,
  anchor,
}: {
  children: React.ReactNode;
  onOpenChange: (open: boolean) => void;
  anchor: InstanceSelector;
}) => {
  const instances = useStore($instances);
  const metas = useStore($registeredComponentMetas);

  const optionPointerDownTime = useRef(0);
  const isMenuOpenedWithOption = useRef(false);

  const handleOpen = (open: boolean) => {
    onOpenChange(open);

    isMenuOpenedWithOption.current =
      Date.now() - optionPointerDownTime.current < 100;
  };

  const templates = findTemplates(anchor, instances);

  const menuItems = templates?.map(([template, templateSelector]) => ({
    id: template.id,
    icon: <MetaIcon icon={metas.get(template.component)?.icon ?? BoxIcon} />,
    title: template.label ?? template.component,
    value: templateSelector,
  }));

  const tooltipContent = (
    <>
      <Flex gap={1}>
        <Kbd value={["click"]} color="contrast" />
        <Text color="subtle">to add after</Text>
      </Flex>
      <Flex gap={1}>
        <Kbd value={["option", "click"]} color="contrast" />{" "}
        <Text color="subtle">to add before</Text>
      </Flex>
    </>
  );

  return (
    <div
      style={{ display: "contents" }}
      onPointerDown={(event) => {
        if (event.altKey) {
          optionPointerDownTime.current = Date.now();
        }
      }}
    >
      <DropdownMenu onOpenChange={handleOpen} modal>
        <Tooltip content={tooltipContent} side="top" disableHoverableContent>
          <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        </Tooltip>

        <DropdownMenuPortal>
          <DropdownMenuContent
            align="start"
            sideOffset={4}
            collisionPadding={16}
            side="bottom"
            loop
          >
            <DropdownMenuRadioGroup
              onValueChange={(value) => {
                const isOptionDownOnMenuItemClick =
                  Date.now() - optionPointerDownTime.current < 100;

                const insertBefore =
                  isMenuOpenedWithOption.current || isOptionDownOnMenuItemClick;

                const templateSelector = JSON.parse(value) as InstanceSelector;
                const fragment = extractWebstudioFragment(
                  getWebstudioData(),
                  templateSelector[0]
                );

                const parentSelector = findBlockSelector(anchor, instances);

                if (parentSelector === undefined) {
                  return;
                }

                const position = getInsertionIndex(
                  anchor,
                  instances,
                  insertBefore
                );

                if (position === undefined) {
                  return;
                }

                const target: DroppableTarget = {
                  parentSelector,
                  position,
                };

                updateWebstudioData((data) => {
                  const { newInstanceIds } = insertWebstudioFragmentCopy({
                    data,
                    fragment,
                    availableDataSources: findAvailableDataSources(
                      data.dataSources,
                      data.instances,
                      target.parentSelector
                    ),
                  });
                  const newRootInstanceId = newInstanceIds.get(
                    fragment.instances[0].id
                  );
                  if (newRootInstanceId === undefined) {
                    return;
                  }
                  const children: Instance["children"] = [
                    { type: "id", value: newRootInstanceId },
                  ];
                  insertInstanceChildrenMutable(data, children, target);
                });
              }}
            >
              {menuItems?.map(({ icon, title, id, value }) => (
                <DropdownMenuRadioItem key={id} value={JSON.stringify(value)}>
                  <Flex
                    css={{ py: theme.spacing[4], px: theme.spacing[5] }}
                    gap={2}
                  >
                    {icon}
                    <Box>{title}</Box>
                  </Flex>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenu>
    </div>
  );
};

export const BlockChildHoveredInstanceOutline = () => {
  const blockChildOutline = useStore($blockChildOutline);
  const scale = useStore($scale);
  const isContentMode = useStore($isContentMode);

  const timeoutRef = useRef<undefined | ReturnType<typeof setTimeout>>(
    undefined
  );
  const [buttonOutline, setButtonOutline] = useState<
    undefined | BlockChildOutline
  >(undefined);

  const outline = blockChildOutline ?? buttonOutline;

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  if (isFeatureEnabled("contentEditableMode") === false) {
    return;
  }

  if (!isContentMode) {
    return;
  }

  if (outline === undefined) {
    return;
  }

  const rect = applyScale(outline.rect, scale);

  return (
    <BlockChildAddButtonOutline rect={rect}>
      <Flex
        css={{
          width: "min-content",
          pointerEvents: isMenuOpen ? "none" : "all",
          clipPath: `polygon(0% 0%, 100% 0%, 100% 100%, 0% ${iconButtonSize})`,
        }}
        onMouseEnter={() => {
          clearTimeout(timeoutRef.current);

          setButtonOutline(outline);
        }}
        onMouseLeave={() => {
          if (isMenuOpen) {
            return;
          }

          clearTimeout(timeoutRef.current);

          timeoutRef.current = setTimeout(() => {
            setButtonOutline(undefined);
          }, 100);
        }}
      >
        <TemplatesMenu
          onOpenChange={(open) => {
            setIsMenuOpen(open);

            if (!open) {
              setButtonOutline(undefined);
            }
          }}
          anchor={outline.selector}
        >
          <IconButton
            variant={"local"}
            css={{
              mr: theme.spacing[4],
              borderStyle: "solid",
              borderColor: `oklch(from ${theme.colors.backgroundPrimary} l c h / 0.7)`,
            }}
          >
            <PlusIcon />
          </IconButton>
        </TemplatesMenu>
      </Flex>
    </BlockChildAddButtonOutline>
  );
};
