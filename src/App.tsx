import { useEffect } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";
import { AppRoutes } from "./router";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import Navbar from "@/components/feature/Navbar";
import Footer from "@/components/feature/Footer";
import { captureRefFromUrl } from "@/lib/referral";

function AppLayout() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith("/admin");

  useEffect(() => {
    captureRefFromUrl();
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {!isAdmin && <Navbar />}
      <main className={`flex-1 ${isAdmin ? "" : ""}`}>
        <AppRoutes />
      </main>
      {!isAdmin && (
        <div className="hidden md:block">
          <Footer />
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <BrowserRouter basename={__BASE_PATH__}>
        <AppLayout />
      </BrowserRouter>
    </I18nextProvider>
  );
}

export default App;