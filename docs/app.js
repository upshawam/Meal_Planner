// Minimal front-end logic for selectable recipe cards, details modal, Next behavior, and shopping list build.
// Integration notes:
// - The app expects an array of recipe objects. Example shape:
//   { id, title, description, link, thumbnail, ingredients: ["1 cup sugar", "2 eggs"] }
// - Replace fetchRecipes() with your actual server/scraper endpoint or inject the scraped results.

(() => {
  // Mocked example data — replace this with fetched scraped data.
  async function fetchRecipes() {
    // Example: return fetch('/api/recipes').then(r => r.json());
    return [
      { id: 'r1', title: 'Roast Chicken', description: 'Crispy roast chicken with herbs', link: 'https://example.com/roast-chicken', thumbnail:'', ingredients:['1 chicken','2 tsp salt','1 tbsp 
olive oil'] },
      { id: 'r2', title: 'Vegetable Stir-fry', description: 'Quick veggie stir-fry', link: 'https://example.com/stir-fry', thumbnail:'', ingredients:['1 bell pepper','2 cups broccoli','2 tbsp soy 
sauce'] },
      { id: 'r3', title: 'Pasta Pomodoro', description: 'Classic tomato pasta', link: 'https://example.com/pasta', thumbnail:'', ingredients:['200g pasta','2 cups tomato sauce','salt'] },
    ];
  }

  const menuGrid = document.getElementById('menu-grid');
  const nextButton = document.getElementById('next-button');
  const modal = document.getElementById('recipe-modal');
  const modalClose = document.getElementById('modal-close');
  const modalTitle = document.getElementById('modal-title');
  const modalDesc = document.getElementById('modal-description');
  const modalLink = document.getElementById('modal-link');
  const shoppingListEl = document.getElementById('shopping-list');
  const shoppingItems = document.getElementById('shopping-items');
  const downloadBtn = document.getElementById('download-list');

  let recipes = [];
  const selected = new Set();
  let afterNext = false;

  // Build a card element
  function buildCard(recipe) {
    const card = document.createElement('article');
    card.tabIndex = 0;
    card.className = 'card';
    card.dataset.id = recipe.id;

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    if (recipe.thumbnail) {
      const img = document.createElement('img');
      img.src = recipe.thumbnail;
      img.alt = recipe.title;
      img.className = 'thumb';
      thumb.replaceWith(img);
    }

    const meta = document.createElement('div');
    meta.className = 'meta';

    const title = document.createElement('h3');
    title.className = 'title';
    title.textContent = recipe.title;

    const desc = document.createElement('p');
    desc.className = 'desc';
    desc.textContent = recipe.description || '';

    const selector = document.createElement('div');
    selector.className = 'selector';
    selector.textContent = 'Select';

    meta.appendChild(title);
    meta.appendChild(desc);

    card.appendChild(thumb);
    card.appendChild(meta);
    card.appendChild(selector);

    // Click behavior:
    // - When Next not pressed: clicking toggles selection; double-click or 'details' open modal.
    // - After Next pressed: cards are the final cooking view, clicking opens PDF/recipe.
    card.addEventListener('click', (e) => {
      // If afterNext, open the recipe link (prefer PDF)
      if (afterNext) {
        openRecipeForCooking(recipe);
        return;
      }
      // Toggle selected state
      toggleSelect(recipe.id, card);
    });

    // Keyboard accessibility - Enter toggles selection; Space opens details
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (afterNext) openRecipeForCooking(recipe);
        else toggleSelect(recipe.id, card);
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        openDetailsModal(recipe);
      } else if (e.key === 'd' || e.key === 'D') {
        openDetailsModal(recipe);
      }
    });

    // Right-click or long-press can open details — for now doubleclick opens details
    card.addEventListener('dblclick', () => openDetailsModal(recipe));

    return card;
  }

  function toggleSelect(id, cardEl) {
    if (selected.has(id)) {
      selected.delete(id);
      cardEl.classList.remove('selected');
      cardEl.querySelector('.selector').textContent = 'Select';
    } else {
      selected.add(id);
      cardEl.classList.add('selected');
      cardEl.querySelector('.selector').textContent = 'Selected';
    }
    updateNextState();
  }

  function updateNextState() {
    nextButton.disabled = selected.size === 0;
  }

  function openDetailsModal(recipe) {
    modalTitle.textContent = recipe.title;
    modalDesc.textContent = recipe.description || 'No description available.';
    modalLink.href = recipe.link || '#';
    modalLink.textContent = recipe.link ? (isPdfLink(recipe.link) ? 'Open PDF' : 'Open recipe page') : 'No link';
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    modalClose.focus();
  }

  modalClose?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  function closeModal() {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }

  function isPdfLink(url) {
    return typeof url === 'string' && url.toLowerCase().endsWith('.pdf');
  }

  function openRecipeForCooking(recipe) {
    if (!recipe.link) {
      alert('No recipe link available.');
      return;
    }
    // If link is a PDF, open in new tab. If not, also open but you might want to point to a generated PDF.
    window.open(recipe.link, '_blank', 'noopener');
  }

  // When Next is clicked, remove non-selected cards and show shopping list
  nextButton.addEventListener('click', () => {
    if (selected.size === 0) return;
    afterNext = true;
    // Filter recipes to only selected
    recipes = recipes.filter(r => selected.has(r.id));
    renderCards();
    buildShoppingList();
    nextButton.disabled = true;
  });

  function buildShoppingList() {
    const items = {};
    recipes.forEach(r => {
      (r.ingredients || []).forEach(ing => {
        // Basic normalization: collapse exact duplicates; for better results parse ingredients
        const key = ing.trim().toLowerCase();
        items[key] = items[key] ? items[key] + 1 : 1;
      });
    });

    // Render shopping list
    shoppingItems.innerHTML = '';
    Object.keys(items).forEach(k => {
      const li = document.createElement('li');
      li.textContent = k;
      shoppingItems.appendChild(li);
    });
    shoppingListEl.classList.remove('hidden');
    shoppingListEl.setAttribute('aria-hidden', 'false');
  }

  downloadBtn.addEventListener('click', () => {
    const text = Array.from(shoppingItems.querySelectorAll('li')).map(li => '• ' + li.textContent).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shopping-list.txt';
    a.click();
    URL.revokeObjectURL(url);
  });

  // Render all cards
  function renderCards() {
    menuGrid.innerHTML = '';
    recipes.forEach(r => {
      const card = buildCard(r);
      if (selected.has(r.id)) card.classList.add('selected');
      menuGrid.appendChild(card);
    });
    updateNextState();
  }

  // Initialize
  (async function init() {
    recipes = await fetchRecipes();
    // If your scraper already includes a "selected" property or an "isPdf" flag, use them here.
    renderCards();
  })();

})();
