// HinH Parts Lookup: parts-controller.js
// Connects the controls on the parts page to what they do.

function bindControls() {
  document.getElementById('search-button').addEventListener('click', showParts);
  document.getElementById('part-number').addEventListener('keydown', e => { if (e.key === 'Enter') showParts(); });
  document.getElementById('in-stock-only').addEventListener('change', showParts);
}

// Shows the parts that match the search, and only in-stock ones if that box is ticked.
function showParts() {
  const query = document.getElementById('part-number').value.trim().toUpperCase();
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
