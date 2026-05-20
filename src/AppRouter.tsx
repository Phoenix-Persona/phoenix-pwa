import { lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ScrollToTop } from "./components/ScrollToTop";
import { DeepLinkHandler } from "./components/DeepLinkHandler";

const Index = lazy(() => import("./pages/Index"));
const Onboard = lazy(() => import("./pages/Onboard"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const EditPersona = lazy(() => import("./pages/EditPersona"));
const MyPersonas = lazy(() => import("./pages/MyPersonas"));
const PersonaFeed = lazy(() => import("./pages/PersonaFeed"));
const Settings = lazy(() => import("./pages/Settings"));
const NIP19Page = lazy(() =>
  import("./pages/NIP19Page").then((module) => ({ default: module.NIP19Page })),
);
const NotFound = lazy(() => import("./pages/NotFound"));
const WalletHarness = lazy(() => import("./dev/WalletHarness"));
const InferencePayHarness = lazy(() => import("./dev/InferencePayHarness"));

export function AppRouter() {
  return (
    <BrowserRouter>
      {/* Capacitor: forwards OS appUrlOpen events into React Router so
          deep links (zuka://npub1…, https://zuka.live/<npub> opened by
          the OS once Universal Links are configured) navigate
          correctly inside the WebView. No-op on web. */}
      <DeepLinkHandler />
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/onboard" element={<Onboard />} />
        <Route path="/my-personas" element={<MyPersonas />} />
        <Route path="/dashboard/:npub" element={<Dashboard />} />
        <Route path="/dashboard/:npub/edit" element={<EditPersona />} />
        <Route path="/p/:npub" element={<PersonaFeed />} />
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
