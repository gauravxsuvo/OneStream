export function ParticipantList({ names }: { names: string[] }) {
  return (
    <div className="card p-4">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
        Watching now ({names.length})
      </h3>
      <ul className="flex flex-wrap gap-1.5">
        {names.map((name, i) => (
          <li
            key={`${name}-${i}`}
            className="rounded-full bg-surface-hover px-2.5 py-1 text-xs text-foreground"
          >
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}
