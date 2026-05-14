// All variants use the teal-mist / deep-teal palette; variant prop kept for API compatibility.
const TagList = ({ tags = [], variant = "neutral" }) => {
  if (!tags.length)
    return <p className="italic text-sm" style={{ color: "#2E4057" }}>No items found.</p>;

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag, i) => (
        <span
          key={i}
          className="px-2.5 py-1 text-xs font-medium"
          style={{
            backgroundColor: "#CCF2E8",
            color: "#0B4F43",
            borderRadius: "6px",
            fontWeight: 500,
          }}
        >
          {tag}
        </span>
      ))}
    </div>
  );
};

export default TagList;
