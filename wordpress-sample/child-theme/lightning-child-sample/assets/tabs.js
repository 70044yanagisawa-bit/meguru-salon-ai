/**
 * トップページのタブ(2か所)。内容は WordPress のブロック(管理画面で編集できるもの)をそのまま使い、
 * ここでは見せ方を切り替えるだけ。JavaScript が動かないときは、すべての内容がそのまま並んで表示される。
 *  1) おすすめ記事: 記事のカテゴリー名から「絞り込みタブ」を自動で作る
 *  2) プロフィール: .sample-tab-panel の見出し(.sample-tab-title)から「タブ」を作る
 */
(function () {
	'use strict';

	function el(tag, cls, text) {
		var e = document.createElement(tag);
		if (cls) { e.className = cls; }
		if (text) { e.textContent = text; }
		return e;
	}

	/* ---------- 1) おすすめ記事: カテゴリーで絞り込み ---------- */
	function initPickup(root) {
		var list = root.querySelector('.wp-block-post-template');
		if (!list || list.children.length < 2 || root.getAttribute('data-tabs-ready')) { return; }
		root.setAttribute('data-tabs-ready', '1');
		var items = Array.prototype.slice.call(list.children);

		// 各記事のカテゴリー(リンク先URLで区別)を集める
		var cats = {}, order = [];
		items.forEach(function (li) {
			var keys = [];
			Array.prototype.forEach.call(li.querySelectorAll('.wp-block-post-terms a'), function (a) {
				var k = a.getAttribute('href');
				keys.push(k);
				if (!cats[k]) { cats[k] = { name: a.textContent.trim(), count: 0 }; order.push(k); }
				cats[k].count++;
			});
			li._cats = keys;
		});
		// 全記事に付いているカテゴリー(=「おすすめ」自身)はタブにしない
		order = order.filter(function (k) { return cats[k].count < items.length; });
		if (!order.length) { return; }

		var bar = el('div', 'sample-pickup-tabs');
		bar.setAttribute('role', 'group');
		bar.setAttribute('aria-label', 'カテゴリーで絞り込む');
		var buttons = [];
		function select(key) {
			items.forEach(function (li) { li.hidden = !(key === 'all' || li._cats.indexOf(key) !== -1); });
			buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b._key === key)); });
		}
		[['all', 'すべて']].concat(order.map(function (k) { return [k, cats[k].name]; })).forEach(function (pair) {
			var b = el('button', 'sample-pickup-tab', pair[1]);
			b.type = 'button'; b._key = pair[0];
			b.addEventListener('click', function () { select(pair[0]); });
			bar.appendChild(b); buttons.push(b);
		});
		list.parentNode.insertBefore(bar, list);
		select('all');
	}

	/* ---------- 2) プロフィール: タブで切り替え ---------- */
	function initProfile(col) {
		var panels = Array.prototype.slice.call(col.querySelectorAll('.sample-tab-panel'));
		if (panels.length < 2 || col.getAttribute('data-tabs-ready')) { return; }
		col.setAttribute('data-tabs-ready', '1');
		var uid = 'sample-tab-' + Math.random().toString(36).slice(2, 7);
		var bar = el('div', 'sample-profile-tabs');
		bar.setAttribute('role', 'tablist');
		var tabs = [];
		panels.forEach(function (p, i) {
			var title = p.querySelector('.sample-tab-title');
			var t = el('button', 'sample-profile-tab', title ? title.textContent.trim() : 'タブ ' + (i + 1));
			t.type = 'button'; t.id = uid + '-t' + i;
			t.setAttribute('role', 'tab'); t.setAttribute('aria-controls', uid + '-p' + i);
			p.id = uid + '-p' + i; p.setAttribute('role', 'tabpanel'); p.setAttribute('aria-labelledby', t.id);
			p.classList.add('is-tabbed');
			t.addEventListener('click', function () { show(i, false); });
			t.addEventListener('keydown', function (e) {
				var n = null;
				if (e.key === 'ArrowRight') { n = (i + 1) % tabs.length; }
				else if (e.key === 'ArrowLeft') { n = (i - 1 + tabs.length) % tabs.length; }
				else if (e.key === 'Home') { n = 0; }
				else if (e.key === 'End') { n = tabs.length - 1; }
				if (n !== null) { e.preventDefault(); show(n, true); }
			});
			bar.appendChild(t); tabs.push(t);
		});
		function show(n, focus) {
			tabs.forEach(function (t, i) {
				var on = i === n;
				t.setAttribute('aria-selected', String(on));
				t.tabIndex = on ? 0 : -1;
				panels[i].hidden = !on;
			});
			if (focus) { tabs[n].focus(); }
		}
		panels[0].parentNode.insertBefore(bar, panels[0]);
		show(0, false);
	}

	function ready() {
		var pickup = document.querySelector('.sample-recommend .wp-block-query');
		if (pickup) { initPickup(pickup); }
		var col = document.querySelector('.sample-profile .wp-block-column:last-child');
		if (col) { initProfile(col); }
	}
	if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', ready); } else { ready(); }
})();
