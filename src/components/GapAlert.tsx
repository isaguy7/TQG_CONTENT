export function GapAlert({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <div className="rounded-lg bg-warning/[0.05] border border-warning/40 p-4">
      <div className="text-[10px] uppercase tracking-[0.08em] text-warning font-medium mb-2">
        Gap alerts
      </div>
      <ul className="space-y-1.5">
        {messages.map((m, i) => (
          <li key={i} className="text-[12px] text-white/75 leading-snug">
            {m}
          </li>
        ))}
      </ul>
    </div>
  );
}
