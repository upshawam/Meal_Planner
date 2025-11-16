// Only one rebuild button, notepad header row with copy button, portion select below description, three-high stack grid
(async function() {
  let data;
  let allMeals = [];
  let currentWeek = 46;
  let currentYear = 2025;
  let availableWeeks = [];

  async function loadWeekData(weekNum) {
    try {
      const weekFile = `./weeks/2025-W${String(weekNum).padStart(2, '0')}.json`;
      const res = await fetch(weekFile, { cache: "no-store" });
      if (!res.ok) throw new Error(`Week ${weekNum} not found`);
      const weekData = await res.json();
      data = weekData;
      allMeals = weekData.meals || [];
      currentWeek = weekData.week || weekNum;
      currentYear = weekData.year || 2025;
      const weekDisplay = document.getElementById("current-week-display");
      if (weekDisplay) weekDisplay.textContent = currentWeek;
      
      // Reset selections when changing weeks
      selected = new Set();
      locked = false;
      isMenuVisible = true;
      currentChosen = [];
      
      renderMenu();
      updateWeekNavButtons();
      return true;
    } catch (err) {
      console.error(`Failed to load week ${weekNum}:`, err);
      return false;
    }
  }

  async function loadWeeksIndex() {
    try {
      const res = await fetch("./weeks_index.json", { cache: "no-store" });
      if (res.ok) {
        const index = await res.json();
        availableWeeks = index.map(w => w.week).sort((a, b) => a - b);
      }
    } catch (err) {
      console.warn("Could not load weeks index", err);
    }
  }

  function updateWeekNavButtons() {
    const prevBtn = document.getElementById("prev-week-btn");
    const nextBtn = document.getElementById("next-week-btn");
    if (!prevBtn || !nextBtn) return;
    
    const currentIdx = availableWeeks.indexOf(currentWeek);
    prevBtn.disabled = currentIdx <= 0;
    nextBtn.disabled = currentIdx >= availableWeeks.length - 1;
  }

  // Load weeks index and initial week
  await loadWeeksIndex();
  
  // Try to load from weeks archive first, fallback to week_with_pdfs.json
  let loaded = false;
  if (availableWeeks.length > 0) {
    const latestWeek = availableWeeks[availableWeeks.length - 1];
    loaded = await loadWeekData(latestWeek);
  }
  
  if (!loaded) {
    // Fallback to week_with_pdfs.json
    try {
      const res = await fetch("./week_with_pdfs.json", { cache: "no-store" });
      if (!res.ok) throw new Error("week_with_pdfs.json not found");
      data = await res.json();
      allMeals = data.meals || [];
      currentWeek = data.week || 46;
      currentYear = data.year || 2025;
      const weekDisplay = document.getElementById("current-week-display");
      if (weekDisplay) weekDisplay.textContent = currentWeek;
    } catch (err) {
      console.error("Failed to load any week data:", err);
      const menu = document.getElementById("menu");
      if (menu) menu.innerHTML = '<div style="grid-column:1/-1;color:#b91c1c;padding:12px">Error loading week data</div>';
      return;
    }
  }

  const menu = document.getElementById("menu");
  const topNext = document.getElementById("top-next");
  const topBack = document.getElementById("top-back");
  const topCount = document.getElementById("top-selected-count");
  const selectedDiv = document.getElementById("selected");
  const pdfToggle = document.getElementById("filter-pdf-toggle");
  const clearBtnInline = document.getElementById("clear-btn-inline");

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
      topNext.style.display = ""; // Restore button visibility when on menu
      topNext.disabled = count === 0;
      topNext.textContent = "Next";
    } else {
      // Hide the top Next button when viewing ingredients since rebuild is automatic
      topNext.style.display = "none";
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
      // Auto-update ingredients when portion changes
      select.addEventListener("change", () => {
        buildIngredients();
      });
      portionLabel.innerHTML = "Portions: ";
      portionLabel.appendChild(select);
      card.appendChild(portionLabel); // below subtitle, will never overlap
    }
    
    // Add View Recipe button for all preview cards
    if (opts.recipePreview) {
      const viewRecipeBtn = document.createElement("button");
      viewRecipeBtn.className = "view-recipe-btn";
      viewRecipeBtn.textContent = "View Recipe";
      viewRecipeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        // Prefer local PDF if available, otherwise use recipe URL
        const pdfUrl = meal.pdf || meal.url || "";
        if (pdfUrl) {
          window.open(pdfUrl, "_blank", "noopener");
        }
      });
      card.appendChild(viewRecipeBtn);

      // Add X button at top left to remove this card from selection
      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-card-btn";
      removeBtn.innerHTML = "×";
      removeBtn.title = "Remove this recipe";
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        // Remove from currentChosen array by matching the id
        currentChosen = currentChosen.filter(item => item.id !== id);
        // Also remove from selected set
        selected.delete(id);
        // Remove from portions tracking
        delete portions[id];
        // If no recipes left, go back to selection
        if (currentChosen.length === 0) {
          backToSelection();
        } else {
          // Re-render the ingredients page
          nextHandler();
        }
      });
      card.appendChild(removeBtn);
    }

    card.addEventListener("click", (e) => {
      if (locked) return;
      if (opts.recipePreview) return; // Don't allow selection on preview cards
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

    // Remove double-click modal behavior for all cards
    card.addEventListener("dblclick", (e) => {
      e.preventDefault();
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
        ${filterPdfOnly ? "No meals with PDF in week.json" : "No meals found in week.json"}
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
      
      // Portion title and rebuild button removed - ingredients auto-update on portion change

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

  // Week navigation
  const prevWeekBtn = document.getElementById("prev-week-btn");
  const nextWeekBtn = document.getElementById("next-week-btn");
  
  if (prevWeekBtn) {
    prevWeekBtn.addEventListener("click", async () => {
      const currentIdx = availableWeeks.indexOf(currentWeek);
      if (currentIdx > 0) {
        const prevWeek = availableWeeks[currentIdx - 1];
        await loadWeekData(prevWeek);
      }
    });
  }
  
  if (nextWeekBtn) {
    nextWeekBtn.addEventListener("click", async () => {
      const currentIdx = availableWeeks.indexOf(currentWeek);
      if (currentIdx < availableWeeks.length - 1) {
        const nextWeek = availableWeeks[currentIdx + 1];
        await loadWeekData(nextWeek);
      }
    });
  }

  renderMenu();
  updateWeekNavButtons();
})();
