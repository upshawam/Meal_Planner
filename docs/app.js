// docs/app.js — updated to prefer inline viewing for local PDFs under ./pdfs/ or /docs/pdfs/
// - treats local pdfs as embeddable and shows them inline in modal iframe
// - keeps external pdf fallback (open in new tab / download)
// - expects week JSON to contain recipe.pdf set to a local path like "./pdfs/<file>.pdf"
(async function() {
  // Simple loader: ./week.json (same folder as index.html)
  let data;
  try {
    const res = await fetch("./week.json", { cache: "no-store" });
    if (!res.ok) throw new Error("week.json not found");
    data = await res.json();
  } catch (err) {
    console.error("Failed to load ./week.json:", err);
    const menu = document.getElementById("menu");
    if (menu) menu.innerHTML = '<div style="grid-column:1/-1;color:#b91c1c;padding:12px">Error loading week.json</div>';
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

  // Modal elements (may not exist — check)
  const modal = document.getElementById("modal");
  const modalClose = document.getElementById("modal-close");
  const modalTitle = document.getElementById("modal-title");
  const modalSubtitle = document.getElementById("modal-subtitle");
  const modalDesc = document.getElementById("modal-desc");
  const modalIngredients = document.getElementById("modal-ingredients");
  const modalLink = document.getElementById("modal-link");
  const modalViewPdfBtn = document.getElementById("modal-view-pdf");
  const modalDownloadLink = document.getElementById("modal-download");
  const modalPdfViewer = document.getElementById("modal-pdf-viewer");
  const modalPdfIframe = document.getElementById("modal-pdf-iframe");
  const modalPdfMessage = document.getElementById("modal-pdf-message");

  // Defensive helpers
  function safeText(el, text) { if (el) el.textContent = text || ""; }
  function safeHtml(el, html) { if (el) el.innerHTML = html || ""; }
  function safeShowModal() { if (modal) modal.classList.remove("hidden"); }
  function safeHideModal() { if (modal) modal.classList.add("hidden"); }

  safeHideModal();

  // Stable id helper (prefer URL or fallback index)
  function mealIdFor(meal, idx) {
    return (meal && meal.url) ? meal.url : String(idx);
  }

  let selected = new Set();
  let locked = false;

  function createCard(meal, idx) {
    const id = mealIdFor(meal, idx);
    const card = document.createElement("div");
    card.className = "card";
    card.tabIndex = 0;
    card.dataset.idx = idx;
    card.dataset.id = id;

    const img = document.createElement("img");
    img.src = meal.image || "";
    img.alt = meal.title || "";

    const title = document.createElement("h4");
    title.textContent = meal.title || "";

    const subtitle = document.createElement("p");
    subtitle.className = "muted";
    subtitle.textContent = meal.subtitle || "";

    const selector = document.createElement("div");
    selector.className = "selector";
    selector.textContent = "Select";

    // initial cards no longer include portion selects (selected later in My Week)
    card.appendChild(selector);
    card.appendChild(img);
    card.appendChild(title);
    card.appendChild(subtitle);

    // Toggle select on click (if not locked)
    card.addEventListener("click", (e) => {
      if (locked) return;
      const sid = String(id);
      if (selected.has(sid)) {
        selected.delete(sid);
        card.classList.remove("selected");
        selector.textContent = "Select";
      } else {
        selected.add(sid);
        card.classList.add("selected");
        selector.textContent = "Selected";
      }
      nextBtn.disabled = selected.size === 0;
    });

    // Double-click shows details (and PDF controls)
    card.addEventListener("dblclick", () => {
      showModalForMeal(meal);
    });

    // Keyboard: Enter toggles selection; Space opens details
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter") card.click();
      if (e.key === " ") {
        e.preventDefault();
        card.dispatchEvent(new Event('dblclick'));
      }
    });

    return card;
  }

  function renderMenu() {
    if (!menu) return;
    menu.innerHTML = "";
    if (!meals.length) {
      menu.innerHTML = '<div style="grid-column:1/-1;color:#374151;padding:12px">No meals in week.json</div>';
      return;
    }
    meals.forEach((m,i) => menu.appendChild(createCard(m,i)));
    nextBtn.disabled = true;
  }

  // Determine embeddable local PDFs
  function isLocalPdf(url) {
    if (!url) return false;
    // normalized checks:
    try {
      // relative (./pdfs/...) or explicit path under /docs/pdfs or /pdfs or /static/pdfs
      if (url.startsWith("./pdfs/") || url.startsWith("/docs/pdfs/") || url.startsWith("/pdfs/") || url.startsWith("/static/pdfs/")) return true;
      const parsed = new URL(url, location.href);
      // same origin + path under /docs/pdfs or /pdfs or /static/pdfs
      if (parsed.origin === location.origin) {
        const p = parsed.pathname || "";
        if (p.startsWith("/docs/pdfs/") || p.startsWith("/pdfs/") || p.startsWith("/static/pdfs/")) return true;
      }
    } catch (e) {
      // ignore parse errors
    }
    return false;
  }

  // Show modal and setup PDF controls
  function showModalForMeal(meal) {
    safeText(modalTitle, meal.title || "");
    safeText(modalSubtitle, meal.subtitle || "");
    safeText(modalDesc, meal.description || "");
    if (meal.ingredients && meal.ingredients.length) {
      safeHtml(modalIngredients, "<strong>Ingredients:</strong><br>" +
        meal.ingredients.map(i => `${i.quantity_display || i.quantity || ""} ${i.unit||""} ${i.ingredient}`).join("<br>"));
    } else {
      safeText(modalIngredients, "");
    }

    // Reset PDF viewer state
    if (modalPdfViewer) modalPdfViewer.style.display = "none";
    if (modalPdfIframe) modalPdfIframe.src = "";
    if (modalPdfMessage) modalPdfMessage.textContent = "";

    const pdfUrl = meal.pdf || meal.url || "";
    // Setup modal main link: external recipes open in new tab; local PDFs we will prefer inline viewing
    if (modalLink) {
      if (pdfUrl && isLocalPdf(pdfUrl) && pdfUrl.toLowerCase().endsWith(".pdf")) {
        // local pdf: link will still allow download but we won't force _blank for inline view
        modalLink.href = pdfUrl;
        modalLink.textContent = "Open PDF (download/view)";
        modalLink.target = "_self";
        modalLink.rel = "";
      } else {
        // external: open in new tab
        modalLink.href = pdfUrl || "#";
        modalLink.textContent = pdfUrl ? ((meal.pdf && meal.pdf.endsWith(".pdf")) ? "Open PDF in new tab" : "Open recipe page") : "No link";
        modalLink.target = "_blank";
        modalLink.rel = "noopener";
      }
    }

    // hide controls by default
    if (modalViewPdfBtn) modalViewPdfBtn.style.display = "none";
    if (modalDownloadLink) { modalDownloadLink.style.display = "none"; modalDownloadLink.href = ""; }

    // If PDF exists and is a .pdf, surface controls. For local PDFs prefer inline viewer.
    if (pdfUrl && pdfUrl.toLowerCase().endsWith(".pdf")) {
      if (isLocalPdf(pdfUrl)) {
        if (modalViewPdfBtn) modalViewPdfBtn.style.display = "";
        if (modalDownloadLink) { modalDownloadLink.style.display = ""; modalDownloadLink.textContent = "Download PDF"; modalDownloadLink.href = pdfUrl; modalDownloadLink.setAttribute('download',''); }
      } else {
        // non-local PDF: allow view attempt but warn if blocked
        if (modalViewPdfBtn) modalViewPdfBtn.style.display = "";
        if (modalDownloadLink) { modalDownloadLink.style.display = ""; modalDownloadLink.textContent = "Download PDF"; modalDownloadLink.href = pdfUrl; }
      }
    }

    safeShowModal();
  }

  // Modal View PDF button behavior (attempt to embed PDF in iframe)
  if (modalViewPdfBtn) {
    modalViewPdfBtn.addEventListener("click", () => {
      const href = modalLink ? modalLink.href : "";
      if (!href) return;
      modalPdfMessage && (modalPdfMessage.textContent = "Loading PDF...");
      modalPdfViewer && (modalPdfViewer.style.display = "");
      // Set iframe to href (if same-origin and served with inline disposition, browser will render)
      if (modalPdfIframe) modalPdfIframe.src = href;

      // UX fallback note: if the server blocks framing or forces download this will not show.
      setTimeout(() => {
        if (modalPdfMessage) modalPdfMessage.textContent = "If the PDF does not appear it may be blocked from embedding. Use the Download or Open links.";
      }, 700);
    });
  }

  // Next behavior: keep selected, show My Week with portion selectors, build grocery after portions chosen and Build Ingredients clicked
  nextBtn && nextBtn.addEventListener("click", () => {
    if (!selected.size) return;
    locked = true;

    // Build chosenMeals preserving stable ids
    const chosen = [];
    Array.from(selected).forEach(id => {
      const meal = meals.find((m, idx) => mealIdFor(m, idx) === id);
      if (meal) chosen.push({ id, meal });
    });

    // Render selected preview (My Week) — include portion selects here
    if (selectedDiv) {
      selectedDiv.innerHTML = "";
      chosen.forEach(({id, meal}, i) => {
        const c = document.createElement("div");
        c.className = "card";

        // image/title/subtitle with link to pdf/url (open in new tab for external, inline-capable for local)
        const linkHref = meal.pdf || meal.url || "";
        const hasLink = !!linkHref;
        const anchor = hasLink ? document.createElement("a") : document.createElement("div");
        if (hasLink) {
          anchor.href = linkHref;
          // external should open new tab; local PDFs are same-origin so don't force new tab
          if (isLocalPdf(linkHref)) { anchor.target = "_self"; anchor.rel = ""; } else { anchor.target = "_blank"; anchor.rel = "noopener"; }
          anchor.style.textDecoration = "none";
          anchor.style.color = "inherit";
        }
        const imgEl = document.createElement("img");
        imgEl.src = meal.image||'';
        imgEl.alt = meal.title||'';
        const h4 = document.createElement("h4");
        h4.textContent = meal.title||'';
        const p = document.createElement("p");
        p.className = "muted";
        p.textContent = meal.subtitle||'';
        if (hasLink) {
          anchor.appendChild(imgEl);
          anchor.appendChild(h4);
          anchor.appendChild(p);
          c.appendChild(anchor);
        } else {
          c.appendChild(imgEl);
          c.appendChild(h4);
          c.appendChild(p);
        }

        // portion selector (base 2 shown as default)
        const label = document.createElement("label");
        label.className = "portion";
        label.innerHTML = `Portions: <select data-portion-id="${encodeURIComponent(id)}">` +
          Array.from({length:9},(_,n)=>n+2).map(n=>`<option value="${n}">${n}</option>`).join("") +
          `</select>`;
        c.appendChild(label);

        selectedDiv.appendChild(c);
      });

      // Add a Build Ingredients button below the selected preview to finalize portions -> grocery
      const buildBtn = document.createElement("button");
      buildBtn.textContent = "Build Ingredients";
      buildBtn.style.marginTop = "12px";
      buildBtn.addEventListener("click", () => {
        // Read portion values from My Week preview selects keyed by data-portion-id
        const portionsMap = {};
        chosen.forEach(({id}) => {
          const sel = document.querySelector(`select[data-portion-id="${encodeURIComponent(id)}"]`);
          portionsMap[id] = sel ? parseInt(sel.value, 10) : 2;
        });

        // build grocery list using these portions
        const groceryItems = [];
        chosen.forEach(({id, meal}) => {
          const portion = portionsMap[id] || 2;
          (meal.ingredients || []).forEach(ing => {
            const copy = Object.assign({}, ing);
            if (copy.quantity != null) {
              copy.quantity = copy.quantity * (portion/2);
              copy.quantity_display = (copy.quantity % 1 === 0) ? String(copy.quantity) : copy.quantity.toFixed(2);
            }
            groceryItems.push(copy);
          });
        });

        // aggregate simple
        const grouped = {};
        groceryItems.forEach(ing => {
          if (!ing || !ing.ingredient) return;
          const key = (ing.ingredient + "|" + (ing.unit||"")).toLowerCase();
          if (!grouped[key]) grouped[key] = { ...ing, quantity: 0 };
          if (ing.quantity) grouped[key].quantity += Number(ing.quantity);
          else if (!grouped[key].quantity && ing.quantity_display) grouped[key].quantity_display = ing.quantity_display;
        });
        groceryList && (groceryList.innerHTML = "");
        Object.values(grouped).forEach(ing => {
          const qty = ing.quantity ? (Number.isInteger(ing.quantity) ? ing.quantity : ing.quantity.toFixed(2)) : (ing.quantity_display || "");
          const li = document.createElement("li");
          li.textContent = `${qty} ${ing.unit||""} ${ing.ingredient}`.trim();
          groceryList && groceryList.appendChild(li);
        });
        grocerySection && grocerySection.classList.remove("hidden");
        buildBtn.disabled = true;
        resetBtn && resetBtn.classList.remove("hidden");
      });

      selectedDiv.appendChild(buildBtn);
    }

    // Re-render menu to only show chosen items (still selected)
    if (menu) {
      menu.innerHTML = "";
      chosen.forEach(({meal}, i) => {
        const card = createCard(meal,i);
        card.classList.add("selected");
        const pill = card.querySelector(".selector");
        if (pill) pill.textContent = "Selected";
        menu.appendChild(card);
      });
    }

    nextBtn.disabled = true;
  });

  // Reset
  resetBtn && resetBtn.addEventListener("click", () => {
    selected = new Set();
    locked = false;
    selectedDiv && (selectedDiv.innerHTML = "");
    groceryList && (groceryList.innerHTML = "");
    grocerySection && grocerySection.classList.add("hidden");
    resetBtn.classList.add("hidden");
    renderMenu();
  });

  // modal close handlers (defensive)
  if (modalClose) modalClose.addEventListener("click", safeHideModal);
  if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) safeHideModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") safeHideModal(); });

  // Download grocery
  downloadBtn && downloadBtn.addEventListener("click", () => {
    const text = Array.from((groceryList||{querySelectorAll:() => []}).querySelectorAll("li")).map(li => "• " + li.textContent).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "grocery-list.txt";
    a.click();
    URL.revokeObjectURL(url);
  });

  // Initial render
  renderMenu();
})();
