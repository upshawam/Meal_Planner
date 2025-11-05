// Only one rebuild button, notepad header row with copy button, portion select below description, three-high stack grid
(async function() {
  let data;
  let allMeals = [];
  let weeksIndex = []; // entries from docs/weeks_index.json (latest-first)
  let currentIndex = 0; // index into weeksIndex (0 = latest)
  try {
    // Try to load weeks index; if not present, fallback to week.json
    const hasIndex = await loadWeeksIndex();
    if (hasIndex) {
      currentIndex = 0;
      await loadWeekFromPath(weeksIndex[0].path);
    } else {
      // fallback to single week.json
      await loadWeekFromPath("./week.json");
    }
  } catch (err) {
    console.error("Failed to load week data:", err);
    const menu = document.getElementById("menu");
    if (menu) menu.innerHTML = '<div style="grid-column:1/-1;color:#b91c1c;padding:12px">Error loading week data</div>';
    return;
  }

  const menu = document.getElementById("menu");
  const topNext = document.getElementById("top-next");
  const topBack = document.getElementById("top-back");
  const topCount = document.getElementById("top-selected-count");
  const selectedDiv = document.getElementById("selected");
  const pdfToggle = document.getElementById("filter-pdf-toggle");
  const clearBtnInline = document.getElementById("clear-btn-inline");

  const weekPrevBtn = document.getElementById("week-prev");
  const weekNextBtn = document.getElementById("week-next");
  const weekIndicator = document.getElementById("week-indicator");

  // Modal elements
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

  function safeText(el, text) { if (el) el.textContent = text || ""; }
  function safeHtml(el, html) { if (el) el.innerHTML = html || ""; }
  function safeShowModal() { if (modal) modal.classList.remove("hidden"); }
  function safeHideModal() { if (modal) modal.classList.add("hidden"); }

  safeHideModal();

  function mealIdFor(meal, idx) {
    return (meal && meal.url) ? meal.url : String(idx);
  }

  let filterPdfOnly = false;
  let selected = new Set();
  let locked = false;
  let isMenuVisible = true;
  const portions = {};
  let currentChosen = [];

  function getDisplayMeals() {
    if (!allMeals) return [];
    if (filterPdfOnly)
      return allMeals.filter(m => m.pdf && typeof m.pdf === "string" && m.pdf.trim());
    return allMeals;
  }

  function updateTopControls() {
    const count = selected.size;
    if (topCount) topCount.textContent = `${count} selected`;
    if (!topNext) return;
    if (isMenuVisible) {
      topNext.disabled = count === 0;
      topNext.textContent = "Next";
    } else {
      topNext.disabled = currentChosen.length === 0;
      topNext.textContent = "Rebuild Ingredients";
    }
    if (topBack) topBack.classList.toggle("hidden", isMenuVisible);
  }

  function createCard(meal, idx, opts = {}) {
    const id = mealIdFor(meal, idx);
    const card = document.createElement("div");
    card.className = "card myweek-card";
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

    card.appendChild(img);
    card.appendChild(title);
    card.appendChild(subtitle);

    if (selected.has(id)) {
      card.classList.add("selected");
    }
    if (opts.showSelector !== false) {
      const selector = document.createElement("div");
      selector.className = "selector";
      selector.textContent = selected.has(id) ? "Selected" : "Select";
      card.appendChild(selector);
    }
    // Portion select: only on build page!
    if (opts.recipePreview) {
      // Place "portions" below description & avoid overlap
      const portionLabel = document.createElement("label");
      portionLabel.className = "portion";
      portionLabel.style.position = "relative"; // changed from absolute!
      portionLabel.style.left = "";
      portionLabel.style.right = "";
      portionLabel.style.bottom = "";
      portionLabel.style.background = "#f3f4f6";
      portionLabel.style.borderRadius = "5px";
      portionLabel.style.padding = "8px";
      portionLabel.style.marginBottom = "0";
      portionLabel.style.textAlign = "left";
      portionLabel.style.marginTop = "0";
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
      card.appendChild(portionLabel); // below subtitle, will never overlap
    }

    card.addEventListener("click", (e) => {
      if (locked) return;
      if (selected.has(id)) {
        selected.delete(id);
        card.classList.remove("selected");
        const sel = card.querySelector(".selector");
        if (sel) sel.textContent = "Select";
      } else {
        selected.add(id);
        card.classList.add("selected");
        const sel = card.querySelector(".selector");
        if (sel) sel.textContent = "Selected";
      }
      updateTopControls();
    });

    card.addEventListener("dblclick", (e) => {
      showModalForMeal(meal);
    });

    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter") card.click();
      if (e.key === " ") { e.preventDefault(); card.dispatchEvent(new Event("dblclick")); }
    });

    return card;
  }

  function renderMenu() {
    if (!menu) return;
    menu.innerHTML = "";
    const displayMeals = getDisplayMeals();
    if (!displayMeals.length) {
      menu.innerHTML = `<div style="grid-column:1/-1;color:#374151;padding:12px">
        ${filterPdfOnly ? "No meals with PDF in week file" : "No meals found in week file"}
        </div>`;
      return;
    }
    displayMeals.forEach((m,i) => menu.appendChild(createCard(m,i, { showSelector: true, recipePreview: false })));
    if (menu) menu.classList.remove("hidden");
    if (selectedDiv) selectedDiv.classList.add("hidden");
    isMenuVisible = true;
    locked = false;
    currentChosen = [];
    updateTopControls();
  }

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

  function nextHandler() {
    if (!selected.size) return;
    locked = true;
    isMenuVisible = false;
    const chosenIds = Array.from(selected);
    currentChosen = chosenIds.map(id => {
      const m = getDisplayMeals().find((mm, idx) => mealIdFor(mm, idx) === id);
      return m ? { id, meal: m } : null;
    }).filter(x => x && x.meal);

    if (menu) menu.classList.add("hidden");
    if (selectedDiv) {
      selectedDiv.classList.remove("hidden");
      selectedDiv.innerHTML = "";

      const twoCol = document.createElement("div");
      twoCol.className = "my-week-two-col";

      // Cards stacked vertically, three high, then fill next column
      const left = document.createElement("div");
      left.className = "myweek-left";
      const previewWrap = document.createElement("div");
      previewWrap.className = "myweek-wrap";
      currentChosen.forEach(({id, meal}, idx) => {
        previewWrap.appendChild(createCard(meal, idx, { showSelector: false, recipePreview: true }));
      });
      left.appendChild(previewWrap);

      // Controls (one rebuild button, and notepad with header row)
      const rightCol = document.createElement("div");
      rightCol.className = "myweek-controls-col";
      const controlsList = document.createElement("div");
      controlsList.className = "myweek-controls-list";
      const portionTitle = document.createElement("div");
      portionTitle.className = "portion-title";
      portionTitle.textContent = "Adjust Portions?";
      portionTitle.style.paddingTop="2px";
      controlsList.appendChild(portionTitle);

      const buildBtn = document.createElement("button");
      buildBtn.className = "build-btn-big";
      buildBtn.textContent = "Rebuild Ingredients";
      buildBtn.addEventListener("click", buildIngredients);
      controlsList.appendChild(buildBtn);

      rightCol.appendChild(controlsList);

      // grocery notepad—wide, visible after next, header row with copy button right
      const notepad = document.createElement("div");
      notepad.className = "grocery-notepad";
      notepad.id = "grocery-notepad";
      notepad.style.display = "";
      const headerRow = document.createElement("div");
      headerRow.className = "header-row";
      const title = document.createElement("div");
      title.className = "note-title";
      title.textContent = "Grocery List";
      headerRow.appendChild(title);

      const copyBtn = document.createElement("button");
      copyBtn.className = "copy-btn";
      copyBtn.textContent = "Copy List";
      const copySuccess = document.createElement("span");
      copySuccess.className = "copy-success";
      copySuccess.style.display = "none";
      copyBtn.addEventListener("click", () => {
        const ul = document.getElementById("grocery-notepad-list");
        const lis = Array.from(ul.querySelectorAll("li"));
        const text = lis.map(li => "• " + li.textContent).join("\n");
        navigator.clipboard.writeText(text)
          .then(() => {
            copySuccess.textContent = "Copied!";
            copySuccess.style.display = "";
            setTimeout(() => { copySuccess.style.display = "none"; }, 1500);
          })
          .catch(() => {
            copySuccess.textContent = "Copy failed";
            copySuccess.style.display = "";
            setTimeout(() => { copySuccess.style.display = "none"; }, 1700);
          });
      });
      headerRow.appendChild(copyBtn);
      headerRow.appendChild(copySuccess);
      notepad.appendChild(headerRow);

      const body = document.createElement("div");
      body.className = "note-body";
      const ul = document.createElement("ul");
      ul.id = "grocery-notepad-list";
      body.appendChild(ul);
      notepad.appendChild(body);

      rightCol.appendChild(notepad);

      twoCol.appendChild(left);
      twoCol.appendChild(rightCol);
      selectedDiv.appendChild(twoCol);

      buildIngredients();
    }
    updateTopControls();
  }

  function backToSelection() {
    locked = false;
    isMenuVisible = true;
    renderMenu();
    if (selectedDiv) selectedDiv.innerHTML = "";
    updateTopControls();
  }

  function buildIngredients() {
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

    // Aggregate
    const grouped = {};
    groceryItems.forEach(ing => {
      if (!ing || !ing.ingredient) return;
      const key = (ing.ingredient + "|" + (ing.unit || "")).toLowerCase();
      if (!grouped[key]) grouped[key] = { ...ing, quantity: 0 };
      if (ing.quantity) grouped[key].quantity += Number(ing.quantity);
      else if (!grouped[key].quantity && ing.quantity_display) grouped[key].quantity_display = ing.quantity_display;
    });

    const ul = document.getElementById("grocery-notepad-list");
    if (ul) {
      ul.innerHTML = "";
      Object.values(grouped).forEach(ing => {
        const qty = ing.quantity ? (Number.isInteger(ing.quantity) ? ing.quantity : ing.quantity.toFixed(2)) : (ing.quantity_display || "");
        const li = document.createElement("li");
        li.textContent = `${qty} ${ing.unit || ""} ${ing.ingredient}`.trim();
        ul.appendChild(li);
      });
      if (ul.childElementCount < 10) {
        ul.classList.add("one-col");
      } else {
        ul.classList.remove("one-col");
      }
    }
  }

  if (topNext) topNext.addEventListener("click", () => {
    if (isMenuVisible) nextHandler();
    else buildIngredients();
  });
  if (topBack) topBack.addEventListener("click", () => backToSelection());
  if (pdfToggle) {
    pdfToggle.checked = filterPdfOnly;
    pdfToggle.addEventListener("change", function() {
      filterPdfOnly = pdfToggle.checked;
      selected = new Set();
      renderMenu();
    });
  }
  if (clearBtnInline) {
    clearBtnInline.addEventListener("click", function() {
      selected = new Set();
      updateTopControls();
      renderMenu();
    });
  }
  if (modalClose) modalClose.addEventListener("click", safeHideModal);
  if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) safeHideModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") safeHideModal(); });

  // --- WEEK LOADING / NAVIGATION HELPERS ---

  async function loadWeeksIndex() {
    try {
      const res = await fetch("./weeks_index.json", { cache: "no-store" });
      if (!res.ok) throw new Error("weeks_index.json not found");
      const json = await res.json();
      if (!Array.isArray(json) || json.length === 0) throw new Error("weeks_index.json invalid or empty");
      // Expect index sorted latest-first; if not, sort by year/week desc
      json.sort((a,b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.week - a.week;
      });
      weeksIndex = json;
      return true;
    } catch (e) {
      console.warn("No weeks_index.json; falling back to week.json", e);
      weeksIndex = [];
      return false;
    }
  }

  async function loadWeekFromPath(path) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) throw new Error("week file not found: " + path);
      const data = await res.json();
      allMeals = data.meals || [];
      // update week indicator
      if (weekIndicator) weekIndicator.textContent = `Week ${data.week} — ${data.year}`;
      renderMenu();
      updateNavButtons();
      return true;
    } catch (e) {
      console.error("Failed to load week file:", e);
      const menu = document.getElementById("menu");
      if (menu) menu.innerHTML = '<div style="grid-column:1/-1;color:#b91c1c;padding:12px">Error loading week file</div>';
      if (weekIndicator) weekIndicator.textContent = "Error loading week";
      return false;
    }
  }

  function updateNavButtons() {
    if (!weeksIndex || !weeksIndex.length) {
      if (weekPrevBtn) weekPrevBtn.disabled = true;
      if (weekNextBtn) weekNextBtn.disabled = true;
      return;
    }
    if (weekPrevBtn) weekPrevBtn.disabled = (currentIndex >= weeksIndex.length - 1);
    if (weekNextBtn) weekNextBtn.disabled = (currentIndex <= 0);
  }

  async function gotoIndex(idx) {
    if (!weeksIndex || !weeksIndex.length) return;
    if (idx < 0 || idx >= weeksIndex.length) return;
    currentIndex = idx;
    const path = weeksIndex[currentIndex].path;
    await loadWeekFromPath(path);
  }

  if (weekPrevBtn) weekPrevBtn.addEventListener("click", async () => {
    if (!weeksIndex.length) return;
    if (currentIndex < weeksIndex.length - 1) {
      await gotoIndex(currentIndex + 1);
    }
  });

  if (weekNextBtn) weekNextBtn.addEventListener("click", async () => {
    if (!weeksIndex.length) return;
    if (currentIndex > 0) {
      await gotoIndex(currentIndex - 1);
    } else {
      // already at latest
    }
  });

  function renderMenuInitial() {
    // Convenient public render call
    renderMenu();
  }

  // initial render call (menu data already loaded above)
  renderMenuInitial();

