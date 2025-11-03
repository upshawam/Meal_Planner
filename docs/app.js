// docs/app.js — keep top sticky bar synced with selection and wire top-next/top-back to same handlers
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
  const topNext = document.getElementById("top-next");
  const topBack = document.getElementById("top-back");
  const topCount = document.getElementById("top-selected-count");
  const resetBtn = document.getElementById("reset");
  const selectedDiv = document.getElementById("selected");
  const grocerySection = document.getElementById("grocery-section");
  const groceryList = document.getElementById("grocery");
  const downloadBtn = document.getElementById("download");

  // modal elements (unchanged)
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

  function mealIdFor(meal, idx) {
    return (meal && meal.url) ? meal.url : String(idx);
  }

  let selected = new Set();
  let locked = false;
  let isMenuVisible = true;
  const portions = {};

  // floating action (keep if present) — still used for mobile UX
  let floatAction = document.getElementById("float-action");
  if (!floatAction) {
    floatAction = document.createElement("div");
    floatAction.id = "float-action";
    floatAction.className = "float-action";
    document.body.appendChild(floatAction);
  }

  function updateTopControls() {
    const count = selected.size;
    if (topCount) topCount.textContent = `${count} selected`;
    if (topNext) {
      topNext.disabled = count === 0;
      topNext.classList.toggle("disabled", count === 0);
      topNext.style.opacity = count === 0 ? "0.6" : "1";
    }
    // keep static next in sync for non-JS fallback
    if (nextBtn) nextBtn.disabled = count === 0;
    // show/hide topBack depending on menu state
    if (topBack) topBack.classList.toggle("hidden", isMenuVisible);
    // if we have a floatNext (mobile), keep it in sync too
    const floatNext = document.querySelector("#float-action .fab, #float-next");
    if (floatNext) floatNext.disabled = count === 0;
  }

  function createCard(meal, idx, options = {}) {
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
      updateTopControls();
    });

    card.addEventListener("dblclick", () => showModalForMeal(meal));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter") card.click();
      if (e.key === " ") { e.preventDefault(); card.dispatchEvent(new Event("dblclick")); }
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
    isMenuVisible = true;
    setFloatingToNext();
    if (menu) menu.classList.remove("hidden");
    if (selectedDiv) selectedDiv.classList.add("hidden");
    updateTopControls();
  }

  // topNext/topBack wiring
  if (topNext) topNext.addEventListener("click", () => nextHandler());
  if (topBack) topBack.addEventListener("click", () => backToSelection());
  // mirror of non-js fallback next button
  if (nextBtn) nextBtn.addEventListener("click", () => nextHandler());

  // simple floating action helpers (keeps previous mobile behavior)
  function setFloatingToNext() {
    floatAction.innerHTML = '<button id="float-next" class="fab">Next</button>';
    const btn = document.getElementById("float-next");
    if (btn) btn.addEventListener("click", () => nextHandler());
  }
  function setFloatingToBack() {
    floatAction.innerHTML = '<button id="float-back" class="btn secondary">Back</button>';
    const btn = document.getElementById("float-back");
    if (btn) btn.addEventListener("click", () => backToSelection());
  }
  setFloatingToNext();

  // Modal & PDF logic (unchanged)
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

  // Build / My Week behavior (unchanged logic — kept from previous version)
  function nextHandler() {
    if (!selected.size) return;
    locked = true;
    const chosen = Array.from(selected).map(id => {
      const m = meals.find((mm, idx) => mealIdFor(mm, idx) === id);
      return { id, meal: m };
    }).filter(x => x.meal);

    if (menu) menu.classList.add("hidden");
    isMenuVisible = false;
    setFloatingToBack();

    if (selectedDiv) {
      selectedDiv.classList.remove("hidden");
      selectedDiv.innerHTML = "";

      const twoCol = document.createElement("div");
      twoCol.className = "my-week-two-col";

      const left = document.createElement("div");
      left.className = "myweek-left";
      const previewWrap = document.createElement("div");
      previewWrap.className = "myweek-wrap";

      const showCount = 3;
      chosen.slice(0, showCount).forEach(({id, meal}) => {
        const c = document.createElement("div");
        c.className = "card myweek-card";

        const linkHref = meal.pdf || meal.url || "";
        const hasLink = !!linkHref;
        const anchor = hasLink ? document.createElement("a") : document.createElement("div");
        if (hasLink) {
          anchor.href = linkHref;
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
        const prev = portions[id];
        if (prev) select.value = String(prev);
        portionLabel.innerHTML = "Portions: ";
        portionLabel.appendChild(select);
        c.appendChild(portionLabel);

        previewWrap.appendChild(c);
      });

      if (chosen.length > showCount) {
        const more = document.createElement("div");
        more.className = "card more-card";
        more.innerHTML = `<div style="padding:18px;text-align:center"><strong>+${chosen.length - showCount} more</strong><div class="muted">selected</div></div>`;
        previewWrap.appendChild(more);
      }

      left.appendChild(previewWrap);

      let controls = document.createElement("div");
      controls.className = "myweek-controls";
      const buildBtn = document.createElement("button");
      buildBtn.className = "btn primary";
      buildBtn.textContent = "Build Ingredients";
      buildBtn.addEventListener("click", () => buildIngredients(chosen));
      controls.appendChild(buildBtn);
      const rebuildNote = document.createElement("div");
      rebuildNote.className = "muted small";
      rebuildNote.textContent = "Change portions and press Build Ingredients again to update the list.";
      controls.appendChild(rebuildNote);
      left.appendChild(controls);

      const right = document.createElement("div");
      right.className = "grocery-notepad";
      right.id = "grocery-notepad";
      const header = document.createElement("div");
      header.className = "note-header";
      const title = document.createElement("div");
      title.className = "note-title";
      title.textContent = "Grocery List";
      const sub = document.createElement("div");
      sub.className = "note-sub";
      sub.textContent = "Built from selected meals";
      header.appendChild(title);
      header.appendChild(sub);
      right.appendChild(header);
      const body = document.createElement("div");
      body.className = "note-body";
      const ul = document.createElement("ul");
      ul.id = "grocery-notepad-list";
      body.appendChild(ul);
      right.appendChild(body);
      const noteControls = document.createElement("div");
      noteControls.className = "note-controls";
      const download = document.createElement("button");
      download.className = "btn secondary";
      download.textContent = "Download";
      download.addEventListener("click", () => {
        const lis = Array.from((document.getElementById("grocery-notepad-list")||{querySelectorAll:() => []}).querySelectorAll("li"));
        const text = lis.map(li=> "• " + li.textContent).join("\n");
        const blob = new Blob([text], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "grocery-list.txt";
        a.click();
        URL.revokeObjectURL(url);
      });
      noteControls.appendChild(download);
      right.appendChild(noteControls);

      twoCol.appendChild(left);
      twoCol.appendChild(right);
      selectedDiv.appendChild(twoCol);
    }

    nextBtn.disabled = true;
    updateTopControls();
  }

  function backToSelection() {
    locked = false;
    isMenuVisible = true;
    renderMenu();
    if (selectedDiv) selectedDiv.innerHTML = "";
    setFloatingToNext();
    updateTopControls();
  }

  function buildIngredients(chosen) {
    chosen.forEach(({id}) => {
      const sel = document.querySelector(`select[data-portion-id="${encodeURIComponent(id)}"]`);
      const val = sel ? parseInt(sel.value, 10) : 2;
      portions[id] = val;
    });

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

    const grouped = {};
    groceryItems.forEach(ing => {
      if (!ing || !ing.ingredient) return;
      const key = (ing.ingredient + "|" + (ing.unit || "")).toLowerCase();
      if (!grouped[key]) grouped[key] = { ...ing, quantity: 0 };
      if (ing.quantity) grouped[key].quantity += Number(ing.quantity);
      else if (!grouped[key].quantity && ing.quantity_display) grouped[key].quantity_display = ing.quantity_display;
    });

    // render grocery into notepad list (if present) and into grocerySection fallback
    const ul = document.getElementById("grocery-notepad-list");
    if (ul) {
      ul.innerHTML = "";
      Object.values(grouped).forEach(ing => {
        const qty = ing.quantity ? (Number.isInteger(ing.quantity) ? ing.quantity : ing.quantity.toFixed(2)) : (ing.quantity_display || "");
        const li = document.createElement("li");
        li.textContent = `${qty} ${ing.unit || ""} ${ing.ingredient}`.trim();
        ul.appendChild(li);
      });
    }

    if (groceryList) {
      groceryList.innerHTML = "";
      Object.values(grouped).forEach(ing => {
        const qty = ing.quantity ? (Number.isInteger(ing.quantity) ? ing.quantity : ing.quantity.toFixed(2)) : (ing.quantity_display || "");
        const li = document.createElement("li");
        li.textContent = `${qty} ${ing.unit || ""} ${ing.ingredient}`.trim();
        groceryList.appendChild(li);
      });
    }

    grocerySection && grocerySection.classList.remove("hidden");
  }

  // reset handler
  resetBtn && resetBtn.addEventListener("click", () => {
    selected = new Set();
    locked = false;
    if (selectedDiv) selectedDiv.innerHTML = "";
    if (groceryList) groceryList.innerHTML = "";
    grocerySection && grocerySection.classList.add("hidden");
    resetBtn.classList.add("hidden");
    renderMenu();
    updateTopControls();
  });

  // modal close
  if (modalClose) modalClose.addEventListener("click", safeHideModal);
  if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) safeHideModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") safeHideModal(); });

  // initial render
  renderMenu();
})();
