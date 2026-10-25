// HinH Parts Lookup: parts-controller.js
// The story: As Trent the Technician, I want to see only the parts at or under the price
// the customer gave me, so I can offer a repair they'll say yes to.

function bindControls() {
  document.getElementById('search-button').addEventListener('click', () => showParts());
  document.getElementById('part-number').addEventListener('keydown', e => { if (e.key === 'Enter') showParts(); });
  document.getElementById('max-price').addEventListener('input', () => showParts());
}

// Shows the parts that match the search and cost no more than the max price, if one was given.
function showParts() {
  const query = document.getElementById('part-number').value.trim().toUpperCase();
  const maxPrice = document.getElementById('max-price').value.trim();
  let shown = 0;
  document.querySelectorAll('.catalog-part').forEach(card => {
    const price = card.dataset.price;
    const matches = card.dataset.part.startsWith(query);
    const affordable = maxPrice === '' || price <= maxPrice;
    // Observation goes here.
    card.hidden = !(matches && affordable);
    if (!card.hidden) shown++;
  });
  const none = document.getElementById('no-results');
  none.hidden = shown > 0;
  none.textContent = shown ? '' : `No parts match "${query}" at or under $${maxPrice}.`;
}

bindControls();
