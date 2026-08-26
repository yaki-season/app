const CUSTOMERS = Object.freeze([
  { id: 'developer-a', name: 'Developer A', assignment: 'OFFICE-A' },
  { id: 'developer-b', name: 'Developer B', assignment: 'OFFICE-B' },
  { id: 'young-man-delivery', name: '젊은 배달원', assignment: 'COMMUTER-A' },
  { id: 'stocky-middle-aged-man', name: '체격 있는 중년 남성', assignment: 'COMMUTER-B' },
  { id: 'middle-aged-woman', name: '중년 여성', assignment: 'SOLO' },
]);

const STATE_LABELS = Object.freeze({
  waiting: '대기',
  'eating-negima': '꼬치 먹는 중',
  'drinking-beer': '생맥주 마시는 중',
});

const grid = document.querySelector('#customer-grid');
let activeState = 'waiting';

function assetUrl(customer, state) {
  return `/assets/core/customer/in-game-mapping/${customer.id}-${state}-r9-b1.png`;
}

function render() {
  grid.replaceChildren(...CUSTOMERS.map((customer) => {
    const card = document.createElement('article');
    card.className = 'customer-card';
    card.dataset.customerId = customer.id;
    card.innerHTML = `
      <div class="customer-viewport">
        <img src="${assetUrl(customer, activeState)}" alt="${customer.name} ${STATE_LABELS[activeState]}">
      </div>
      <footer>
        <h2>${customer.name}</h2>
        <p>${customer.assignment} · ${STATE_LABELS[activeState]}</p>
      </footer>`;
    return card;
  }));
  document.body.dataset.customerState = activeState;
}

document.querySelectorAll('[data-state]').forEach((button) => {
  button.addEventListener('click', () => {
    activeState = button.dataset.state;
    document.querySelectorAll('[data-state]').forEach((candidate) => {
      candidate.classList.toggle('active', candidate === button);
    });
    render();
  });
});

render();
