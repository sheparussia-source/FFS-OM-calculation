(function (root) {
  'use strict';

  const FFS = root.FFS;
  const SOURCES = [
    './lib/three.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
    'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js'
  ];

  FFS.loadThree = function (onReady) {
    if (typeof THREE !== 'undefined') {
      onReady();
      return;
    }

    let idx = 0;
    function tryNext() {
      if (typeof THREE !== 'undefined') {
        onReady();
        return;
      }
      if (idx >= SOURCES.length) {
        const mount = FFS.$('three-mount');
        if (mount) {
          mount.innerHTML =
            '<div class="three-status">3D-движок <b>Three.js</b> недоступен без сети.<br>' +
            '2D-чертёж и все расчёты работают полностью автономно.<br><br>' +
            'Для 100% офлайн-3D скачайте <code>three.min.js</code> (r128) и положите в папку <code>lib/</code> (см. <code>lib/README.txt</code>).</div>';
        }
        return;
      }
      const s = document.createElement('script');
      s.src = SOURCES[idx++];
      s.async = true;
      s.onload = function () {
        if (typeof THREE !== 'undefined') onReady();
        else tryNext();
      };
      s.onerror = function () {
        s.remove();
        tryNext();
      };
      document.head.appendChild(s);
    }

    tryNext();
  };
})(window);
