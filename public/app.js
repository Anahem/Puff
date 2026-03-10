// Auto-focus bulk input when its <details> opens
document.querySelectorAll('.bulk-joints').forEach(details => {
  details.addEventListener('toggle', () => {
    if (details.open) {
      const input = details.querySelector('.bulk-input');
      if (input) input.focus();
    }
  });
});

// Auto-focus add member input when its <details> opens
const addMemberDetails = document.querySelector('.add-member-details');
if (addMemberDetails) {
  addMemberDetails.addEventListener('toggle', () => {
    if (addMemberDetails.open) {
      const input = addMemberDetails.querySelector('input[name="memberName"]');
      if (input) input.focus();
    }
  });
}

// Custom styled member dropdown
(function () {
  const input    = document.getElementById('member-name-input');
  const dropdown = document.getElementById('member-dropdown');
  if (!input || !dropdown) return;

  const items = Array.from(dropdown.querySelectorAll('.member-dropdown-item'));

  function filter(query) {
    const q = query.trim().toLowerCase();
    let visible = 0;
    items.forEach(item => {
      const match = !q || item.dataset.value.toLowerCase().includes(q);
      item.hidden = !match;
      if (match) visible++;
    });
    dropdown.classList.toggle('open', visible > 0);
  }

  // Show full list on focus
  input.addEventListener('focus', () => filter(input.value));

  // Filter as user types
  input.addEventListener('input', () => filter(input.value));

  // Pick item — use mousedown so it fires before blur
  dropdown.addEventListener('mousedown', e => {
    const item = e.target.closest('.member-dropdown-item');
    if (!item) return;
    e.preventDefault();
    input.value = item.dataset.value;
    dropdown.classList.remove('open');
    input.focus();
  });

  // Close when focus leaves the input
  input.addEventListener('blur', () => {
    setTimeout(() => dropdown.classList.remove('open'), 150);
  });
})();

// Close any open bulk-joints or socialise panel when clicking outside it
document.addEventListener('click', (e) => {
  document.querySelectorAll('.bulk-joints[open], .socialise-details[open]').forEach(details => {
    if (!details.contains(e.target)) {
      details.removeAttribute('open');
    }
  });
});

// Guest balance socialise — live percentage total + equal-split on open
document.querySelectorAll('.socialise-details').forEach(details => {
  const form    = details.querySelector('.socialise-form');
  if (!form) return;

  const inputs  = Array.from(form.querySelectorAll('.socialise-pct-input'));
  const totalEl = form.querySelector('.socialise-total');

  function calcTotal() {
    return inputs.reduce((sum, inp) => sum + (parseFloat(inp.value) || 0), 0);
  }

  function updateTotal() {
    const sum = Math.round(calcTotal() * 10) / 10;
    totalEl.textContent = sum + '%';
    const ok = Math.abs(sum - 100) < 0.5;
    totalEl.classList.toggle('ok',  ok);
    totalEl.classList.toggle('bad', !ok);
  }

  // Equal-split on open
  details.addEventListener('toggle', () => {
    if (!details.open) return;
    const n = inputs.length;
    if (n === 0) return;
    const base = parseFloat((100 / n).toFixed(1));
    let given = 0;
    inputs.forEach((inp, i) => {
      if (i < n - 1) {
        inp.value = base;
        given = parseFloat((given + base).toFixed(1));
      } else {
        inp.value = parseFloat((100 - given).toFixed(1));
      }
    });
    updateTotal();
  });

  // Live update as values change
  inputs.forEach(inp => inp.addEventListener('input', updateTotal));

  // Block submit if total ≠ 100
  form.addEventListener('submit', e => {
    if (Math.abs(calcTotal() - 100) >= 0.5) {
      e.preventDefault();
      totalEl.classList.add('bad');
      totalEl.classList.remove('ok');
      inputs[0] && inputs[0].focus();
    }
  });
});
