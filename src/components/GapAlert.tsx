export function GapAlert({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-3">
      <div className="text-[10px] uppercase tracking-[0.08em] text-white/40 font-medium mb-1.5">
        Suggestions
      </div>
      <ul className="space-y-1">
        {messages.map((m, i) => (
          <li
            key={i}
            className="text-[11.5px] text-white/55 leading-snug"
          >
            · {m}
          </li>
        ))}
      </ul>
    </div>
  );
}
