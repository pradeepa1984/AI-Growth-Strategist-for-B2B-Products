const TAG_STYLES = {
  warm:    "bg-[#c8b8a8] text-gray-800 border border-[#b8a898]",
  cool:    "bg-[#c4cfd8] text-gray-800 border border-[#aabbc8]",
  neutral: "bg-[#d8d4cc] text-gray-700 border border-[#c4beb4]",
  blue:    "bg-blue-50 text-blue-700 border border-blue-200",
  indigo:  "bg-indigo-50 text-indigo-700 border border-indigo-200",
  gray:    "bg-gray-100 text-gray-600 border border-gray-200",
};

const TagList = ({ tags = [], variant = "neutral" }) => {
  if (!tags.length)
    return <p className="text-gray-400 italic text-sm">No items found.</p>;

  const cls = TAG_STYLES[variant] ?? TAG_STYLES.neutral;

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag, i) => (
        <span
          key={i}
          className={`px-2.5 py-1 rounded-md text-xs font-medium ${cls}`}
        >
          {tag}
        </span>
      ))}
    </div>
  );
};

export default TagList;
