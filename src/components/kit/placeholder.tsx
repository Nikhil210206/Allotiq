// Temporary screen placeholder until each screen is built — already in the house style.
// Pads itself when rendered bare (e.g. /login) and not when it sits inside the AppShell's <main>.
import { Eyebrow, Headline } from "./section";

export function Placeholder(props: { title: string; owner: string; task: string; description: string }) {
  return (
    <div className="mx-auto flex w-full max-w-[88rem] flex-1 flex-col justify-center gap-8 px-6 py-16 md:px-10 md:py-24 [main_&]:px-0">
      <Eyebrow index={props.task}>{props.owner} · being built</Eyebrow>
      <Headline as="h1" size="1" lead={`${props.title}.`} accent="Being built." />
      <p className="lede max-w-2xl">{props.description}</p>
    </div>
  );
}
