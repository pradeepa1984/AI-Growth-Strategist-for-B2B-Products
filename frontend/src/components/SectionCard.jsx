const SectionCard = ({ title, children }) => {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: "#0B4F43" }}>
        {title}
      </p>
      <hr style={{ borderColor: "#D4EDE6", marginBottom: "8px" }} />
      <div className="text-sm leading-relaxed" style={{ color: "#1C2C3A" }}>{children}</div>
    </div>
  );
};

export default SectionCard;
