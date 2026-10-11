/** Read-only progress indicator. Navigation remains owned by the setup wizard. */
export function SetupProgress({ steps, current, label }: {
  steps: string[]; current: number; label: string;
}) {
  return <ol className="setup-progress" aria-label={label}>
    {steps.map((title, index) => <li key={title}
      data-state={index < current ? 'complete' : index === current ? 'current' : 'pending'}
      aria-current={index === current ? 'step' : undefined}>
      <span className="setup-progress-indicator" aria-hidden="true">
        {index < current ? <svg viewBox="0 0 16 16" fill="none"><path d="m4 8 3 3 5-6"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> : index + 1}
      </span>
      <span>{title}</span>
    </li>)}
  </ol>;
}
