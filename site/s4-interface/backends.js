// The other side of the interface. HinH owns none of this, so it's simulated here.
// (Open this file if you're curious. Nothing in the puzzle asks you to change it.)

// What's on the distributor's shelf right now. The page's checks use this as the truth.
var SHELF = {
  'HX-2201':   { price: 184.00, inStock: true },
  'CP-0450':   { price: 22.50,  inStock: true },
  'CP-0450-L': { price: 31.00,  inStock: false },   // sold out this morning
  'TH-7710':   { price: 96.00,  inStock: true },
  'FL-1620':   { price: 14.25,  inStock: false },
  'IG-3300':   { price: 61.00,  inStock: true },
};

// The parts HinH knows about. Names only: price and availability come from a source.
var CATALOG = [
  { number: 'HX-2201',   name: 'Blower motor, 1/2 HP' },
  { number: 'CP-0450',   name: 'Run capacitor, 45 µF' },
  { number: 'CP-0450-L', name: 'Run capacitor, 45 µF, low-temp' },
  { number: 'TH-7710',   name: 'Thermostat, programmable' },
  { number: 'FL-1620',   name: 'Filter, 16×20 pleated' },
  { number: 'IG-3300',   name: 'Hot surface igniter' },
];

// Write it: HinH's own copy, loaded from last night's price sheet. It doesn't know about this morning.
var HINH_CATALOG_COPY = {
  'HX-2201':   { price: 184.00, onHand: 6 },
  'CP-0450':   { price: 22.50,  onHand: 14 },
  'CP-0450-L': { price: 31.00,  onHand: 2 },
  'TH-7710':   { price: 96.00,  onHand: 3 },
  'FL-1620':   { price: 14.25,  onHand: 0 },
  'IG-3300':   { price: 61.00,  onHand: 5 },
};

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function meter() { if (typeof window.onMeter === 'function') window.onMeter(); }

// Call a service: the distributor's API. Current, metered, and theirs to change.
var distributorApi = {
  version: 1,
  calls: 0,
  feePerCall: 0.02,
  async get(path) {
    this.calls++; meter();
    await wait(350);
    const number = path.split('/').pop();
    const s = SHELF[number];
    if (!s) throw new Error('404 Not Found: ' + path);
    if (this.version === 1) {
      return { part_number: number, list_price_usd: s.price, qty_on_hand: s.inStock ? 4 : 0 };
    }
    // v2: qty_on_hand is retired. Availability is a word.
    return { part_number: number, list_price_usd: s.price, availability: s.inStock ? 'IN_STOCK' : 'BACKORDERED' };
  },
};

// Ask a model. It always answers, and it's plausible.
var model = {
  calls: 0,
  async ask(prompt) {
    this.calls++; meter();
    await wait(700);
    const number = (prompt.match(/[A-Z]{2}-\d{4}(-L)?/) || [''])[0];
    const s = SHELF[number] || { price: 49.99, inStock: true };
    const k = this.calls;
    const price = +(s.price * [1, 0.97, 1.06, 0.92][k % 4]).toFixed(2);
    const inStock = (k % 3 === 2) ? !s.inStock : s.inStock;
    return JSON.stringify({ price, inStock });
  },
};

// Draws one part card. Part of the view; not part of the puzzle.
function renderPart(part, price, inStock) {
  const card = document.createElement('div');
  card.className = 'catalog-part' + (inStock === false ? ' backordered' : '');
  card.dataset.part = part.number;
  const priceText = (typeof price === 'number' && !Number.isNaN(price)) ? '$' + price.toFixed(2) : 'Price unknown';
  const stockText = inStock === true ? 'In stock' : inStock === false ? 'Backordered' : 'Availability unknown';
  card.innerHTML = '<span class="num"></span><span class="name"></span><span class="price"></span><span class="stock"></span>';
  card.querySelector('.num').textContent = part.number;
  card.querySelector('.name').textContent = part.name;
  card.querySelector('.price').textContent = priceText;
  card.querySelector('.stock').textContent = stockText;
  return card;
}
