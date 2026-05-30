import { useState, useEffect } from "react";
import axios from "axios";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useWebSocketNotifications } from "@/hooks/useWebSocketNotifications";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";

const API = "/api";

export default function NotificationBell() {
  const [notes, setNotes] = useState([]);
  const [unread, setUnread] = useState(0);

  const fetchNotes = async () => {
    try {
      const { data } = await axios.get(`${API}/notifications`);
      setNotes(data.notifications || []);
      setUnread(data.unread || 0);
    } catch {}
  };

  useEffect(() => { fetchNotes(); }, []);
  // Tab-visibility-aware polling (replaces raw setInterval)
  useAutoRefresh(fetchNotes, { interval: 60000 });
  // Real-time push (server only delivers when WS endpoint is live + token is valid)
  useWebSocketNotifications((payload) => {
    if (payload && payload.type === "notification") fetchNotes();
  });

  const readAll = async () => {
    try {
      await axios.post(`${API}/notifications/read-all`);
      fetchNotes();
    } catch {}
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-full"
          data-testid="notif-bell"
          aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
        >
          <Bell className="w-4 h-4" aria-hidden="true" />
          {unread > 0 && (
            <span data-testid="notif-unread-count" className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold" aria-hidden="true">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 dark:bg-[#1e2825]" align="end" data-testid="notif-popover">
        <div className="p-3 border-b border-[#E5E3DB] dark:border-[#2d3530] flex justify-between items-center">
          <h4 className="font-heading font-medium text-sm dark:text-[#e8e6df]">Notifications {unread > 0 && `(${unread})`}</h4>
          {unread > 0 && (
            <button onClick={readAll} className="text-[10px] text-[#3B5249] dark:text-[#A8C7B6] underline" data-testid="notif-read-all">
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto" role="list" aria-live="polite">
          {notes.length === 0 ? (
            <p className="text-center text-xs text-[#59615D] dark:text-[#a6a89f] py-6">No notifications</p>
          ) : (
            notes.slice(0, 20).map((n) => (
              <div
                key={n.id}
                role="listitem"
                data-testid={`notif-${n.id}`}
                className={`p-3 border-b border-[#E5E3DB] dark:border-[#2d3530] text-xs ${!n.read ? "bg-[#F9F8F6] dark:bg-[#262f2c]" : ""}`}
              >
                <p className="font-medium text-[#2C3531] dark:text-[#e8e6df]">{n.title}</p>
                <p className="text-[#59615D] dark:text-[#a6a89f] mt-0.5">{n.message}</p>
                <p className="text-[9px] text-[#A66E4E] mt-1">{n.created_at?.slice(0, 16).replace("T", " ")}</p>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
