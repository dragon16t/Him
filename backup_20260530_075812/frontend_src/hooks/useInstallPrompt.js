/**
 * useInstallPrompt — captures beforeinstallprompt event so the app can show a
 * custom "Install Celesta Glow" button on supported browsers (Chrome / Edge).
 *
 *   const { canInstall, install } = useInstallPrompt();
 *   {canInstall && <Button onClick={install}>Install app</Button>}
 */
import { useEffect, useState } from "react";

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferred(e);
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    const onInstalled = () => { setCanInstall(false); setDeferred(null); };
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferred) return false;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    setCanInstall(false);
    return outcome === "accepted";
  };

  return { canInstall, install };
}
