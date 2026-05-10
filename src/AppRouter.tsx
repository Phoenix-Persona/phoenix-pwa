import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ScrollToTop } from "./components/ScrollToTop";

import Index from "./pages/Index";
import Onboard from "./pages/Onboard";
import Dashboard from "./pages/Dashboard";
import EditPersona from "./pages/EditPersona";
import MyPersonas from "./pages/MyPersonas";
import PersonaFeed from "./pages/PersonaFeed";
import Verify from "./pages/Verify";
import Settings from "./pages/Settings";
import { NIP19Page } from "./pages/NIP19Page";
import NotFound from "./pages/NotFound";
import WalletHarness from "./dev/WalletHarness";
import InferencePayHarness from "./dev/InferencePayHarness";

export function AppRouter() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/onboard" element={<Onboard />} />
        <Route path="/my-personas" element={<MyPersonas />} />
        <Route path="/dashboard/:npub" element={<Dashboard />} />
        <Route path="/dashboard/:npub/edit" element={<EditPersona />} />
        <Route path="/p/:npub" element={<PersonaFeed />} />
        <Route path="/verify/:npub" element={<Verify />} />
        <Route path="/settings" element={<Settings />} />
        {/* Developer harnesses. */}
        <Route path="/dev/wallet" element={<WalletHarness />} />
        <Route path="/dev/inference-pay" element={<InferencePayHarness />} />
        <Route path="/dev/ppq-pay" element={<InferencePayHarness />} />
        {/* NIP-19 catch-all stays at the root for raw npub/note/naddr URLs */}
        <Route path="/:nip19" element={<NIP19Page />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
export default AppRouter;
