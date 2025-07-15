// context-menu.js (v2) – injects UI into #info-pane instead of drawer
(function () {
  function waitForPane(cb) {
    const interval = setInterval(() => {
      const pane = document.getElementById('info-pane');
      if (pane) {
        clearInterval(interval);
        cb(pane);
      }
    }, 300);
  }

  function initContextSection(pane) {
    // create container
    const section = document.createElement('section');
    section.id = 'context-section';
    section.style.marginTop = '24px';
    section.innerHTML = `
      <h3 style="margin-bottom:12px;font-size:1.4rem;font-weight:600;color:#23272f;">context suggestions</h3>
      <div id="ctx-content"></div>
      <button id="context-add-btn" style="margin-top:12px;padding:10px 16px;border:none;background:#4285f4;color:#fff;border-radius:6px;cursor:pointer;font-weight:600;">add selected</button>
    `;
    pane.appendChild(section);

    const contentDiv = section.querySelector('#ctx-content');
    const addBtn = section.querySelector('#context-add-btn');

    async function loadRecommendations() {
      if (!window.PAPER_ID) return;
      try {
        const res = await fetch(`/api/recommendations/${window.PAPER_ID}`);
        const data = await res.json();
        renderRecommendations(data);
      } catch (e) {
        console.error('[ERROR] >>> failed to fetch recommendations', e);
      }
    }

    function renderRecommendations(list) {
      contentDiv.innerHTML = '';
      list.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'context-item';
        row.style.display = 'flex';
        row.style.alignItems = 'flex-start';
        row.style.marginBottom = '14px';

        // prepare placeholder (will be replaced by fetched title)
        const placeholder = 'loading…';

        row.innerHTML = `
          <input type="checkbox" id="ctx-${idx}" style="margin-top:4px;">
          <div style="flex:1;margin-left:8px;">
            <div class="ctx-title" style="font-size:0.95rem;font-weight:500;">${placeholder}</div>
          </div>
          <span style="font-size:0.8rem;color:#666;margin-left:6px;">${item.score.toFixed(2)}</span>
        `;
        row.dataset.meta = JSON.stringify(item);
        contentDiv.appendChild(row);

        // asynchronously fetch title for each recommendation
        fetch(`/api/get_title?source=${encodeURIComponent(item.source)}&url=${encodeURIComponent(item.url)}`)
          .then(r => r.json())
          .then(data => {
            if(data && data.title){
              row.querySelector('.ctx-title').textContent = data.title;
            } else {
              row.querySelector('.ctx-title').textContent = item.title;
            }
          })
          .catch(()=>{
            row.querySelector('.ctx-title').textContent = item.title;
          });
      });
    }

    addBtn.addEventListener('click', async () => {
      const selected = Array.from(contentDiv.querySelectorAll('input:checked')).map((cb) => {
        const meta = JSON.parse(cb.parentElement.dataset.meta);
        return meta;
      });
      if (!selected.length) {
        alert('select at least one');
        return;
      }
      try {
        const res = await fetch('/api/context/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: selected }),
        });
        const data = await res.json();
        alert(`added ${data.added} items to context`);
      } catch (e) {
        alert('failed adding context');
      }
    });

    loadRecommendations();
  }

  waitForPane(initContextSection);
})(); 