const SectionCard = ({ title, children }) => {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
        {title}
      </p>
      <hr className="border-gray-300 mb-2" />
      <div className="text-gray-700 text-sm leading-relaxed">{children}</div>
    </div>
  );
};

export default SectionCard;
