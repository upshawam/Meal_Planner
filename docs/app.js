// Debug build of app.js — temporary. Adds logging to surface fetch/errors.
(function() {
  console.log("DEBUG: app.js loaded");

  window.addEventListener('error', (e) => {
    console.error("DEBUG window error:", e.error || e.message, e);
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error("DEBUG unhandledrejection:", e.reason);
  });

  // Preserve the original IIFE pattern but wrap the async initialization in a try so we see errors.
  (async function init() {
    let data;
    let allMeals = [];
    let weeksIndex = []; // entries from docs/weeks_index.json (latest-first)
    let currentIndex = 0; // index into weeksIndex (0 = latest)
    try {
      console.log("DEBUG: trying loadWeeksIndex()");
      // Try to load weeks index; if not present, fallback to week.json
      const hasIndex = await loadWeeksIndex();
      console.log("DEBUG: loadWeeksIndex returned:", hasIndex, "weeksIndex length:", (weeksIndex && weeksIndex.length) || 0);
      if (hasIndex) {
        currentIndex = 0;
        console.log("DEBUG: loading week from path:", weeksIndex[0].path);
        await loadWeekFromPath(weeksIndex[0].path);
      } else {
        // fallback to single week.json
        console.log('DEBUG: falling back to ./week.json');
        await loadWeekFromPath("./week.json");
      }
    } catch (err) {
      console.error("DEBUG Failed to load week data:", err);
      const menu = document.getElementById("menu");
      if (menu) menu.innerHTML = '<div style="grid-column:1/-1;color:#b91c1c;padding:12px">Error loading week data</div>';
      return;
    }

    // --- continue with the rest of the original app.js logic ---
    // (for brevity, re-import your original app.js code here unchanged after the debug block)
    window.DEBUG_app_initialized = true;
    // NOTE: keep your full app.js implementation below (createCard, renderMenu, etc.)
  })();

  // Minimal stubbed functions so the debug replacement does not crash before you paste the full file.
  async function loadWeeksIndex() {
    try {
      console.log("DEBUG loadWeeksIndex(): fetching ./weeks_index.json");
      const res = await fetch("./weeks_index.json", { cache: "no-store" });
      console.log("DEBUG weeks_index fetch status:", res.status);
      if (!res.ok) throw new Error("weeks_index.json not found");
      const json = await res.json();
      console.log("DEBUG weeks_index content (first 2 entries):", json && json.slice ? json.slice(0,2) : json);
      if (!Array.isArray(json) || json.length === 0) throw new Error("weeks_index.json invalid or empty");
      // Expect index sorted latest-first; if not, sort by year/week desc
      json.sort((a,b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.week - a.week;
      });
      // assign to outer scope variable by returning it (caller logs it)
      // Note: original code expects weeksIndex variable in outer scope; debug wrapper reassigns it.
      window.__DEBUG_weeksIndex = json;
      // also patch the outer variable if present
      try { weeksIndex = json; } catch (e) {}
      return true;
    } catch (e) {
      console.warn("DEBUG No weeks_index.json; falling back to week.json", e);
      try { weeksIndex = []; } catch (ee) {}
      return false;
    }
  }

  async function loadWeekFromPath(path) {
    try {
      console.log("DEBUG loadWeekFromPath fetch:", path);
      const res = await fetch(path, { cache: "no-store" });
      console.log("DEBUG week file fetch status:", res.status);
      if (!res.ok) throw new Error("week file not found: " + path);
      const data = await res.json();
      console.log("DEBUG loaded week data: week=", data.week, "year=", data.year, "meals=", (data.meals||[]).length);
      try { allMeals = data.meals || []; } catch (e) {}
      // update week indicator if present
      const weekIndicator = document.getElementById("week-indicator");
      if (weekIndicator) weekIndicator.textContent = `Week ${data.week} — ${data.year}`;
      // call original renderMenu if present
      try { renderMenu(); updateNavButtons(); } catch (e) { console.error("DEBUG renderMenu/updateNavButtons failed:", e); }
      return true;
    } catch (e) {
      console.error("DEBUG Failed to load week file:", e);
      const menu = document.getElementById("menu");
      if (menu) menu.innerHTML = '<div style="grid-column:1/-1;color:#b91c1c;padding:12px">Error loading week file</div>';
      const weekIndicator = document.getElementById("week-indicator");
      if (weekIndicator) weekIndicator.textContent = "Error loading week";
      return false;
    }
  }

})();
