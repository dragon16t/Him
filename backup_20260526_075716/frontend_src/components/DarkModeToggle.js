import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Dark mode toggle — persists in localStorage. */
export default function DarkModeToggle({ className = "" }) {
  const [dark, setDark] = useState(() => localStorage.getItem("theme") === "dark");

  useEffect(() => {
    const root = document.documentElement;
    if (dark) { root.classList.add("dark"); localStorage.setItem("theme", "dark"); }
    else { root.classList.remove("dark"); localStorage.setItem("theme", "light"); }
  }, [dark]);

  return (
    <Button variant="outline" size="sm" onClick={() => setDark(d => !d)}
      className={`rounded-full h-9 w-9 p-0 border-[#E5E3DB] ${className}`}
      title={dark ? "Switch to light" : "Switch to dark"}
      data-testid="dark-mode-toggle">
      {dark ? <Sun className="w-4 h-4 text-[#D4A373]"/> : <Moon className="w-4 h-4 text-[#3B5249]"/>}
    </Button>
  );
}
