const STEPS = [
  { id: "ci", label: "Company\nIntelligence" },
  { id: "mi", label: "Market\nIntelligence" },
  { id: "ld", label: "Lead\nDiscovery" },
  { id: "cg", label: "Content\nGeneration" },
];

const StepIcon = ({ status }) => {
  if (status === "done")
    return <span className="text-green-800 text-lg leading-none">✓</span>;
  if (status === "in_progress")
    return <span className="text-orange-500 text-base leading-none animate-pulse">⏳</span>;
  return <span className="text-black text-base leading-none">🔒</span>;
};

const ProgressTracker = ({ statuses }) => (
  <div className="flex items-start justify-center gap-0 py-1">
    {STEPS.map((step, idx) => (
      <div key={step.id} className="flex items-start">
        {/* Step: icon + label */}
        <div className="flex flex-col items-center gap-1 w-28">
          <StepIcon status={statuses[step.id]} />
          <span
            className={`text-[10px] text-center leading-tight whitespace-pre-line
              ${statuses[step.id] === "done"        ? "text-green-800 font-semibold"
              : statuses[step.id] === "in_progress" ? "text-orange-500 font-semibold"
              : "text-black"}`}
          >
            {step.label}
          </span>
        </div>

        {/* Connector line between steps */}
        {idx < STEPS.length - 1 && (
          <div className={`w-12 h-px mt-2.5 ${statuses[step.id] === "done" ? "bg-green-800" : "bg-black"}`} />
        )}
      </div>
    ))}
  </div>
);

export default ProgressTracker;
