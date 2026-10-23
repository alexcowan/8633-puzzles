// HinH Parts Lookup: parts-controller.js
// Connects the controls on the parts page to what they do.

// The ids this code looks for in the page's HTML.
const CONTROLS = {
  searchButton: 'search-button',
  partNumber: 'part-number',
  inStockOnly: 'in-stock-only',
};

function bindControls() {
  const searchButton = document.getElementById(CONTROLS.searchButton);
  const partNumber = document.getElementById(CONTROLS.partNumber);
  const inStockOnly = document.getElementById(CONTROLS.inStockOnly);

  searchButton.addEventListener('click', showParts);
  partNumber.addEventListener('keydown', e => { if (e.key === 'Enter') showParts(); });
  inStockOnly.addEventListener('change', showParts);
}

// Shows the parts that match the search, and only in-stock ones if that box is ticked.
function showParts() {
  const query = document.getElementById(CONTROLS.partNumber).value.trim().toUpperCase();
  const onlyInStock = document.querySelector('.filters input').checked;
  let shown = 0;
  document.querySelectorAll('.catalog-part').forEach(card => {
    const matches = card.dataset.part.startsWith(query);
    const available = !card.classList.contains('backordered');
    card.hidden = !(matches && (available || !onlyInStock));
    if (!card.hidden) shown++;
  });
  const none = document.getElementById('no-results');
  none.hidden = shown > 0;
  none.textContent = shown ? '' : `No parts match "${query}".`;
}

bindControls();
