import { useState } from "react";
import SignInPage from "./components/SignInPage";
import { logout, isLoggedIn } from "./auth/cognito";
import Sidebar from "./components/Sidebar";
import WebsiteIntelligencePage from "./components/WebsiteIntelligencePage";
import MarketIntelligencePage from "./components/MarketIntelligencePage";
import ContentGenerationPage from "./components/ContentGenerationPage";
import LinkedInDashboardPage from "./components/LinkedInDashboardPage";
import AnalyticsDashboard from "./components/AnalyticsDashboard";
import ReportGeneratorPanel from "./components/ReportGeneratorPanel";

const PlaceholderPage = ({ title }) => (
  <div className="flex-1 min-h-screen flex items-center justify-center" style={{ backgroundColor: "#E8F4F9" }}>
    <div className="text-center space-y-2">
      <p className="text-lg font-bold" style={{ color: "#1C2C3A" }}>{title}</p>
      <p className="text-sm" style={{ color: "#2E4057" }}>Coming soon</p>
    </div>
  </div>
);

function App() {
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

  const handleRedirectToCI = (url) => {
    setPrefillUrl(url);
    setActivePage("company-intelligence");
  };

  const handleNavigateToContentGeneration = () => {
    setActivePage("content-generation");
  };

  const handleSelectProspect = () => {
    setActivePage("content-generation");
  };

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "#E8F4F9" }}>
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
        {activePage === "report-generation" && (
          <div className="min-h-screen" style={{ backgroundColor: "#E8F4F9" }}>
            <div className="max-w-2xl mx-auto px-8 pt-10 pb-6">
              <div className="mb-6">
                <h1 className="text-xl font-bold tracking-tight" style={{ color: "#0B4F43" }}>Report Generation</h1>
                <p className="text-xs mt-1" style={{ color: "#2E4057" }}>
                  Generate a Company Analysis PDF from your Company Intelligence and Market Intelligence data.
                </p>
              </div>
              <ReportGeneratorPanel />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
