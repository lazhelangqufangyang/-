(() => {
  const nav = document.getElementById('nav');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer: fine)').matches && innerWidth >= 1024 && !reduce;
  const navH = () => nav.offsetHeight;

  const layers = [...document.querySelectorAll('.parallax')];
  const reveals = [...document.querySelectorAll('.reveal')];
  const spy = ['log', 'features', 'moves', 'privacy']
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  const navLinks = [...document.querySelectorAll('.nav-pill a')];

  function onFrame() {
    const y = scrollY;
    nav.classList.toggle('scrolled', y > 40);
    if (!reduce) {
      for (const el of layers) {
        const speed = parseFloat(el.dataset.speed || '0.2');
        const top = el.parentElement.getBoundingClientRect().top;
        el.style.transform = `translate3d(0, ${(-top * speed).toFixed(1)}px, 0)`;
      }
    }
    for (const el of reveals) {
      if (el.classList.contains('in')) continue;
      const r = el.getBoundingClientRect();
      if (r.top < innerHeight * 0.92 && r.bottom > 0) el.classList.add('in');
    }
    let current = null;
    for (const sec of spy) {
      if (sec.getBoundingClientRect().top <= innerHeight * 0.45) current = sec.id;
    }
    for (const a of navLinks) {
      a.classList.toggle('active', a.getAttribute('href') === '#' + current);
    }
  }

  let target = scrollY;
  let cur = scrollY;
  let looping = false;
  const maxScroll = () => document.documentElement.scrollHeight - innerHeight;
  const clamp = (v) => Math.max(0, Math.min(maxScroll(), v));

  function loop() {
    cur += (target - cur) * 0.085;
    if (Math.abs(target - cur) < 0.4) cur = target;
    window.scrollTo({ top: cur, behavior: 'instant' });
    onFrame();
    if (cur !== target) requestAnimationFrame(loop);
    else looping = false;
  }
  function start() {
    if (!looping) {
      looping = true;
      requestAnimationFrame(loop);
    }
  }

  if (fine) {
    addEventListener('wheel', (e) => {
      if (e.ctrlKey) return;
      e.preventDefault();
      target = clamp(target + e.deltaY);
      start();
    }, { passive: false });
  }

  addEventListener('scroll', () => {
    if (!looping) {
      target = cur = scrollY;
    }
    onFrame();
  }, { passive: true });

  addEventListener('resize', () => {
    target = clamp(target);
    onFrame();
  });

  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      const el = id === '#top' ? document.body : document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      const dest = id === '#top' ? 0 : el.getBoundingClientRect().top + scrollY - navH() - 8;
      if (fine) {
        target = clamp(dest);
        start();
      } else {
        window.scrollTo({ top: clamp(dest), behavior: reduce ? 'auto' : 'smooth' });
      }
    });
  });

  onFrame();
})();