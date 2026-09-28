// Temporary screen placeholder until each screen is built from the design references.
export function Placeholder(props: { title: string; owner: string; task: string; description: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-3 p-8">
      <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        {props.owner} · {props.task}
      </p>
      <h1 className="text-4xl font-semibold">{props.title}</h1>
      <p className="text-lg text-muted-foreground">{props.description}</p>
    </main>
  );
}
