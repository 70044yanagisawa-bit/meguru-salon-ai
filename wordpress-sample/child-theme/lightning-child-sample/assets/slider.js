/**
 * 新着記事スライダー(トップページ)。
 * 記事は WordPress の「クエリループ」ブロックが出力したものをそのまま使い、
 * ここでは「前へ/次へ」ボタンと、位置を示す点を足すだけ。自動再生はしない。
 * JavaScript が動かなくても、横スクロールで全記事を見られる。
 */
(function () {
	'use strict';
	var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	function init(list) {
		if (list.getAttribute('data-slider-ready')) { return; }
		var items = list.children;
		if (items.length < 2) { return; }
		list.setAttribute('data-slider-ready', '1');
		list.setAttribute('tabindex', '0');
		list.setAttribute('role', 'region');
		list.setAttribute('aria-label', '新着記事（左右の矢印キーで横にスクロールできます）');

		var ctrl = document.createElement('div');
		ctrl.className = 'sample-slider-controls';
		var prev = button('sample-slider-prev', '前の記事へ', '‹');
		var next = button('sample-slider-next', '次の記事へ', '›');
		var dots = document.createElement('div');
		dots.className = 'sample-slider-dots';
		ctrl.appendChild(prev); ctrl.appendChild(dots); ctrl.appendChild(next);
		list.parentNode.insertBefore(ctrl, list.nextSibling);

		var step = 1, count = 1, current = 0;

		function button(cls, label, text) {
			var b = document.createElement('button');
			b.type = 'button'; b.className = cls; b.setAttribute('aria-label', label); b.textContent = text;
			return b;
		}
		function measure() {
			var first = items[0], second = items[1];
			step = second.offsetLeft - first.offsetLeft || first.offsetWidth;
			var max = list.scrollWidth - list.clientWidth;
			count = max > 2 ? Math.round(max / step) + 1 : 1;
			dots.innerHTML = '';
			for (var i = 0; i < count; i++) {
				(function (n) {
					var d = button('sample-slider-dot', (n + 1) + ' / ' + count + ' 番目へ', '');
					d.addEventListener('click', function () { go(n); });
					dots.appendChild(d);
				})(i);
			}
			ctrl.style.display = count > 1 ? '' : 'none';
			update();
		}
		function go(n) {
			n = Math.max(0, Math.min(count - 1, n));
			list.scrollTo({ left: n * step, behavior: reduce ? 'auto' : 'smooth' });
		}
		function update() {
			current = Math.round(list.scrollLeft / step);
			current = Math.max(0, Math.min(count - 1, current));
			var ds = dots.children;
			for (var i = 0; i < ds.length; i++) {
				if (i === current) { ds[i].setAttribute('aria-current', 'true'); } else { ds[i].removeAttribute('aria-current'); }
			}
			prev.disabled = current <= 0;
			next.disabled = current >= count - 1;
		}
		prev.addEventListener('click', function () { go(current - 1); });
		next.addEventListener('click', function () { go(current + 1); });
		list.addEventListener('scroll', function () { window.requestAnimationFrame(update); }, { passive: true });
		window.addEventListener('resize', measure);
		measure();
	}

	function ready() {
		var lists = document.querySelectorAll('.sample-latest .wp-block-post-template');
		for (var i = 0; i < lists.length; i++) { init(lists[i]); }
	}
	if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', ready); } else { ready(); }
})();
