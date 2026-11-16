(() => {
  const nav = document.getElementById('nav');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const layers = [...document.querySelectorAll('.parallax')];
  const reveals = [...document.querySelectorAll('.reveal')];
  const spy = ['log', 'features', 'moves', 'privacy']
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  const navLinks = [...document.querySelectorAll('.nav-pill a')];
  let ticking = false;

  function onFrame() {
    ticking = false;
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
      if (sec.getBoundingClientRect().top <= innerHeight * 0.18) current = sec.id;
    }
    if (spy.length && innerHeight + y >= document.documentElement.scrollHeight - 4) {
      current = spy[spy.length - 1].id;
    }
    for (const a of navLinks) {
      a.classList.toggle('active', a.getAttribute('href') === '#' + current);
    }
  }

  const queue = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(onFrame);
    }
  };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  onFrame();
})();