"use client";

import { useEffect } from "react";

export default function AntiInspect() {
    useEffect(() => {
        // Disable right click
        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
        };

        // Disable keyboard shortcuts
        const handleKeyDown = (e: KeyboardEvent) => {
            // F12 key
            if (e.key === "F12") {
                e.preventDefault();
                return false;
            }

            // Ctrl+Shift+I (Inspect), Ctrl+Shift+J (Console), Ctrl+Shift+C (Inspect Element)
            if (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "J" || e.key === "C")) {
                e.preventDefault();
                return false;
            }

            // Ctrl+U (View Source)
            if (e.ctrlKey && e.key === "u") {
                e.preventDefault();
                return false;
            }

            // Ctrl+S (Save Page)
            if (e.ctrlKey && e.key === "s") {
                e.preventDefault();
                return false;
            }
        };

        document.addEventListener("contextmenu", handleContextMenu);
        document.addEventListener("keydown", handleKeyDown);

        // Optional: DevTools detection via debugger (use with caution as it can impact debugging)
        /*
        const detectDevTools = () => {
          const start = new Date().getTime();
          debugger;
          const end = new Date().getTime();
          if (end - start > 100) {
            // DevTools might be open
            console.clear();
          }
        };
        const interval = setInterval(detectDevTools, 1000);
        */

        return () => {
            document.removeEventListener("contextmenu", handleContextMenu);
            document.removeEventListener("keydown", handleKeyDown);
            // clearInterval(interval);
        };
    }, []);

    return null;
}
