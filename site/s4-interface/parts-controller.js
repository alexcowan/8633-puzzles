// HinH Parts Lookup: parts-controller.js
// The story: As Trent the Technician, I want to see a part's price and whether I can
// get it today, so I can agree on next steps with the customer.

// ---------- The story's implementation ----------
async function showParts() {
  const query = document.getElementById('part-number').value.trim().toUpperCase();
  const results = document.getElementById('results');
  results.innerHTML = '';
  const matches = CATALOG.filter(part => part.number.startsWith(query));
  for (const part of matches) {
    const { price, inStock } = await getPriceAndAvailability(part.number);
    results.append(renderPart(part, price, inStock));
  }
  if (matches.length === 0) results.textContent = `No parts match "${query}".`;
}

// ---------- The interface ----------
// Above this line, the code asks for a price and availability by name and takes what it's given.
// Below it is the only code that knows where they come from.
const getPriceAndAvailability = fromCatalogCopy;   // <- this line changes based on the source above

// Write it: HinH's own copy of the catalog, loaded from the distributor's API once a night.
async function fromCatalogCopy(partNumber) {
  const row = HINH_CATALOG_COPY[partNumber];
  return { price: row.price, inStock: row.onHand > 0 };
}

// Call a service: the distributor's API, on every search.
async function fromDistributor(partNumber) {
  const data = await distributorApi.get('/parts/' + partNumber);
  return { price: data.list_price_usd, inStock: data.qty_on_hand > 0 };
}

// Ask an AI.
async function fromAI(partNumber) {
  const answer = await ai.ask(`Price and availability of HVAC part ${partNumber}? Reply as JSON: {"price": number, "inStock": true or false}`);
  return JSON.parse(answer);
}
