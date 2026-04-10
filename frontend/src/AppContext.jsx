import { createContext, useContext, useState } from "react";

/**
 * AppContext — global state shared across all pages.
 *
 * Data survives navigation (components unmount/remount but context persists).
 *
 * Stores:
 *   ciData      — full Company Intelligence result object
 *   ciUrl       — the URL that was analysed
 *   ciSubmitted — whether CI analysis has been run at least once
 *   miData      — full Market Intelligence result object
 *   cgItems     — array of generated content items (saved content)
 */
const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
  const [ciData,           setCiData]           = useState(null);
  const [ciUrl,            setCiUrl]            = useState("");
  const [ciSubmitted,      setCiSubmitted]      = useState(false);
  const [miData,           setMiData]           = useState(null);
  const [cgItems,          setCgItems]          = useState([]);
  const [selectedProspect, setSelectedProspect] = useState(null);  // prospect chosen in LD
  const [csvLeads,         setCsvLeads]         = useState(null);  // null = not loaded yet

  const addCgItem = (item) =>
    setCgItems((prev) => [item, ...prev]);

  return (
    <AppContext.Provider value={{
      ciData,           setCiData,
      ciUrl,            setCiUrl,
      ciSubmitted,      setCiSubmitted,
      miData,           setMiData,
      cgItems,          setCgItems, addCgItem,
      selectedProspect, setSelectedProspect,
      csvLeads,         setCsvLeads,
    }}>
      {children}
    </AppContext.Provider>
  );
};

/** Call this hook inside any component to read/write global state. */
export const useAppContext = () => useContext(AppContext);
