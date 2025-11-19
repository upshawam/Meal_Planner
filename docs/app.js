// Only one rebuild button, notepad header row with copy button, portion select below description, three-high stack grid
(async function() {
  let data;
  let allMeals = [];
  let currentWeek = 46;
  let currentYear = 2025;
  let availableWeeks = []; // Array of {year, week} objects
  let unitConversions = {};
  let spiceBlends = {};
  let ingredientCategories = {};
  let isSearchActive = false;
  let searchResults = [];
  let recipeTags = {}; // Recipe tags loaded from recipe_tags.json
  let activeFilters = {
    cuisine: new Set(),
    protein: new Set(),
    meal_type: new Set(),
    dietary: new Set()
  };

  // Function to calculate the current ISO week number
  function getCurrentISOWeek() {
    const today = new Date();
    const d = new Date(today);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  // Calculate current week and year
  const today = new Date();
  const currentYearNow = today.getFullYear();
  const currentWeekNow = getCurrentISOWeek();
  currentWeek = currentWeekNow;
  currentYear = currentYearNow;

  async function loadWeekData(weekNum, yearNum = null) {
    try {
      // If year not provided, try to find it in availableWeeks or use currentYear
      const year = yearNum || availableWeeks.find(w => w.week === weekNum)?.year || currentYear;
      const weekFile = `./weeks/${year}-W${String(weekNum).padStart(2, '0')}.json`;
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
      currentYear = weekData.year || year;
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
        // Store full {year, week} objects, sorted by year then week (newest first)
        availableWeeks = index.sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year;
          return b.week - a.week;
        });
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

  async function loadIngredientCategories() {
    try {
      const res = await fetch("./ingredient_categories.json", { cache: "no-store" });
      if (res.ok) {
        ingredientCategories = await res.json();
      }
    } catch (err) {
      console.warn("Could not load ingredient categories", err);
      ingredientCategories = {}; // Fallback to empty object
    }
  }

  async function loadRecipeTags() {
    try {
      const res = await fetch("./recipe_tags.json", { cache: "no-store" });
      if (res.ok) {
        recipeTags = await res.json();
        initializeFilters();
      }
    } catch (err) {
      console.warn("Could not load recipe tags", err);
      recipeTags = {}; // Fallback to empty object
    }
  }

  function initializeFilters() {
    // Collect all unique tags and their counts
    const tagCounts = {
      cuisine: {},
      protein: {},
      meal_type: {},
      dietary: {}
    };

    Object.values(recipeTags).forEach(tags => {
      Object.keys(tagCounts).forEach(category => {
        const categoryTags = tags[category] || [];
        categoryTags.forEach(tag => {
          tagCounts[category][tag] = (tagCounts[category][tag] || 0) + 1;
        });
      });
    });

    // Render filter checkboxes
    renderFilterSection('cuisine', tagCounts.cuisine, 'cuisine-filters');
    renderFilterSection('protein', tagCounts.protein, 'protein-filters');
    renderFilterSection('meal_type', tagCounts.meal_type, 'meal-type-filters');
    renderFilterSection('dietary', tagCounts.dietary, 'dietary-filters');

    // Setup clear filters buttons (top and bottom)
    const clearFiltersBtnTop = document.getElementById('clear-filters-btn-top');
    const clearFiltersBtn = document.getElementById('clear-filters-btn');

    const clearFilters = async () => {
      // Clear all active filters
      Object.keys(activeFilters).forEach(category => {
        activeFilters[category].clear();
      });
      // Uncheck all checkboxes
      document.querySelectorAll('.filter-option input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
        cb.closest('.filter-option').classList.remove('active');
      });
      // Re-render current view
      if (isSearchActive) {
        await renderSearchResults();
      } else {
        await renderMenu();
      }
    };

    if (clearFiltersBtnTop) {
      clearFiltersBtnTop.addEventListener('click', clearFilters);
    }

    if (clearFiltersBtn) {
      clearFiltersBtn.addEventListener('click', clearFilters);
    }
  }

  function renderFilterSection(category, tagCounts, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    // Sort tags by count (descending) then alphabetically
    const sortedTags = Object.entries(tagCounts).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });

    sortedTags.forEach(([tag, count]) => {
      const option = document.createElement('div');
      option.className = 'filter-option';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `filter-${category}-${tag.replace(/\s+/g, '-')}`;
      checkbox.value = tag;

      const label = document.createElement('label');
      label.htmlFor = checkbox.id;
      label.innerHTML = `<span>${tag}</span><span class="filter-count">${count}</span>`;

      checkbox.addEventListener('change', async (e) => {
        if (e.target.checked) {
          activeFilters[category].add(tag);
          option.classList.add('active');
        } else {
          activeFilters[category].delete(tag);
          option.classList.remove('active');
        }
        // Re-render current view with filters
        if (isSearchActive) {
          await renderSearchResults();
        } else {
          await renderMenu();
        }
      });

      option.appendChild(checkbox);
      option.appendChild(label);
      container.appendChild(option);
    });
  }

  async function filterMeals(meals) {
    // Check if any filters are active
    const hasActiveFilters = Object.values(activeFilters).some(set => set.size > 0);
    if (!hasActiveFilters) return meals;

    // If filters are active, search across ALL weeks
    const allWeekMeals = [];
    for (const weekObj of availableWeeks) {
      try {
        const weekFile = `./weeks/${weekObj.year}-W${String(weekObj.week).padStart(2, '0')}.json`;
        const res = await fetch(weekFile, { cache: "no-store" });
        if (!res.ok) continue;

        const weekData = await res.json();
        const mealsWithPdf = (weekData.meals || []).filter(m => m.pdf && typeof m.pdf === "string" && m.pdf.trim());
        allWeekMeals.push(...mealsWithPdf);
      } catch (err) {
        console.warn(`Could not load week ${weekObj.week} for filtering:`, err);
      }
    }

    // Deduplicate by meal URL
    const uniqueMeals = [];
    const seenUrls = new Set();
    for (const meal of allWeekMeals) {
      if (!seenUrls.has(meal.url)) {
        seenUrls.add(meal.url);
        uniqueMeals.push(meal);
      }
    }

    // Filter by active tags
    return uniqueMeals.filter(meal => {
      const mealId = meal.url;
      const tags = recipeTags[mealId];
      if (!tags) return false;

      // Check each filter category (AND logic between categories, OR logic within)
      for (const [category, selectedTags] of Object.entries(activeFilters)) {
        if (selectedTags.size === 0) continue; // Skip empty categories

        const mealTags = tags[category] || [];
        const hasMatch = Array.from(selectedTags).some(selectedTag => 
          mealTags.includes(selectedTag)
        );

        if (!hasMatch) return false; // Meal doesn't match this category
      }

      return true; // Meal matches all active filter categories
    });
  }

  function updateWeekNavButtons() {
    const prevBtn = document.getElementById("prev-week-btn");
    const nextBtn = document.getElementById("next-week-btn");
    if (!prevBtn || !nextBtn) return;
    
    const currentIdx = availableWeeks.findIndex(w => w.year === currentYear && w.week === currentWeek);
    // Array is sorted newest-first
    prevBtn.disabled = currentIdx >= availableWeeks.length - 1; // Can't go older than last
    nextBtn.disabled = currentIdx <= 0; // Can't go newer than first
  }

  // Load weeks index, unit conversions, spice blends, ingredient categories, recipe tags, and initial week
  await Promise.all([loadWeeksIndex(), loadUnitConversions(), loadSpiceBlends(), loadIngredientCategories(), loadRecipeTags()]);
  
  // Try to load current week (based on today's date), fallback to newest week, then fallback to week_with_pdfs.json
  let loaded = false;
  if (availableWeeks.length > 0) {
    // Try to find current week in available weeks
    const currentWeekData = availableWeeks.find(w => w.year === currentYearNow && w.week === currentWeekNow);
    if (currentWeekData) {
      loaded = await loadWeekData(currentWeekData.week, currentWeekData.year);
    } else {
      // Fall back to newest week if current week not available
      const latestWeek = availableWeeks[0]; // Already sorted newest first
      loaded = await loadWeekData(latestWeek.week, latestWeek.year);
    }
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
      
      currentWeek = currentWeekNow;
      currentYear = currentYearNow;
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

  // Normalize text for ingredient categorization (lowercase, strip accents)
  function normalizeIngredient(text) {
    if (!text) return "";
    // Normalize unicode and remove accent marks
    let normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, "");
    return normalized.toLowerCase().trim();
  }

  // Categorize an ingredient based on keyword matching
  function categorizeIngredient(ingredientName) {
    const normalized = normalizeIngredient(ingredientName);
    
    // Check if it's a known spice blend first
    if (findSpiceBlend(ingredientName)) {
      return "Spices";
    }
    
    // Map category keys to display names (perimeter-first shopping order)
    const categoryMap = {
      "produce": "Produce",
      "meat": "Meat", 
      "dairy": "Dairy",
      "bakery": "Bakery",
      "dry_goods": "Pantry",
      "condiments": "Condiments",
      "spices": "Spices",
      "packaged": "Pantry",
      "snacks": "Pantry"
    };
    
    // Priority order for categories (check specific categories first to avoid false matches)
    const categoryPriority = [
      "spices",      // Check spices first (garlic powder, not garlic)
      "bakery",      // Check bakery (potato buns, not potato)
      "dry_goods",   // Check pantry items (agnolotti, tortelloni)
      "condiments",
      "dairy",
      "meat",
      "packaged",
      "produce",     // Check produce last (most generic matches)
      "snacks"
    ];
    
    // Try to match against each category in priority order
    for (const catKey of categoryPriority) {
      const keywords = ingredientCategories[catKey];
      if (!Array.isArray(keywords)) continue;
      
      for (const keyword of keywords) {
        const normalizedKeyword = normalizeIngredient(keyword);
        if (normalized.includes(normalizedKeyword)) {
          return categoryMap[catKey] || "Other";
        }
      }
    }
    
    return "Other";
  }

  safeHideModal();

  function mealIdFor(meal, idx) {
    return (meal && meal.url) ? meal.url : String(idx);
  }

  let filterPdfOnly = false;
  let selected = new Set(); // Current view selections
  let cart = new Map(); // Persistent cart: id -> meal object
  let locked = false;
  let isMenuVisible = true;
  const portions = {};
  let currentChosen = [];

  async function getDisplayMeals() {
    if (!allMeals) return [];
    
    // Check if any filters are active
    const hasActiveFilters = Object.values(activeFilters).some(set => set.size > 0);
    
    if (hasActiveFilters) {
      // If filters active, get meals from all weeks
      return await filterMeals([]);
    }
    
    // No filters: show current week meals
    let meals = allMeals;
    if (filterPdfOnly)
      meals = meals.filter(m => m.pdf && typeof m.pdf === "string" && m.pdf.trim());
    
    return meals;
  }

  function updateTopControls() {
    const count = cart.size;
    if (topCount) topCount.textContent = `${count} selected`;
    if (!topNext) return;
    if (isMenuVisible) {
      topNext.style.display = ""; // Restore button visibility when on menu
      topNext.disabled = count === 0;
      topNext.textContent = "View Cart";
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

    if (cart.has(id)) {
      card.classList.add("selected");
    }
    if (opts.showSelector !== false) {
      const selector = document.createElement("div");
      selector.className = "selector";
      selector.textContent = cart.has(id) ? "Selected" : "Select";
      card.appendChild(selector);
      
      // Add magnifying glass icon for PDF preview on selection cards
      if (meal.pdf && typeof meal.pdf === "string" && meal.pdf.trim()) {
        const previewIcon = document.createElement("div");
        previewIcon.className = "pdf-preview-icon";
        previewIcon.innerHTML = "🔍";
        previewIcon.title = "Quick preview";
        previewIcon.addEventListener("click", (e) => {
          e.stopPropagation();
          showPdfPreviewModal(meal.pdf, meal.title);
        });
        card.appendChild(previewIcon);
      }
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
        // Also remove from cart
        cart.delete(id);
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
      if (cart.has(id)) {
        cart.delete(id);
        card.classList.remove("selected");
        const sel = card.querySelector(".selector");
        if (sel) sel.textContent = "Select";
      } else {
        cart.set(id, meal);
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

  async function renderMenu() {
    if (!menu) return;
    
    // If search is active, don't render the normal menu
    if (isSearchActive) {
      return;
    }
    
    menu.innerHTML = "";
    const displayMeals = await getDisplayMeals();
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
    if (!cart.size) return;
    locked = true;
    isMenuVisible = false;
    // currentChosen = Array.from(cart.values()).map(meal => ({id: meal.url, meal}));
    currentChosen = Array.from(cart.entries()).map(([id, meal]) => ({id, meal}));
    
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

  async function backToSelection() {
    locked = false;
    isMenuVisible = true;
    await renderMenu();
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

  function showPdfPreviewModal(pdfUrl, title) {
    const modalOverlay = document.createElement("div");
    modalOverlay.className = "pdf-preview-modal-overlay";
    modalOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.85);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;
    
    const modalContent = document.createElement("div");
    modalContent.className = "pdf-preview-modal-content";
    modalContent.style.cssText = `
      background: #fff;
      padding: 20px;
      border-radius: 8px;
      max-width: 90vw;
      max-height: 90vh;
      overflow: auto;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      display: flex;
      flex-direction: column;
    `;
    
    const header = document.createElement("div");
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    `;
    
    const titleEl = document.createElement("h3");
    titleEl.textContent = title || "Recipe Preview";
    titleEl.style.cssText = `
      margin: 0;
      color: #cd596b;
      font-size: 20px;
    `;
    
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.style.cssText = `
      background: none;
      border: none;
      font-size: 32px;
      cursor: pointer;
      color: #666;
      line-height: 1;
      padding: 0;
      width: 32px;
      height: 32px;
    `;
    closeBtn.addEventListener("click", () => document.body.removeChild(modalOverlay));
    
    header.appendChild(titleEl);
    header.appendChild(closeBtn);
    
    const imageContainer = document.createElement("div");
    imageContainer.style.cssText = `
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 400px;
    `;
    
    const loadingMsg = document.createElement("p");
    loadingMsg.textContent = "Loading preview...";
    loadingMsg.style.cssText = "color: #666;";
    imageContainer.appendChild(loadingMsg);
    
    modalContent.appendChild(header);
    modalContent.appendChild(imageContainer);
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
    
    // Use iframe with #view=FitH to show full width without controls
    const iframe = document.createElement("iframe");
    iframe.src = pdfUrl + "#view=FitH&toolbar=0&navpanes=0&scrollbar=0";
    iframe.style.cssText = `
      width: 800px;
      height: 1000px;
      border: 1px solid #ddd;
      border-radius: 4px;
    `;
    
    imageContainer.innerHTML = "";
    imageContainer.appendChild(iframe);
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
            // Use conversion quantity as base, scaled by portion only
            // Don't multiply by copy.quantity since conversion.quantity already defines the amount per unit
            copy.quantity = conversion.quantity * (portion / 2);
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
      
      // Group ingredients by category
      const categoryGroups = {};
      Object.values(grouped).forEach(ing => {
        const category = categorizeIngredient(ing.ingredient);
        if (!categoryGroups[category]) {
          categoryGroups[category] = [];
        }
        categoryGroups[category].push(ing);
      });
      
      // Define category order (perimeter-first shopping)
      const categoryOrder = ["Produce", "Meat", "Dairy", "Bakery", "Pantry", "Condiments", "Spices", "Other"];
      
      // Render each category section
      categoryOrder.forEach(category => {
        if (!categoryGroups[category] || categoryGroups[category].length === 0) return;
        
        // Create category header
        const categoryHeader = document.createElement("li");
        categoryHeader.className = "grocery-category-header";
        categoryHeader.textContent = category.toUpperCase();
        ul.appendChild(categoryHeader);
        
        // Sort ingredients alphabetically within category
        categoryGroups[category].sort((a, b) => 
          (a.ingredient || "").localeCompare(b.ingredient || "")
        );
        
        // Add ingredients for this category
        categoryGroups[category].forEach(ing => {
          const qty = ing.quantity ? (Number.isInteger(ing.quantity) ? ing.quantity : ing.quantity.toFixed(2)) : (ing.quantity_display || "");
          const li = document.createElement("li");
          li.className = "grocery-item";
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
      });
      
      // Always use single column for categorized lists
      ul.classList.add("one-col");
    }
  }

  if (topNext) topNext.addEventListener("click", () => {
    if (isMenuVisible) nextHandler();
    else buildIngredients();
  });
  if (topBack) topBack.addEventListener("click", () => backToSelection());
  if (clearBtnInline) {
    clearBtnInline.addEventListener("click", async function() {
      cart = new Map();
      locked = false;
      isMenuVisible = true;
      currentChosen = [];
      
      // Show menu, hide selected div
      if (menu) menu.classList.remove("hidden");
      if (selectedDiv) selectedDiv.innerHTML = "";
      
      updateTopControls();
      
      // If search is active, re-render search results; otherwise render normal menu
      if (isSearchActive) {
        await renderSearchResults();
      } else {
        await renderMenu();
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
      const currentIdx = availableWeeks.findIndex(w => w.year === currentYear && w.week === currentWeek);
      // Array is sorted newest-first, so previous (older) is index+1
      if (currentIdx < availableWeeks.length - 1) {
        const prevWeek = availableWeeks[currentIdx + 1];
        await loadWeekData(prevWeek.week, prevWeek.year);
      }
    });
  }
  
  if (nextWeekBtn) {
    nextWeekBtn.addEventListener("click", async () => {
      const currentIdx = availableWeeks.findIndex(w => w.year === currentYear && w.week === currentWeek);
      // Array is sorted newest-first, so next (newer) is index-1
      if (currentIdx > 0) {
        const nextWeek = availableWeeks[currentIdx - 1];
        await loadWeekData(nextWeek.week, nextWeek.year);
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
      if (cart.size > 0) {
        nextHandler();
      } else {
        await loadWeekData(currentWeek, currentYear);
      }
      return;
    }

    isSearchActive = true;
    clearSearchBtn.style.display = "flex";
    searchResults = [];
    // Split query into terms and trim each one
    const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);

    // Search across all available weeks
    for (const weekObj of availableWeeks) {
      try {
        const weekFile = `./weeks/${weekObj.year}-W${String(weekObj.week).padStart(2, '0')}.json`;
        const res = await fetch(weekFile, { cache: "no-store" });
        if (!res.ok) continue;

        const weekData = await res.json();
        const meals = (weekData.meals || []).filter(m => m.pdf && typeof m.pdf === "string" && m.pdf.trim());

        for (const meal of meals) {
          // Check if any search term matches in title or ingredients
          const titleText = (meal.title || "").toLowerCase();
          const ingredientTexts = (meal.ingredients || []).map(ing => (ing.ingredient || "").toLowerCase());

          // Check if ALL search terms match (AND logic within title/ingredients)
          const titleMatch = searchTerms.every(term => titleText.includes(term));
          const ingredientMatch = searchTerms.every(term =>
            ingredientTexts.some(ingText => ingText.includes(term))
          );

          if (titleMatch || ingredientMatch) {
            searchResults.push({
              meal: meal,
              week: weekObj.week,
              year: weekObj.year,
              matchType: titleMatch ? 'title' : 'ingredient'
            });
          }
        }
      } catch (err) {
        console.warn(`Could not search week ${weekObj.week}:`, err);
      }
    }

    renderSearchResults();
  }

  async function renderSearchResults() {
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

    // Deduplicate by meal title (case-insensitive) - keep first occurrence
    const uniqueResults = [];
    const seenTitles = new Set();
    
    for (const result of searchResults) {
      const normalizedTitle = (result.meal.title || "").toLowerCase().trim();
      if (!seenTitles.has(normalizedTitle)) {
        seenTitles.add(normalizedTitle);
        uniqueResults.push(result);
      }
    }

    // Apply filters to results
    const filteredResults = await filterMeals(uniqueResults.map(r => r.meal));
    const filteredResultsWithWeek = uniqueResults.filter(r => filteredResults.includes(r.meal));
    
    if (filteredResultsWithWeek.length === 0) {
      const noResults = document.createElement("div");
      noResults.style.cssText = "grid-column: 1 / -1; text-align: center; padding: 40px; color: #6b7280; font-size: 1.1rem;";
      noResults.textContent = "No recipes match your search and filters.";
      menu.appendChild(noResults);
      return;
    }

    // Render filtered results
    filteredResultsWithWeek.forEach((result, idx) => {
      const card = createSearchResultCard(result.meal, idx, result.week);
      menu.appendChild(card);
    });

    // Show menu, hide cart view
    if (selectedDiv) selectedDiv.classList.add("hidden");
    if (menu) menu.classList.remove("hidden");
    isMenuVisible = true;
    locked = false;
    updateTopControls();
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
    clearSearchBtn.addEventListener("click", async () => {
      if (searchBar) searchBar.value = "";
      isSearchActive = false;
      searchResults = [];
      clearSearchBtn.style.display = "none";
      if (cart.size > 0) {
        nextHandler();
      } else {
        await loadWeekData(currentWeek);
      }
    });
  }

  await renderMenu();
  updateWeekNavButtons();
})();
