// docs/app.js — updated housekeeping and UX improvements:
// - Hide original menu after Next; show a non-duplicated My Week preview (max 3 cards + "+N more")
// - Floating Next/Back action so it's visible while scrolling
// - Prettier Build Ingredients button below My Week; supports repeated rebuilds and changing portions
// - Back restores menu and keeps selections and portions
(async function() {
  // Load week.json
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

  // modal elements
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

  // helpers
  function safeText(el, text) { if (el) el.textContent = text || ""; }
  function safeHtml(el, html) { if (el) el.innerHTML = html || ""; }
  function safeShowModal() { if (modal) modal.classList.remove("hidden"); }
  function safeHideModal() { if (modal) modal.classList.add("hidden"); }

  safeHideModal();

  // stable id helper
  function mealIdFor(meal, idx) {
    return (meal && meal.url) ? meal.url : String(idx);
  }

  // state
  let selected = new Set();        // set of mealId strings
  let locked = false;              // locked after pressing Next
  let isMenuVisible = true;        // toggles menu vs my-week view

  // remember portion choices by meal id (persist while navigating)
  const portions = {}; // { [mealId]: number }

  // UI: floating action (created if not present)
  let floatAction = document.getElementById("float-action");
  if (!floatAction) {
    floatAction = document.createElement("div");
    floatAction.id = "float-action";
    floatAction.className = "float-action";
    document.body.appendChild(floatAction);
  }

  // ensure next button exists in DOM control too (for accessibility / non-JS)
  // But the floating action will control Next/Back and mirror state.
  function setFloatingToNext() {
    floatAction.innerHTML = '<button id="float-next" class="btn primary">Next</button>';
    const btn = document.getElementById("float-next");
    if (btn) btn.addEventListener("click", () => nextHandler());
  }
  function setFloatingToBack() {
    floatAction.innerHTML = '<button id="float-back" class="btn secondary">Back</button>';
    const btn = document.getElementById("float-back");
    if (btn) btn.addEventListener("click", () => backToSelection());
  }
  // start state
  setFloatingToNext();

  function createCard(meal, idx, options = {}) {
    // options: { showSelector: true/false, preSelected: true/false }
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

    if (options.showSelector) {
      const selector = document.createElement("div");
      selector.className = "selector";
      selector.textContent = options.preSelected ? "Selected" : "Select";
      card.appendChild(selector);
    }

    card.appendChild(img);
    card.appendChild(title);
    card.appendChild(subtitle);

    // Toggle select on click (only when not locked)
    card.addEventListener("click", () => {
      if (locked) return;
      const sid = String(id);
      const selector = card.querySelector(".selector");
      if (selected.has(sid)) {
        selected.delete(sid);
        card.classList.remove("selected");
        if (selector) selector.textContent = "Select";
      } else {
        selected.add(sid);
        card.classList.add("selected");
        if (selector) selector.textContent = "Selected";
      }
      // sync visible control
      nextBtn.disabled = selected.size === 0;
      const floatNext = document.getElementById("float-next");
      if (floatNext) floatNext.disabled = selected.size === 0;
    });

    // double click shows modal
    card.addEventListener("dblclick", () => {
      showModalForMeal(meal);
    });

    // keyboard
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter") card.click();
      if (e.key === " ") {
        e.preventDefault();
        card.dispatchEvent(new Event("dblclick"));
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
    meals.forEach((m,i) => menu.appendChild(createCard(m,i,{ showSelector:true, preSelected: selected.has(mealIdFor(m,i)) })));
    nextBtn.disabled = selected.size === 0;
    const floatNext = document.getElementById("float-next");
    if (floatNext) floatNext.disabled = selected.size === 0;
    isMenuVisible = true;
    // floating should show Next
    setFloatingToNext();
    // ensure menu visible
    if (menu) menu.classList.remove("hidden");
    // hide My Week area if present
    if (selectedDiv) selectedDiv.classList.add("hidden");
  }

  // Modal & PDF logic re-used from previous version (no changes to behavior)
  function isLocalPdf(url) {
    if (!url) return false;
    try {
      if (url.startsWith("./pdfs/") || url.startsWith("/docs/pdfs/") || url.startsWith("/pdfs/") || url.startsWith("/static/pdfs/")) return true;
      const parsed = new URL(url, location.href);
      if (parsed.origin === location.origin) {
        const p = parsed.pathname || "";
        if (p.startsWith("/docs/pdfs/") || p.startsWith("/pdfs/") || p.startsWith("/static/pdfs/")) return true;
      }
    } catch (e){}
    return false;
  }

  function showModalForMeal(meal) {
    safeText(modalTitle, meal.title || "");
    safeText(modalSubtitle, meal.subtitle || "");
    safeText(modalDesc, meal.description || "");
    if (meal.ingredients && meal.ingredients.length) {
      safeHtml(modalIngredients, "<strong>Ingredients:</strong><br>" +
        meal.ingredients.map(i => `${i.quantity_display || i.quantity || ""} ${i.unit||""} ${i.ingredient}`).join("<br>"));
    } else safeText(modalIngredients, "");
    // reset pdf viewer
    if (modalPdfViewer) modalPdfViewer.style.display = "none";
    if (modalPdfIframe) modalPdfIframe.src = "";
    if (modalPdfMessage) modalPdfMessage.textContent = "";
    const pdfUrl = meal.pdf || meal.url || "";
    if (modalLink) {
      if (pdfUrl && isLocalPdf(pdfUrl) && pdfUrl.toLowerCase().endsWith(".pdf")) {
        modalLink.href = pdfUrl;
        modalLink.textContent = "Open PDF (download/view)";
        modalLink.target = "_self";
        modalLink.rel = "";
      } else {
        modalLink.href = pdfUrl || "#";
        modalLink.textContent = pdfUrl ? ((meal.pdf && meal.pdf.endsWith(".pdf")) ? "Open PDF in new tab" : "Open recipe page") : "No link";
        modalLink.target = "_blank";
        modalLink.rel = "noopener";
      }
    }
    if (modalViewPdfBtn) modalViewPdfBtn.style.display = (pdfUrl && pdfUrl.toLowerCase().endsWith(".pdf")) ? "" : "none";
    if (modalDownloadLink) {
      if (pdfUrl && pdfUrl.toLowerCase().endsWith(".pdf")) {
        modalDownloadLink.style.display = "";
        modalDownloadLink.href = pdfUrl;
        modalDownloadLink.textContent = "Download PDF";
        if (isLocalPdf(pdfUrl)) modalDownloadLink.setAttribute("download", "");
      } else {
        modalDownloadLink.style.display = "none";
      }
    }
    safeShowModal();
  }

  if (modalViewPdfBtn) {
    modalViewPdfBtn.addEventListener("click", () => {
      const href = modalLink ? modalLink.href : "";
      if (!href) return;
      modalPdfMessage && (modalPdfMessage.textContent = "Loading PDF...");
      modalPdfViewer && (modalPdfViewer.style.display = "");
      if (modalPdfIframe) modalPdfIframe.src = href;
      setTimeout(() => {
        if (modalPdfMessage) modalPdfMessage.textContent = "If the PDF does not appear it may be blocked from embedding. Use the Download or Open links.";
      }, 700);
    });
  }

  // Build / My Week behavior
  function nextHandler() {
    if (!selected.size) return;
    locked = true;
    // show My Week preview (only show up to 3 cards with +N indicator)
    const chosen = Array.from(selected).map(id => {
      // find by id
      const m = meals.find((mm, idx) => mealIdFor(mm, idx) === id);
      return { id, meal: m };
    }).filter(x => x.meal);

    // hide menu
    if (menu) menu.classList.add("hidden");
    isMenuVisible = false;
    // update floating button to Back
    setFloatingToBack();

    // render preview
    if (selectedDiv) {
      selectedDiv.classList.remove("hidden");
      selectedDiv.innerHTML = "";
      const previewWrap = document.createElement("div");
      previewWrap.className = "myweek-wrap";

      const showCount = 3;
      chosen.slice(0, showCount).forEach(({id, meal}) => {
        const c = document.createElement("div");
        c.className = "card myweek-card";

        // anchor wraps image/title/subtitle and links to pdf or recipe
        const linkHref = meal.pdf || meal.url || "";
        const hasLink = !!linkHref;
        const anchor = hasLink ? document.createElement("a") : document.createElement("div");
        if (hasLink) {
          anchor.href = linkHref;
          // local pdfs shouldn't force new tab so users can view inline
          if (isLocalPdf(linkHref)) { anchor.target = "_self"; anchor.rel = ""; } else { anchor.target = "_blank"; anchor.rel = "noopener"; }
          anchor.style.textDecoration = "none";
          anchor.style.color = "inherit";
        }
        const imgEl = document.createElement("img");
        imgEl.src = meal.image || "";
        imgEl.alt = meal.title || "";
        const h4 = document.createElement("h4");
        h4.textContent = meal.title || "";
        const p = document.createElement("p");
        p.className = "muted";
        p.textContent = meal.subtitle || "";
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

        // portion control (persisting previous selection if present)
        const portionLabel = document.createElement("label");
        portionLabel.className = "portion";
        const select = document.createElement("select");
        select.setAttribute("data-portion-id", encodeURIComponent(id));
        for (let n=2; n<=10; n++) {
          const opt = document.createElement("option");
          opt.value = n;
          opt.textContent = n;
          select.appendChild(opt);
        }
        // set preselected value if we have one
        const prev = portions[id];
        if (prev) select.value = String(prev);
        portionLabel.innerHTML = "Portions: ";
        portionLabel.appendChild(select);
        c.appendChild(portionLabel);

        previewWrap.appendChild(c);
      });

      // if more than showCount, add a small +N indicator card
      if (chosen.length > 3) {
        const more = document.createElement("div");
        more.className = "card more-card";
        more.innerHTML = `<div style="padding:18px;text-align:center"><strong>+${chosen.length - 3} more</strong><div class="muted">selected</div></div>`;
        previewWrap.appendChild(more);
      }

      selectedDiv.appendChild(previewWrap);

      // Build button (styled) and small "Rebuild" capability
      let controls = document.getElementById("myweek-controls");
      if (!controls) {
        controls = document.createElement("div");
        controls.id = "myweek-controls";
        controls.className = "myweek-controls";
        selectedDiv.appendChild(controls);
      }
      controls.innerHTML = '';
      const buildBtn = document.createElement("button");
      buildBtn.className = "btn primary";
      buildBtn.textContent = "Build Ingredients";
      buildBtn.addEventListener("click", () => buildIngredients(chosen));
      controls.appendChild(buildBtn);

      const rebuildNote = document.createElement("div");
      rebuildNote.className = "muted small";
      rebuildNote.textContent = "Change portions and press Build Ingredients again to update the list.";
      controls.appendChild(rebuildNote);
    }

    // disable main next UI
    nextBtn.disabled = true;
    const floatNextEl = document.getElementById("float-next");
    if (floatNextEl) floatNextEl.disabled = true;
  }

  function backToSelection() {
    // show menu again, keep selection and portions
    locked = false;
    isMenuVisible = true;
    renderMenu();
    // clear my week preview but keep it in memory
    if (selectedDiv) selectedDiv.innerHTML = "";
    setFloatingToNext();
    // enable next if selections exist
    nextBtn.disabled = selected.size === 0;
    const floatNext = document.getElementById("float-next");
    if (floatNext) floatNext.disabled = selected.size === 0;
  }

  function buildIngredients(chosen) {
    // read portions from selects and persist them
    chosen.forEach(({id}) => {
      const sel = document.querySelector(`select[data-portion-id="${encodeURIComponent(id)}"]`);
      const val = sel ? parseInt(sel.value, 10) : 2;
      portions[id] = val;
    });

    // construct grocery items using portions mapping
    const groceryItems = [];
    chosen.forEach(({id, meal}) => {
      const portion = portions[id] || 2;
      (meal.ingredients || []).forEach(ing => {
        const copy = Object.assign({}, ing);
        if (copy.quantity != null) {
          copy.quantity = copy.quantity * (portion / 2);
          copy.quantity_display = (copy.quantity % 1 === 0) ? String(copy.quantity) : copy.quantity.toFixed(2);
        }
        groceryItems.push(copy);
      });
    });

    // aggregate simple
    const grouped = {};
    groceryItems.forEach(ing => {
      if (!ing || !ing.ingredient) return;
      const key = (ing.ingredient + "|" + (ing.unit || "")).toLowerCase();
      if (!grouped[key]) grouped[key] = { ...ing, quantity: 0 };
      if (ing.quantity) grouped[key].quantity += Number(ing.quantity);
      else if (!grouped[key].quantity && ing.quantity_display) grouped[key].quantity_display = ing.quantity_display;
    });

    // render grocery
    if (groceryList) groceryList.innerHTML = "";
    Object.values(grouped).forEach(ing => {
      const qty = ing.quantity ? (Number.isInteger(ing.quantity) ? ing.quantity : ing.quantity.toFixed(2)) : (ing.quantity_display || "");
      const li = document.createElement("li");
      li.textContent = `${qty} ${ing.unit || ""} ${ing.ingredient}`.trim();
      groceryList && groceryList.appendChild(li);
    });
    grocerySection && grocerySection.classList.remove("hidden");
    // allow multiple rebuilds: do not disable the build button; it remains active for changes
  }

  // Reset handler resets everything
  resetBtn && resetBtn.addEventListener("click", () => {
    selected = new Set();
    locked = false;
    portions = {}; // reset portions mapping
    selectedDiv && (selectedDiv.innerHTML = "");
    groceryList && (groceryList.innerHTML = "");
    grocerySection && (grocerySection.classList.add("hidden"));
    resetBtn.classList.add("hidden");
    renderMenu();
  });

  // wire floating "Next" to mirror the static next button (in case of non-JS)
  if (nextBtn) nextBtn.addEventListener("click", () => nextHandler());
  // and ensure float button also responds to keyboard (already a button)

  // modal close handlers
  if (modalClose) modalClose.addEventListener("click", safeHideModal);
  if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) safeHideModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") safeHideModal(); });

  // download grocery
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

  // initial render
  renderMenu();
})();
