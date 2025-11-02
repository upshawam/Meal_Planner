// docs/app.js
// Selectable recipe cards + robust week.json loader that works on GitHub Pages and local servers.
//
// This version adds an extra fallback that constructs repo-aware absolute paths using the current
// location (window.location) so it will find week.json when the site is served at:
//   https://<user>.github.io/<repo>/
// or at a custom domain. It also logs helpful console errors for debugging.

async function fetchWithFallbacks(paths) {
  for (const p of paths) {
    try {
      const res = await fetch(p, { cache: "no-store" });
      if (res.ok) {
        console.info(`[data] Loaded week.json from: ${p}`);
        return res.json();
      } else {
        console.debug(`[data] Attempted ${p} => ${res.status}`);
      }
    } catch (err) {
      console.debug(`[data] Fetch error for ${p}:`, err);
    }
  }
  throw new Error("Failed to load week.json from all known locations");
}

(function logInfo(msg, ...args) { console.info(`[app] ${msg}`, ...args); })();

(async function init() {
  // Build candidate paths to week.json.
  // Order (attempts):
  // 1) ./week.json (same folder as index.html)
  // 2) script-relative (folder that contains app.js)/week.json
  // 3) site-root relative (/week.json)
  // 4) site-root under repo name (/REPO_NAME/week.json) -- important for GitHub Pages project sites
  // 5) /docs/week.json (if served differently)
  const candidatePaths = ["./week.json"];

  // Add script-relative path if possible
  try {
    const scriptEl = document.currentScript;
    if (scriptEl && scriptEl.src) {
      const scriptUrl = new URL(scriptEl.src, window.location.href);
      const scriptDir = scriptUrl.href.replace(/\/[^\/]*$/, "");
      candidatePaths.push(scriptDir + "/week.json");
    }
  } catch (e) {
    console.debug("[app] currentScript lookup failed", e);
  }

  // Add location-rooted paths
  try {
    const loc = window.location;
    // site root (e.g., https://user.github.io or https://example.com)
    const originRoot = `${loc.origin}`;
    candidatePaths.push(originRoot + "/week.json");
    // include pathname base (trim filename if present)
    const pathBase = loc.pathname.replace(/\/[^\/]*$/, "");
    if (pathBase && pathBase !== "/") {
      candidatePaths.push(originRoot + pathBase + "/week.json");
    }
    // If this is a GitHub project page like /<user>/<repo>/..., attempt that path explicitly
    // Extract first two path segments if present
    const parts = loc.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      // use first two segments as /user/repo
      const repoBase = `/${parts[0]}/${parts[1]}`;
      candidatePaths.push(originRoot + repoBase + "/week.json");
    }
  } catch (e) {
    console.debug("[app] location based path building failed", e);
  }

  // Common fallback
  candidatePaths.push("/docs/week.json");
  candidatePaths.push("/week.json");

  // Deduplicate while preserving order
  const seen = new Set();
  const deduped = candidatePaths.filter(p => {
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });

  logInfo("Attempting to load week.json from paths:", deduped);

  let data;
  try {
    data = await fetchWithFallbacks(deduped);
  } catch (err) {
    console.error("[app] Could not load week.json — menu will be empty.", err);
    const menuRoot = document.getElementById("menu");
    if (menuRoot) {
      menuRoot.innerHTML = `<div style="grid-column: 1 / -1; padding:16px; color:#b91c1c;">Error: could not load week.json. Open the browser console to see attempted paths.</div>`;
    }
    return;
  }

  const meals = data.meals || [];

  const menu = document.getElementById("menu");
  const nextBtn = document.getElementById("next");
  const resetBtn = document.getElementById("reset");
  const selectedDiv = document.getElementById("selected");
  const grocerySection = document.getElementById("grocery-section");
  const groceryList = document.getElementById("grocery");
  const downloadBtn = document.getElementById("download");

  const modal = document.getElementById("modal");
  const modalClose = document.getElementById("modal-close");
  const modalTitle = document.getElementById("modal-title");
  const modalSubtitle = document.getElementById("modal-subtitle");
  const modalDesc = document.getElementById("modal-desc");
  const modalIngredients = document.getElementById("modal-ingredients");
  const modalLink = document.getElementById("modal-link");

  let selectedIds = new Set();
  let locked = false; // becomes true after Next clicked

  function isPdf(url) {
    return typeof url === "string" && url.toLowerCase().endsWith(".pdf");
  }

  function escapeHtml(str) {
    if (typeof str !== "string") return "";
    return str.replace(/[&<>"']/g, (m) => {
      switch (m) {
        case "&": return "&amp;";
        case "<": return "&lt;";
        case ">": return "&gt;";
        case '"': return "&quot;";
        case "'": return "&#39;";
        default: return m;
      }
    });
  }

  function renderCard(meal, idx) {
    const card = document.createElement("div");
    card.className = "card";
    card.tabIndex = 0;
    card.dataset.idx = idx;

    // Ensure safe values for interpolation
    const imgSrc = meal.image ? escapeHtml(meal.image) : "";
    const title = meal.title ? escapeHtml(meal.title) : "";
    const subtitle = meal.subtitle ? escapeHtml(meal.subtitle) : "";

    card.innerHTML = `
      <div class="selector">Select</div>
      <img src="${imgSrc}" alt="${title}">
      <h4>${title}</h4>
      <p class="muted">${subtitle}</p>
      <label class="portion">Portions:
        <select data-portion="${idx}">
          ${Array.from({ length: 9 }, (_, i) => i + 2).map(n => `<option value="${n}">${n}</option>`).join("")}
        </select>
      </label>
    `;

    // click toggles selection (before Next), after Next clicking opens recipe (PDF if available)
    card.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (locked) {
        // final cooking view -> open pdf if available else open link
        const link = meal.pdf || meal.url;
        if (!link) { alert("No recipe link available."); return; }
        window.open(link, "_blank", "noopener");
        return;
      }
      toggleSelect(idx, card);
    });

    // double click / keyboard D or Space opens details modal
    card.addEventListener("dblclick", () => openDetails(meal));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        if (locked) {
          const link = meal.pdf || meal.url;
          if (link) window.open(link, "_blank", "noopener");
        } else toggleSelect(idx, card);
      } else if (e.key.toLowerCase() === "d" || e.key === " ") {
        e.preventDefault();
        openDetails(meal);
      }
    });

    return card;
  }

  function toggleSelect(idx, cardEl) {
    const id = `${idx}`;
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
      cardEl.classList.remove("selected");
      const pill = cardEl.querySelector(".selector");
      if (pill) pill.textContent = "Select";
    } else {
      selectedIds.add(id);
      cardEl.classList.add("selected");
      const pill = cardEl.querySelector(".selector");
      if (pill) pill.textContent = "Selected";
    }
    updateNext();
  }

  function updateNext() {
    nextBtn.disabled = selectedIds.size === 0;
  }

  function openDetails(meal) {
    modalTitle.textContent = meal.title || "Recipe";
    modalSubtitle.textContent = meal.subtitle || "";
    modalDesc.textContent = meal.description || "";
    if ((meal.ingredients || []).length) {
      modalIngredients.innerHTML = "<strong>Ingredients:</strong><br>" + (meal.ingredients.map(i => `${i.quantity_display || i.quantity || ""} ${i.unit || ""} ${i.ingredient}`).join("<br>"));
    } else modalIngredients.innerHTML = "";
    const link = meal.pdf || meal.url || "";
    modalLink.href = link || "#";
    modalLink.textContent = link ? (isPdf(link) ? "Open PDF" : "Open recipe page") : "No link";
    modal.classList.remove("hidden");
  }
  modalClose && modalClose.addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });

  // Build initial menu
  function renderMenu() {
    menu.innerHTML = "";
    if (!meals.length) {
      menu.innerHTML = `<div style="grid-column: 1 / -1; padding:16px; color:#374151;">No meals found in week.json</div>`;
      return;
    }
    meals.forEach((m, i) => {
      const c = renderCard(m, i);
      menu.appendChild(c);
    });
    updateNext();
  }

  // Next: keep only selected cards, build grocery list and enable cooking behavior
  nextBtn.addEventListener("click", () => {
    if (selectedIds.size === 0) return;
    locked = true;
    // filter meals to only selected
    const remaining = Array.from(selectedIds).map(id => meals[parseInt(id)]);
    // Render selected preview
    selectedDiv.innerHTML = "";
    remaining.forEach((m) => {
      const c = document.createElement("div");
      c.className = "card";
      c.innerHTML = `<img src="${escapeHtml(m.image || '')}" alt="${escapeHtml(m.title || '')}"><h4>${escapeHtml(m.title || '')}</h4>`;
      selectedDiv.appendChild(c);
    });
    // Remove unselected from menu view
    menu.innerHTML = "";
    remaining.forEach((m, i) => {
      const card = renderCard(m, i);
      // mark selected visually
      card.classList.add("selected");
      const pill = card.querySelector(".selector");
      if (pill) pill.textContent = "Selected";
      menu.appendChild(card);
    });

    // build grocery
    const groceryItems = [];
    remaining.forEach((m, i) => {
      const portionEl = document.querySelector(`select[data-portion="${i}"]`);
      const portion = portionEl ? parseInt(portionEl.value) : 2;
      (m.ingredients || []).forEach(ing => {
        const scaled = Object.assign({}, ing);
        if (scaled.quantity) {
          scaled.quantity = scaled.quantity * (portion / 2);
          scaled.quantity_display = scaled.quantity % 1 === 0 ? String(scaled.quantity) : scaled.quantity.toFixed(2);
        }
        groceryItems.push(scaled);
      });
    });

    const lines = aggregate(groceryItems);
    groceryList.innerHTML = "";
    lines.forEach(l => {
      const li = document.createElement("li");
      li.textContent = l;
      groceryList.appendChild(li);
    });
    grocerySection.classList.remove("hidden");
    nextBtn.disabled = true;
    resetBtn.classList.remove("hidden");
  });

  resetBtn.addEventListener("click", () => {
    // revert to initial menu
    selectedIds = new Set();
    locked = false;
    selectedDiv.innerHTML = "";
    groceryList.innerHTML = "";
    grocerySection.classList.add("hidden");
    resetBtn.classList.add("hidden");
    renderMenu();
  });

  downloadBtn && downloadBtn.addEventListener("click", () => {
    const text = Array.from(groceryList.querySelectorAll("li")).map(li => `• ${li.textContent}`).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "grocery-list.txt";
    a.click();
    URL.revokeObjectURL(url);
  });

  // Basic aggregation identical to your original aggregate() but simpler keying
  function aggregate(items) {
    const grouped = {};
    items.forEach(ing => {
      if (!ing || !ing.ingredient) return;
      const key = (ing.ingredient + "|" + (ing.unit || "")).toLowerCase();
      if (!grouped[key]) grouped[key] = { ...ing, quantity: 0 };
      if (ing.quantity) grouped[key].quantity += Number(ing.quantity);
      else if (!grouped[key].quantity && ing.quantity_display) grouped[key].quantity_display = ing.quantity_display;
    });
    return Object.values(grouped).map(ing => {
      const qty = ing.quantity ? (Number.isInteger(ing.quantity) ? ing.quantity : ing.quantity.toFixed(2)) : (ing.quantity_display || "");
      return `${qty} ${ing.unit || ""} ${ing.ingredient}`.trim();
    });
  }

  renderMenu();

