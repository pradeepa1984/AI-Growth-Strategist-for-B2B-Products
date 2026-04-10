import { useState } from "react";
import SignInPage from "./components/SignInPage";
import { logout, isLoggedIn } from "./auth/cognito";
import Sidebar from "./components/Sidebar";
import WebsiteIntelligencePage from "./components/WebsiteIntelligencePage";
import MarketIntelligencePage from "./components/MarketIntelligencePage";
import ContentGenerationPage from "./components/ContentGenerationPage";
import LinkedInDashboardPage from "./components/LinkedInDashboardPage";
import AnalyticsDashboard from "./components/AnalyticsDashboard";

const PlaceholderPage = ({ title }) => (
  <div className="flex-1 min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F6E5FF" }}>
    <div className="text-center space-y-2">
      <p className="text-lg font-bold text-gray-700">{title}</p>
      <p className="text-sm text-gray-500">Coming soon</p>
    </div>
  </div>
);

function App() {
  // Restore session from localStorage on page refresh
  const [user, setUser] = useState(() => {
    if (isLoggedIn()) {
      return localStorage.getItem("cognito_user_email") || "user";
    }
    return null;
  });
  const [activePage, setActivePage] = useState("company-intelligence");
  const [prefillUrl, setPrefillUrl] = useState("");

  const handleSignIn = (email) => {
    localStorage.setItem("cognito_user_email", email);
    setUser(email);
  };

  const handleSignOut = () => {
    logout();
    localStorage.removeItem("cognito_user_email");
    setUser(null);
  };

  if (!user) {
    return <SignInPage onSignIn={handleSignIn} />;
  }

  // Called by MarketIntelligencePage when CI is missing/unapproved.
  const handleRedirectToCI = (url) => {
    setPrefillUrl(url);
    setActivePage("company-intelligence");
  };

  // Called by MarketIntelligencePage "Create Content" button.
  const handleNavigateToContentGeneration = () => {
    setActivePage("content-generation");
  };

  const handleSelectProspect = () => {
    setActivePage("content-generation");
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar active={activePage} onSelect={setActivePage} />

      <div className="flex-1">
        {activePage === "company-intelligence" && (
          <WebsiteIntelligencePage
            user={user}
            onSignOut={handleSignOut}
            initialUrl={prefillUrl}
          />
        )}
        {activePage === "market-intelligence" && (
          <MarketIntelligencePage
            user={user}
            onSignOut={handleSignOut}
            onRedirectToCI={handleRedirectToCI}
            onNavigateToContentGeneration={handleNavigateToContentGeneration}
          />
        )}
        {activePage === "content-generation" && (
          <ContentGenerationPage
            user={user}
            onSignOut={handleSignOut}
          />
        )}
        {activePage === "linkedin-dashboard" && (
          <LinkedInDashboardPage
            user={user}
            onSignOut={handleSignOut}
            onSelectProspect={handleSelectProspect}
          />
        )}
        {activePage === "analytics-dashboard" && (
          <AnalyticsDashboard
            user={user}
            onSignOut={handleSignOut}
          />
        )}
      </div>
    </div>
  );
}

export default App;
