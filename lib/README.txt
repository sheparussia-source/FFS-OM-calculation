Локальный офлайн-режим Three.js
================================

По умолчанию загрузчик js/three-loader.js ищет Three.js в таком порядке:
  1. ./lib/three.min.js   (локальная копия — 100% автономно без интернета)
  2. https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js
  3. https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js

Чтобы сделать 3D-симулятор полностью независимым от внешних CDN (для заводских ПК
или запуска с флешки), сохраните файл по ссылке выше под именем:

  lib/three.min.js

и загрузите его в репозиторий GitHub вместе с остальными файлами.
