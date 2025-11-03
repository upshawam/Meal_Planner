// Updated app.js to show tighter grid, visible selector pill, recipe pill on selected preview cards,
// sticky top-action bar controls, sticky Build Ingredients in the left column, and grocery notepad on the right.
// Drop this into docs/app.js to replace the current file.
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
  const topNext = document.getElementById("top-next");
  const topBack = document.getElementById("top-back");
  const topCount = document.getElementById("top-selected-count");
  const selectedDiv = document.getElementById("selected");

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
  let selected = new Set();
  let locked = false;
  let isMenuVisible = true;
  const portions = {}; // persisted portion choices

  // update top controls (count + enable/disable Next)
  function updateTopControls() {
    const count = selected.size;
    if (topCount) topCount.textContent = `${count} selected`;
    if (topNext) topNext.disabled = count === 0;
    if (topBack) topBack.classList.toggle("hidden", isMenuVisible);
  }

  // create a card element for menu or preview
  function createCard(meal, idx, opts = {}) {
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

    // selector pill shown on initial menu cards
    if (opts.showSelector !== false) {
      const selector = document.createElement("div");
      selector.className = "selector";
      selector.textContent = selected.has(id) ? "Selected" : "Select";
      card.appendChild(selector);
    }

    card.appendChild(img);
    card.appendChild(title);
    card.appendChild(subtitle);

    // click toggles selection (only when menu visible)
    card.addEventListener("click", (e) => {
      if (locked) return;
      const sid = id;
      if (selected.has(sid)) {
        selected.delete(sid);
        card.classList.remove("selected");
        const sel = card.querySelector(".selector");
        if (sel) sel.textContent = "Select";
      } else {
        selected.add(sid);
        card.classList.add("selected");
        const sel = card.querySelector(".selector");
        if (sel) sel.textContent = "Selected";
      }
      updateTopControls();
    });

    // double-click opens modal (details)
    card.addEventListener("dblclick", (e) => {
      showModalForMeal(meal);
    });

    // keyboard accessibility
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter") card.click();
      if (e.key === " ") { e.preventDefault(); card.dispatchEvent(new Event("dblclick")); }
    });

    return card;
  }

  // initial render of the menu grid
  function renderMenu() {
    if (!menu) return;
    menu.innerHTML = "";
    if (!meals.length) {
      menu.innerHTML = '<div style="grid-column:1/-1;color:#374151;padding:12px">No meals in week.json</div>';
      return;
    }
    meals.forEach((m,i) => menu.appendChild(createCard(m,i)));
    // ensure menu visible
    if (menu) menu.classList.remove("hidden");
    if (selectedDiv) selectedDiv.classList.add("hidden");
    isMenuVisible = true;
    locked = false;
    updateTopControls();
  }

  // PDF helper
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

  // Next: hide full menu and show selected-only preview + notepad (two-column)
  function nextHandler() {
    if (!selected.size) return;
    locked = true;
    isMenuVisible = false;

    // gather chosen meals preserving selection order
    const chosen = Array.from(selected).map(id => {
      const m = meals.find((mm, idx) => mealIdFor(mm, idx) === id);
      return { id, meal: m };
    }).filter(x => x.meal);

    // hide original menu
    if (menu) menu.classList.add("hidden");

    // build two-column preview
    if (selectedDiv) {
      selectedDiv.classList.remove("hidden");
      selectedDiv.innerHTML = "";
      const twoCol = document.createElement("div");
      twoCol.className = "my-week-two-col";

      // left column: compact preview + sticky controls
      const left = document.createElement("div");
      left.className = "myweek-left";

      const previewWrap = document.createElement("div");
      previewWrap.className = "myweek-wrap";

      // create one preview card per chosen meal; recipe-pill appears top-right
      chosen.forEach(({id, meal}) => {
        const c = document.createElement("div");
        c.className = "card myweek-card";

        // anchor for main content
        const linkHref = meal.pdf || meal.url || "";
        const anchor = linkHref ? document.createElement("a") : document.createElement("div");
        if (linkHref) {
          anchor.href = linkHref;
          anchor.target = isLocalPdf(linkHref) ? "_self" : "_blank";
          anchor.rel = "noopener";
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
        if (linkHref) {
          anchor.appendChild(imgEl);
          anchor.appendChild(h4);
          anchor.appendChild(p);
          c.appendChild(anchor);
        } else {
          c.appendChild(imgEl);
          c.appendChild(h4);
          c.appendChild(p);
        }

        // portion selector (bottom-left)
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

        // remove any selector pill (menu selector) and add a recipe pill top-right
        const maybeSelector = c.querySelector(".selector");
        if (maybeSelector) maybeSelector.remove();

        if (linkHref) {
          const recipe = document.createElement("a");
          recipe.className = "recipe-pill";
          recipe.textContent = "Recipe";
          recipe.href = linkHref;
          recipe.target = isLocalPdf(linkHref) ? "_self" : "_blank";
          recipe.rel = "noopener";
          recipe.addEventListener("click", (ev) => ev.stopPropagation());
          c.appendChild(recipe);
        }

        previewWrap.appendChild(c);
      });

      left.appendChild(previewWrap);

      // sticky build controls so the Build button is always visible
      const controls = document.createElement("div");
      controls.className = "myweek-controls";
      controls.style.position = "sticky";
      controls.style.top = "72px"; // below top bar
      const buildBtn = document.createElement("button");
      buildBtn.className = "btn primary";
      buildBtn.textContent = "Build Ingredients";
      buildBtn.addEventListener("click", () => buildIngredients(chosen));
      controls.appendChild(buildBtn);
      const note = document.createElement("div");
      note.className = "muted small";
      note.textContent = "Change portions and press Build Ingredients again to update the list.";
      controls.appendChild(note);
      left.appendChild(controls);

      // right column: grocery notepad
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

    updateTopControls();
  }

  // Back: show menu again, preserve selected set and portion choices
  function backToSelection() {
    locked = false;
    isMenuVisible = true;
    renderMenu();
    if (selectedDiv) selectedDiv.innerHTML = "";
    updateTopControls();
  }

  // Build ingredients: read portions, scale, aggregate, render to notepad
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

    // render into notepad list
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
  }

  // wire top controls
  if (topNext) topNext.addEventListener("click", () => nextHandler());
  if (topBack) topBack.addEventListener("click", () => backToSelection());

  // modal close handlers
  if (modalClose) modalClose.addEventListener("click", safeHideModal);
  if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) safeHideModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") safeHideModal(); });

  // initial render
  renderMenu();
})();
