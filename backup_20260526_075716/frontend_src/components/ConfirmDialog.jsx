import { useState, useCallback, createContext, useContext } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

/**
 * Drop-in replacement for `window.confirm` / `window.prompt`.
 *
 * Usage:
 *   const confirm = useConfirm();
 *   const ok = await confirm({ title: "Delete this lead?", description: "...", danger: true });
 *   if (!ok) return;
 *
 *   const name = await confirm({ title: "Locality name", input: { placeholder: "e.g. Kakkanad" } });
 *   if (!name) return;
 *
 * Wrap the app once in <ConfirmProvider>.
 */

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);

  const open = useCallback((options) => {
    return new Promise((resolve) => {
      setState({
        ...options,
        inputValue: options.input?.defaultValue || "",
        resolve,
      });
    });
  }, []);

  const close = (value) => {
    state?.resolve?.(value);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={open}>
      {children}
      <Dialog open={!!state} onOpenChange={(o) => { if (!o) close(state?.input ? "" : false); }}>
        <DialogContent className="rounded-2xl max-w-md" data-testid="confirm-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading text-[#2C3531]">{state?.title || "Confirm"}</DialogTitle>
            {state?.description && <p className="text-xs text-[#59615D] pt-1">{state.description}</p>}
          </DialogHeader>
          {state?.input && (
            <div className="py-2">
              {state.input.label && <Label className="text-xs">{state.input.label}</Label>}
              <Input
                autoFocus
                type={state.input.type || "text"}
                placeholder={state.input.placeholder || ""}
                value={state.inputValue}
                onChange={(e) => setState((s) => ({ ...s, inputValue: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter" && state.inputValue.trim()) close(state.inputValue.trim()); }}
                className="rounded-xl mt-1"
                data-testid="confirm-dialog-input"
              />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => close(state?.input ? "" : false)} className="rounded-full" data-testid="confirm-dialog-cancel">
              {state?.cancelLabel || "Cancel"}
            </Button>
            <Button
              onClick={() => close(state?.input ? (state.inputValue.trim() || "") : true)}
              disabled={state?.input && !state?.inputValue?.trim()}
              className={`rounded-full text-white ${state?.danger ? "bg-red-600 hover:bg-red-700" : "bg-[#3B5249] hover:bg-[#2C3531]"}`}
              data-testid="confirm-dialog-ok"
            >
              {state?.okLabel || (state?.input ? "Save" : state?.danger ? "Delete" : "Confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    // Fallback to native if provider missing — safe default
    return async (opts) => {
      if (opts.input) return window.prompt(opts.title || "Enter value:", opts.input.defaultValue || "");
      return window.confirm(opts.title || "Confirm?");
    };
  }
  return ctx;
}
