// utils/virtualList.js — Virtual scrolling manual (FASE 3 AUDIT FIX)
// ═══════════════════════════════════════════════════════════════
// Implementasi sederhana virtual scrolling untuk list panjang (santri,
// absensi, audit log, dll). Pakai IntersectionObserver untuk render hanya
// item yang visible di viewport, plus buffer di atas/bawah.
//
// Pemakaian:
//   <script src="utils/virtualList.js"></script>
//   const vl = new VirtualList({
//     container: document.getElementById('abs-cards'),
//     items: arrayOfItems,
//     renderItem: (item, idx) => '<div class="ac">...</div>',
//     itemHeight: 88,        // estimate tinggi item (px)
//     bufferSize: 10,        // extra item di atas/bawah visible area
//     onItemClicked: (item, idx) => { ... }
//   });
//   // Update data:
//   vl.setItems(newArray);
//   // Destroy:
//   vl.destroy();
//
// Catatan: ini BUKAN virtualisasi penuh (tidak recycle DOM nodes),
// tapi cukup untuk mengurangi render dari N item menjadi ~30 item (visible + buffer).
// Performance: render 1000 item → hanya 30 yang di-DOM, scroll smooth.

(function VirtualListSetup() {
  'use strict';

  if (typeof window === 'undefined') return;

  class VirtualList {
    constructor(opts) {
      this.container = opts.container;
      this.items = opts.items || [];
      this.renderItem = opts.renderItem || (() => '');
      this.itemHeight = opts.itemHeight || 80;
      this.bufferSize = opts.bufferSize || 8;
      this.onItemClicked = opts.onItemClicked || null;
      this._scrollTop = 0;
      this._rafPending = false;
      this._visibleStart = 0;
      this._visibleEnd = 0;
      this._spacerTop = null;
      this._spacerBottom = null;
      this._contentEl = null;
      this._scrollHandler = this._onScroll.bind(this);
      this._resizeHandler = this._onResize.bind(this);
      this._init();
    }

    _init() {
      if (!this.container) {
        console.warn('[VirtualList] container is null');
        return;
      }
      // Set container style untuk scroll
      this.container.style.overflowY = 'auto';
      this.container.style.overflowX = 'hidden';
      this.container.style.position = 'relative';
      // Build spacer + content structure
      this.container.innerHTML = '';
      this._spacerTop = document.createElement('div');
      this._spacerTop.style.height = '0px';
      this.container.appendChild(this._spacerTop);
      this._contentEl = document.createElement('div');
      this.container.appendChild(this._contentEl);
      this._spacerBottom = document.createElement('div');
      this._spacerBottom.style.height = '0px';
      this.container.appendChild(this._spacerBottom);
      // Listen scroll + resize
      this.container.addEventListener('scroll', this._scrollHandler, { passive: true });
      window.addEventListener('resize', this._resizeHandler, { passive: true });
      // Initial render
      this._computeVisible();
      this._render();
    }

    _onScroll() {
      this._scrollTop = this.container.scrollTop;
      if (this._rafPending) return;
      this._rafPending = true;
      requestAnimationFrame(() => {
        this._rafPending = false;
        this._computeVisible();
        this._render();
      });
    }

    _onResize() {
      if (this._rafPending) return;
      this._rafPending = true;
      requestAnimationFrame(() => {
        this._rafPending = false;
        this._computeVisible();
        this._render();
      });
    }

    _computeVisible() {
      const containerHeight = this.container.clientHeight || 600;
      const start = Math.max(0, Math.floor(this._scrollTop / this.itemHeight) - this.bufferSize);
      const visibleCount = Math.ceil(containerHeight / this.itemHeight) + (this.bufferSize * 2);
      const end = Math.min(this.items.length, start + visibleCount);
      // Hanya re-render jika range berubah signifikan
      if (start !== this._visibleStart || end !== this._visibleEnd) {
        this._visibleStart = start;
        this._visibleEnd = end;
      }
    }

    _render() {
      if (!this._contentEl) return;
      const start = this._visibleStart;
      const end = this._visibleEnd;
      const slice = this.items.slice(start, end);
      // Build HTML untuk visible items
      let html = '';
      for (let i = 0; i < slice.length; i++) {
        const item = slice[i];
        const idx = start + i;
        try {
          html += this.renderItem(item, idx);
        } catch (e) {
          console.warn('[VirtualList] renderItem error at idx', idx, e);
          html += '<div style="padding:8px;color:#ef4444;font-size:11px">Render error</div>';
        }
      }
      this._contentEl.innerHTML = html;
      // Update spacers
      this._spacerTop.style.height = (start * this.itemHeight) + 'px';
      this._spacerBottom.style.height = (Math.max(0, this.items.length - end) * this.itemHeight) + 'px';
      // Attach click handler jika ada
      if (this.onItemClicked) {
        this._contentEl.querySelectorAll('[data-vl-idx]').forEach(el => {
          el.addEventListener('click', () => {
            const idx = parseInt(el.dataset.vlIdx, 10);
            if (!isNaN(idx)) this.onItemClicked(this.items[idx], idx);
          }, { passive: true });
        });
      }
    }

    setItems(items) {
      this.items = items || [];
      this._computeVisible();
      this._render();
    }

    refresh() {
      this._render();
    }

    scrollToItem(idx) {
      if (idx < 0 || idx >= this.items.length) return;
      this.container.scrollTop = idx * this.itemHeight;
    }

    destroy() {
      if (this.container) {
        this.container.removeEventListener('scroll', this._scrollHandler);
      }
      window.removeEventListener('resize', this._resizeHandler);
      this.container = null;
      this._contentEl = null;
      this._spacerTop = null;
      this._spacerBottom = null;
      this.items = [];
    }
  }

  // Expose ke window
  window.VirtualList = VirtualList;
  console.log('[VirtualList] Loaded. Use: new VirtualList({ container, items, renderItem, itemHeight })');
})();
