// Friendly nothing-here card (echo's "Nothing yet." card).
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Panel } from "./panel";
import { Eyebrow } from "./section";

export function EmptyState(props: {
  eyebrow?: string;
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Panel tone="white" className={cn("flex flex-col items-start gap-4 p-8 md:p-10", props.className)}>
      {props.icon && (
        <span className="grid size-11 place-items-center rounded-full bg-fg/[0.07] text-fg [&_svg]:size-5">{props.icon}</span>
      )}
      {props.eyebrow && <Eyebrow>{props.eyebrow}</Eyebrow>}
      <h3 className="display-4 text-fg">{props.title}</h3>
      {props.body && <p className="max-w-md text-[15px] leading-relaxed text-fg-2">{props.body}</p>}
      {props.action && <div className="mt-2">{props.action}</div>}
    </Panel>
  );
}
