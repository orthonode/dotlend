"use client";

import { useEffect, useState } from "react";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("dotlend-cookies-accepted")) {
      setVisible(true);
    }
  }, []);

  function accept() {
    localStorage.setItem("dotlend-cookies-accepted", "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-xl mx-auto bg-[#111] border border-white/10 rounded-xl px-5 py-4 flex items-center justify-between gap-4 shadow-lg">
      <p className="text-xs text-gray-400">
        This site uses essential cookies and local storage to maintain wallet state and preferences.
      </p>
      <button
        onClick={accept}
        className="shrink-0 px-4 py-2 rounded-lg bg-[#E6007A] text-white text-xs font-bold hover:bg-[#c4006a] transition"
      >
        Accept
      </button>
    </div>
  );
}
