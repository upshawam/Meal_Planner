// Only one rebuild button, notepad header row with copy button, portion select below description, three-high stack grid
(async function() {
  let data;
  let allMeals = [];
  let currentWeek = 46;
  let currentYear = 2025;
  let availableWeeks = [];
  let unitConversions = {};
  let spiceBlends = {};
  let isSearchActive = false;
  let searchResults = [];

  async function loadWeekData(weekNum) {
    try {
      const weekFile = `./weeks/2025-W${String(weekNum).padStart(2, '0')}.json`;
      const res = await fetch(weekFile, { cache: "no-store" });
      if (!res.ok) throw new Error(`Week ${weekNum} not found`);
      const weekData = await res.json();
      data = weekData;
      const totalMeals = (weekData.meals || []).length;
      // Filter out add-on items that don't have PDFs (not actual recipes)
      const mealsWithoutPdf = (weekData.meals || []).filter(m => !m.pdf || typeof m.pdf !== "string" || !m.pdf.trim());
      allMeals = (weekData.meals || []).filter(m => m.pdf && typeof m.pdf === "string" && m.pdf.trim());
      
      // Console warnings for filtered recipes
      if (mealsWithoutPdf.length > 0) {
        console.warn(`⚠️ Week ${weekNum}: ${mealsWithoutPdf.length} recipe(s) filtered out (no PDF):`);
        mealsWithoutPdf.forEach(m => console.warn(`  - "${m.title || 'Unknown'}"`));
        console.warn(`Total meals in data: ${totalMeals}, Showing: ${allMeals.length}`);
      }
      
      currentWeek = weekData.week || weekNum;
      currentYear = weekData.year || 2025;
      const weekDisplay = document.getElementById("current-week-display");
      if (weekDisplay) weekDisplay.textContent = currentWeek;
      
      // Clear search when changing weeks manually
      isSearchActive = false;
      searchResults = [];
      const searchBar = document.getElementById("search-bar");
      const clearSearchBtn = document.getElementById("clear-search-btn");
      if (searchBar) searchBar.value = "";
      if (clearSearchBtn) clearSearchBtn.style.display = "none";
      
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

  async function loadUnitConversions() {
    try {
      const res = await fetch("./unit_conversions.json", { cache: "no-store" });
      if (res.ok) {
        unitConversions = await res.json();
      }
    } catch (err) {
      console.warn("Could not load unit conversions", err);
      unitConversions = {}; // Fallback to empty object
    }
  }

  async function loadSpiceBlends() {
    try {
      const res = await fetch("./spice_blends.json", { cache: "no-store" });
      if (res.ok) {
        spiceBlends = await res.json();
      }
    } catch (err) {
      console.warn("Could not load spice blends", err);
      spiceBlends = {}; // Fallback to empty object
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

  // Load weeks index, unit conversions, spice blends, and initial week
  await Promise.all([loadWeeksIndex(), loadUnitConversions(), loadSpiceBlends()]);
  
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
      const totalMeals = (data.meals || []).length;
      // Filter out add-on items that don't have PDFs (not actual recipes)
      const mealsWithoutPdf = (data.meals || []).filter(m => !m.pdf || typeof m.pdf !== "string" || !m.pdf.trim());
      allMeals = (data.meals || []).filter(m => m.pdf && typeof m.pdf === "string" && m.pdf.trim());
      
      // Console warnings for filtered recipes
      if (mealsWithoutPdf.length > 0) {
        console.warn(`⚠️ Fallback data: ${mealsWithoutPdf.length} recipe(s) filtered out (no PDF):`);
        mealsWithoutPdf.forEach(m => console.warn(`  - "${m.title || 'Unknown'}"`));
        console.warn(`Total meals in data: ${totalMeals}, Showing: ${allMeals.length}`);
      }
      
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
    
    // If search is active, don't render the normal menu
    if (isSearchActive) {
      return;
    }
    
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
    
    // Get meals from search results or regular display meals
    const mealsToSearch = isSearchActive 
      ? searchResults.map(r => r.meal)
      : getDisplayMeals();
    
    currentChosen = chosenIds.map(id => {
      const m = mealsToSearch.find((mm, idx) => mealIdFor(mm, idx) === id);
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

  function findSpiceBlend(ingredientName) {
    if (!ingredientName || !spiceBlends) return null;
    
    // Try exact match first
    if (spiceBlends[ingredientName]) {
      return spiceBlends[ingredientName];
    }
    
    // Try case-insensitive match
    const lowerName = ingredientName.toLowerCase();
    for (const [blendName, recipe] of Object.entries(spiceBlends)) {
      if (blendName.toLowerCase() === lowerName) {
        return recipe;
      }
    }
    
    // Try partial match (e.g., "Southwest Spice" matches "Southwest Spice Blend")
    for (const [blendName, recipe] of Object.entries(spiceBlends)) {
      if (blendName.toLowerCase().includes(lowerName) || lowerName.includes(blendName.toLowerCase())) {
        return recipe;
      }
    }
    
    return null;
  }

  function showSpiceBlendModal(blendName, recipe) {
    const modalOverlay = document.createElement("div");
    modalOverlay.className = "spice-blend-modal-overlay";
    modalOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;
    
    const modalContent = document.createElement("div");
    modalContent.className = "spice-blend-modal-content";
    modalContent.style.cssText = `
      background: #fff;
      padding: 30px;
      border-radius: 8px;
      max-width: 500px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `;
    
    const title = document.createElement("h2");
    title.textContent = blendName;
    title.style.cssText = `
      margin: 0 0 20px 0;
      color: #cd596b;
      font-size: 24px;
    `;
    
    const subtitle = document.createElement("p");
    subtitle.textContent = "Make your own with:";
    subtitle.style.cssText = `
      margin: 0 0 15px 0;
      color: #666;
      font-style: italic;
    `;
    
    const list = document.createElement("ul");
    list.style.cssText = `
      list-style: disc;
      padding-left: 25px;
      line-height: 1.8;
    `;
    
    recipe.forEach(ingredient => {
      const li = document.createElement("li");
      li.textContent = ingredient;
      list.appendChild(li);
    });
    
    const note = document.createElement("p");
    note.textContent = '"Parts" means you can use any equal measurement (e.g., 1 part = 1 tsp).';
    note.style.cssText = `
      margin: 20px 0 15px 0;
      padding: 10px;
      background: #f8f0e3;
      border-radius: 4px;
      font-size: 14px;
      color: #666;
    `;
    
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.style.cssText = `
      margin-top: 20px;
      padding: 10px 24px;
      background: #cd596b;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
    `;
    closeBtn.addEventListener("click", () => document.body.removeChild(modalOverlay));
    
    modalContent.appendChild(title);
    modalContent.appendChild(subtitle);
    modalContent.appendChild(list);
    
    // Only show the "parts" note if the recipe uses "parts"
    if (recipe.some(ing => ing.toLowerCase().includes("part"))) {
      modalContent.appendChild(note);
    }
    
    modalContent.appendChild(closeBtn);
    modalOverlay.appendChild(modalContent);
    
    // Close on overlay click
    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) {
        document.body.removeChild(modalOverlay);
      }
    });
    
    // Close on Escape key
    const escapeHandler = (e) => {
      if (e.key === "Escape" && document.body.contains(modalOverlay)) {
        document.body.removeChild(modalOverlay);
        document.removeEventListener("keydown", escapeHandler);
      }
    };
    document.addEventListener("keydown", escapeHandler);
    
    document.body.appendChild(modalOverlay);
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
        
        // Convert "unit" to specific measurement if available
        if (copy.unit && copy.unit.toLowerCase() === "unit" && copy.ingredient) {
          const ingredientKey = copy.ingredient.toLowerCase();
          const conversion = unitConversions[ingredientKey];
          if (conversion) {
            if (copy.quantity != null) {
              copy.quantity = copy.quantity * conversion.quantity * (portion / 2);
            } else {
              copy.quantity = conversion.quantity * (portion / 2);
            }
            copy.unit = conversion.unit;
            copy.quantity_display = (copy.quantity % 1 === 0) ? String(copy.quantity) : copy.quantity.toFixed(2);
          } else {
            // Keep "unit" if no conversion available
            if (copy.quantity != null) {
              copy.quantity = copy.quantity * (portion / 2);
              copy.quantity_display = (copy.quantity % 1 === 0) ? String(copy.quantity) : copy.quantity.toFixed(2);
            }
          }
        } else if (copy.quantity != null) {
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
        const textContent = `${qty} ${ing.unit || ""} ${ing.ingredient}`.trim();
        
        // Check if this ingredient is a spice blend
        const spiceRecipe = findSpiceBlend(ing.ingredient);
        if (spiceRecipe) {
          // Create clickable link for spice blends
          const span = document.createElement("span");
          span.textContent = textContent;
          span.className = "spice-blend-link";
          span.title = "Click to see recipe";
          span.style.cursor = "pointer";
          span.style.color = "#cd596b";
          span.style.textDecoration = "underline";
          span.addEventListener("click", () => showSpiceBlendModal(ing.ingredient, spiceRecipe));
          li.appendChild(span);
        } else {
          li.textContent = textContent;
        }
        
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
  if (clearBtnInline) {
    clearBtnInline.addEventListener("click", function() {
      selected = new Set();
      locked = false;
      isMenuVisible = true;
      currentChosen = [];
      
      // Show menu, hide selected div
      if (menu) menu.classList.remove("hidden");
      if (selectedDiv) selectedDiv.innerHTML = "";
      
      updateTopControls();
      
      // If search is active, re-render search results; otherwise render normal menu
      if (isSearchActive) {
        renderSearchResults();
      } else {
        renderMenu();
      }
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

  // Search functionality
  const searchBar = document.getElementById("search-bar");
  const clearSearchBtn = document.getElementById("clear-search-btn");

  async function searchAllWeeks(query) {
    if (!query || query.trim().length === 0) {
      isSearchActive = false;
      searchResults = [];
      clearSearchBtn.style.display = "none";
      await loadWeekData(currentWeek);
      return;
    }

    isSearchActive = true;
    clearSearchBtn.style.display = "flex";
    searchResults = [];
    const lowerQuery = query.toLowerCase();

    // Search across all available weeks
    for (const weekNum of availableWeeks) {
      try {
        const weekFile = `./weeks/2025-W${String(weekNum).padStart(2, '0')}.json`;
        const res = await fetch(weekFile, { cache: "no-store" });
        if (!res.ok) continue;
        
        const weekData = await res.json();
        const meals = (weekData.meals || []).filter(m => m.pdf && typeof m.pdf === "string" && m.pdf.trim());
        
        for (const meal of meals) {
          // Search in title
          const titleMatch = (meal.title || "").toLowerCase().includes(lowerQuery);
          
          // Search in ingredients
          const ingredientMatch = (meal.ingredients || []).some(ing => 
            (ing.ingredient || "").toLowerCase().includes(lowerQuery)
          );
          
          if (titleMatch || ingredientMatch) {
            searchResults.push({
              meal: meal,
              week: weekNum,
              matchType: titleMatch ? 'title' : 'ingredient'
            });
          }
        }
      } catch (err) {
        console.warn(`Could not search week ${weekNum}:`, err);
      }
    }

    renderSearchResults();
  }

  function renderSearchResults() {
    const menu = document.getElementById("menu");
    if (!menu) return;

    menu.innerHTML = "";
    
    if (searchResults.length === 0) {
      const noResults = document.createElement("div");
      noResults.style.cssText = "grid-column: 1 / -1; text-align: center; padding: 40px; color: #6b7280; font-size: 1.1rem;";
      noResults.textContent = "No recipes found matching your search.";
      menu.appendChild(noResults);
      return;
    }

    // Render all results without grouping
    searchResults.forEach((result, idx) => {
      const card = createSearchResultCard(result.meal, idx, result.week);
      menu.appendChild(card);
    });
  }

  function createSearchResultCard(meal, idx, weekNum) {
    // Use the existing createCard function with showSelector enabled
    const card = createCard(meal, idx, { showSelector: true, recipePreview: false });
    
    // Add explicit styling to prevent stretching
    card.style.cssText = (card.style.cssText || "") + " flex: 0 0 280px; width: 280px; max-width: 280px;";
    
    return card;
  }

  if (searchBar) {
    let searchTimeout;
    searchBar.addEventListener("input", (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        searchAllWeeks(e.target.value);
      }, 300); // Debounce search by 300ms
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener("click", () => {
      if (searchBar) searchBar.value = "";
      isSearchActive = false;
      searchResults = [];
      clearSearchBtn.style.display = "none";
      loadWeekData(currentWeek);
    });
  }

  renderMenu();
  updateWeekNavButtons();
})();
