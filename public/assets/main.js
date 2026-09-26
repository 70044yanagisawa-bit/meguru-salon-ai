/* 柳沢恵瑠 / 美容室専門AIコンサルティング
   動きは3つだけ：ヘッダーの罫線、スクロール表示、FAQの開閉。
   JSが動かなくても内容は全部読めるように書いています。 */
(() => {
  'use strict';

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const lessMotion = () => reduce.matches;

  /* ---------- ヘッダー：スクロールで罫線を出す + 追従ボタン ---------- */
  const head = document.getElementById('head');
  const sticky = document.getElementById('sticky');
  const stickyLink = sticky && sticky.querySelector('a');
  const hero = document.getElementById('top');

  // CTAが画面に入っているあいだは、追従ボタンを引っ込める（同じ導線が二重になるため）
  let contactVisible = false;
  const contact = document.getElementById('contact');
  if (contact && 'IntersectionObserver' in window) {
    new IntersectionObserver((es) => {
      contactVisible = es[0].isIntersecting;
      onScroll();
    }, { threshold: 0 }).observe(contact);
  }

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      if (head) head.classList.toggle('is-scrolled', y > 24);

      if (sticky && hero) {
        const past = y > hero.offsetHeight * 0.8;
        const show = past && !contactVisible;
        sticky.classList.toggle('is-on', show);
        // 見えていないボタンはキーボード操作の対象から外す
        sticky.setAttribute('aria-hidden', show ? 'false' : 'true');
        if (stickyLink) stickyLink.tabIndex = show ? 0 : -1;
      }
      ticking = false;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();

  /* ---------- モバイルメニューの開閉 ---------- */
  const btn = document.getElementById('menuBtn');
  const panel = document.getElementById('menuPanel');

  if (btn && panel) {
    const links = panel.querySelectorAll('a');
    let open = false;
    let timer = null;

    const setOpen = (next) => {
      open = next;
      btn.setAttribute('aria-expanded', String(next));
      clearTimeout(timer);

      if (next) {
        panel.hidden = false;
        // hidden解除直後にクラスを付けてもトランジションが走らないため1フレーム待つ
        requestAnimationFrame(() => panel.classList.add('is-open'));
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
        document.getElementById('main').inert = true;
        document.querySelector('.foot').inert = true;
        if (links[0]) links[0].focus({ preventScroll: true });
      } else {
        panel.classList.remove('is-open');
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
        document.getElementById('main').inert = false;
        document.querySelector('.foot').inert = false;
        timer = setTimeout(() => { panel.hidden = true; }, lessMotion() ? 0 : 560);
      }
    };

    btn.addEventListener('click', () => setOpen(!open));

    links.forEach((a) => a.addEventListener('click', () => {
      setOpen(false);
      btn.focus({ preventScroll: true });
    }));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && open) {
        setOpen(false);
        btn.focus({ preventScroll: true });
      }
    });

    // 幅が広がってPC表示になったら閉じる
    window.matchMedia('(min-width: 900px)').addEventListener('change', (e) => {
      if (e.matches && open) setOpen(false);
    });
  }

  /* ---------- スクロールでの表示（1回だけ、8pxの移動） ---------- */
  const targets = document.querySelectorAll('[data-reveal]');

  if (!('IntersectionObserver' in window) || lessMotion()) {
    targets.forEach((el) => el.classList.add('is-in'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });
    targets.forEach((el) => io.observe(el));
  }

  /* ---------- FAQ：高さをアニメーションさせる（details のまま） ---------- */
  document.querySelectorAll('.qa').forEach((qa) => {
    const summary = qa.querySelector('summary');
    const body = qa.querySelector('.qa__body');
    if (!summary || !body) return;

    let anim = null;

    const animate = (from, to, after) => {
      if (anim) anim.cancel();
      if (lessMotion()) { body.style.height = ''; after && after(); return; }
      anim = body.animate(
        { height: [from + 'px', to + 'px'] },
        { duration: 340, easing: 'cubic-bezier(.2,.75,.2,1)' }
      );
      // 先に open を切り替えてから高さ指定を外す（1フレームの中身のちらつきを防ぐ）
      anim.onfinish = () => { anim = null; after && after(); body.style.height = ''; };
      anim.oncancel = () => { anim = null; };
    };

    summary.addEventListener('click', (e) => {
      e.preventDefault();
      const start = body.offsetHeight;

      if (qa.open) {
        body.style.height = start + 'px';
        animate(start, 0, () => { qa.open = false; });
      } else {
        qa.open = true;
        const end = body.offsetHeight;
        body.style.height = '0px';
        animate(0, end);
      }
    });
  });
})();
