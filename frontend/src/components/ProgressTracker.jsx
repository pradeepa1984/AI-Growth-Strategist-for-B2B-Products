const STEPS = [
  { id: "ci", label: "Company\nIntelligence" },
  { id: "mi", label: "Market\nIntelligence" },
  { id: "ld", label: "Lead\nDiscovery" },
  { id: "cg", label: "Content\nGeneration" },
];

const StepIcon = ({ status }) => {
  if (status === "done")
    return <span className="text-lg leading-none" style={{ color: "#1A9E7A" }}>✓</span>;
  if (status === "in_progress")
    return <span className="text-base leading-none animate-pulse" style={{ color: "#0B4F43" }}>⏳</span>;
  return <span className="text-base leading-none" style={{ color: "#D4EDE6" }}>🔒</span>;
};

const ProgressTracker = ({ statuses }) => (
  <div className="flex items-start justify-center gap-0 py-1">
    {STEPS.map((step, idx) => (
      <div key={step.id} className="flex items-start">
        <div className="flex flex-col items-center gap-1 w-28">
          <StepIcon status={statuses[step.id]} />
          <span
            className="text-[10px] text-center leading-tight whitespace-pre-line"
            style={{
              color:
                statuses[step.id] === "done"        ? "#1A9E7A" :
                statuses[step.id] === "in_progress" ? "#0B4F43" :
                "#2E4057",
              fontWeight: statuses[step.id] === "done" || statuses[step.id] === "in_progress" ? "600" : "400",
            }}
          >
            {step.label}
          </span>
        </div>

        {idx < STEPS.length - 1 && (
          <div
            className="w-12 h-px mt-2.5"
            style={{ backgroundColor: statuses[step.id] === "done" ? "#5DD4B0" : "#D4EDE6" }}
          />
        )}
      </div>
    ))}
  </div>
);

export default ProgressTracker;
