// HinH Parts Lookup: parts-controller.js
// The story: As Trent the Technician, I know the part number, and I want to find it in the
// system so I can figure out the next steps of the repair.

// The parts API. The dispatch system calls this same address.
const PARTS_API = 's5-cost/parts.json';
let catalog = [];

async function loadParts() {
  const response = await fetch(PARTS_API);
  catalog = await response.json();
  showParts();
}

function bindControls() {
  document.getElementById('search-button').addEventListener('click', () => showParts());
  document.getElementById('part-number').addEventListener('keydown', e => { if (e.key === 'Enter') showParts(); });
}

// Shows the parts whose number starts with what Trent typed.
function showParts() {
  const query = document.getElementById('part-number').value.trim().toUpperCase();
  const grid = document.getElementById('results');
  grid.innerHTML = '';
  for (const part of catalog.filter(p => p.part_number.startsWith(query))) {
    const card = document.createElement('div');
    card.className = 'catalog-part' + (part.in_stock ? '' : ' backordered');
    card.dataset.part = part.part_number;
    card.innerHTML = `
      <span class="num">${part.part_number}</span>
      <span class="name">${part.name}</span>
      <span class="price">$${part.price.toFixed(2)}</span>
      <span class="stock">${part.in_stock ? 'In stock' : 'Backordered'}</span>
      <span class="cost">Our cost: $${part.cost.toFixed(2)} from ${part.supplier}</span>`;
    grid.append(card);
  }
  const none = document.getElementById('no-results');
  none.hidden = grid.children.length > 0;
  none.textContent = grid.children.length ? '' : `No parts match "${query}".`;
}

bindControls();
loadParts();
