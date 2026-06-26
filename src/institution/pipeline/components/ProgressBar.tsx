interface ProgressBarProps {
  completed: number;
  total:     number;
}

export function ProgressBar({ completed, total }: ProgressBarProps) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="w-full h-1.5 bg-ink/[0.07] rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${pct}%`,
          background: pct === 100
            ? "#1D9E75"
            : "linear-gradient(90deg,#3536DC,#8231EC)",
        }}
      />
    </div>
  );
}
