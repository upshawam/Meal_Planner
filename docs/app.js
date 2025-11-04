// Updated docs/app.js with persistent PDF-only filtering everywhere
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

  // Filter for recipes with a PDF everywhere
  const allMeals = (data.meals || []).filter(m => m.pdf && (typeof m.pdf === "string") && m.pdf.trim());
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

  // state (persistent selection and portion mapping)
  let selected = new Set();
  let locked = false;
  let isMenuVisible = true;
  const portions = {}; // persisted portion choices
  let currentChosen = []; // last chosen array (id, meal) used in My Week view

  // update top controls (count + Next text/behavior)
  function updateTopControls() {
    const count = selected.size;
    if (topCount) topCount.textContent = `${count} selected`;
    if (!topNext) return;
    if (isMenuVisible) {
      topNext.disabled = count === 0;
      topNext.textContent = "Next";
    } else {
      topNext.disabled = currentChosen.length === 0;
      topNext.textContent = "Build Ingredients";
    }
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

    // selector pill shown on initial menu cards (unless explicitly disabled)
    if (opts.showSelector !== false) {
      const selector = document.createElement("div");
      selector.className = "selector";
      selector.textContent = selected.has(id) ? "Selected" : "Select";
      card.appendChild(selector);
    }

    card.appendChild(img);
    card.appendChild(title);
    card.appendChild(subtitle);

    // If this meal is already selected, mark it visually on render
    if (selected.has(id)) {
      card.classList.add("selected");
      const sel = card.querySelector(".selector");
      if (sel) sel.textContent = "Selected";
    }

    // click toggles selection (only when menu visible / not locked)
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

    // double-click opens modal details (ingredients + pdf controls)
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

  // initial render of the menu grid (PDF-only)
  function renderMenu() {
    if (!menu) return;
    menu.innerHTML = "";

    // Only show meals with PDF
    const displayMeals = allMeals;

    if (!displayMeals.length) {
      menu.innerHTML = '<div style="grid-column:1/-1;color:#374151;padding:12px">No meals with PDF in week.json</div>';
      return;
    }
    displayMeals.forEach((m,i) => menu.appendChild(createCard(m,i)));
    // ensure menu visible
    if (menu) menu.classList.remove("hidden");
    if (selectedDiv) selectedDiv.classList.add("hidden");
    isMenuVisible = true;
    locked = false;
    currentChosen = [];
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

    // only consider selected PDF-meals
    const chosenIds = Array.from(selected);
    currentChosen = chosenIds.map(id => {
      const m = allMeals.find((mm, idx) => mealIdFor(mm, idx) === id);
      return m ? { id, meal: m } : null;
    }).filter(x => x && x.meal && x.meal.pdf && x.meal.pdf.trim());

    // hide original menu
    if (menu) menu.classList.add("hidden");

    // build two-column preview
    if (selectedDiv) {
      selectedDiv.classList.remove("hidden");
      selectedDiv.innerHTML = "";
      const twoCol = document.createElement("div");
      twoCol.className = "my-week-two-col";

      // left column: compact preview + small inner padding to avoid overlap
      const left = document.createElement("div");
      left.className = "myweek-left";

      const leftInner = document.createElement("div");
      leftInner.style.paddingRight = "6px";

      const previewWrap = document.createElement("div");
      previewWrap.className = "myweek-wrap";

      // create recipe card for each chosen meal (PDF guarantee)
      currentChosen.forEach(({id, meal}) => {
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

        // ensure this preview card is visually "selected"
        c.classList.add("selected");

        // remove any selector pill left on preview card (if present)
        const maybeSelector = c.querySelector(".selector");
        if (maybeSelector) maybeSelector.remove();

        // recipe pill top-right (solid & visible, PDF-only)
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

      leftInner.appendChild(previewWrap);
      left.appendChild(leftInner);

      // left-column build button note
      const controlsNote = document.createElement("div");
      controlsNote.className = "muted small";
      controlsNote.style.marginTop = "8px";
      controlsNote.textContent = "Use the 'Build Ingredients' button at the top to build the grocery list.";
      left.appendChild(controlsNote);

      // right column: grocery notepad (closer to left now)
      const right = document.createElement("div");
      right.className = "grocery-notepad";
      right.id = "grocery-notepad";
      right.style.maxWidth = "320px";
      right.style.marginLeft = "10px";

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

  // Build ingredients: read portions, scale, aggregate, render to notepad (PDF-only)
  function buildIngredients() {
    // use currentChosen (PDF guarantee)
    if (!currentChosen || !currentChosen.length) return;

    currentChosen.forEach(({id}) => {
      const sel = document.querySelector(`select[data-portion-id="${encodeURIComponent(id)}"]`);
      const val = sel ? parseInt(sel.value, 10) : 2;
      portions[id] = val;
    });

    const groceryItems = [];
    currentChosen.forEach(({id, meal}) => {
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
  if (topNext) topNext.addEventListener("click", () => {
    if (isMenuVisible) nextHandler();
    else buildIngredients();
  });
  if (topBack) topBack.addEventListener("click", () => backToSelection());

  // modal close handlers
  if (modalClose) modalClose.addEventListener("click", safeHideModal);
  if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) safeHideModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") safeHideModal(); });

  // initial render (PDF guarantee)
  renderMenu();
})();
