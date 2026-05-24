import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Dark mode toggle button. Saves preference to localStorage and toggles `dark` class on <html>.
 * Tailwind needs `darkMode: 'class'` (already set in tailwind.config.js).
 */
export default function DarkModeToggle({ compact = false }) {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("theme") === "dark"; } catch { return false; }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (dark) { root.classList.add("dark"); try { localStorage.setItem("theme", "dark"); } catch {} }
    else { root.classList.remove("dark"); try { localStorage.setItem("theme", "light"); } catch {} }
  }, [dark]);

  return (
    <Button
      variant="ghost"
      size={compact ? "icon" : "sm"}
      onClick={() => setDark(d => !d)}
      className={`rounded-full ${compact ? "h-8 w-8" : ""}`}
      data-testid="dark-mode-toggle"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  );
}
