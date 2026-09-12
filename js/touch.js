/* ============================================================================
   HOG CRANKERS — touch controls. Phones + tablets, brother.
   Virtual pads dispatch the same KeyboardEvents the keyboard path uses,
   so game.js input logic stays untouched. Desktop: this file no-ops.
   ============================================================================ */
(function () {
  'use strict';

  var IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || /forcetouch/.test(location.search);
  if (!IS_TOUCH) return;

  document.body.classList.add('hog-touch');

  /* tap-to-start hint + reveal ride controls on game start */
  var hint = document.getElementById('titlehint');
  if (hint) hint.textContent = 'TAP A DIFFICULTY CARD. THEN RIDE, BROTHER.';
  var meterLabel = document.getElementById('meterlabel');
  if (meterLabel) meterLabel.textContent = 'HOLD CRANK — CRANK THAT HOG';

  /* ---- key event bridge ---- */
  function pressKey(code) {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: code, key: code, bubbles: true, cancelable: true }));
  }
  function releaseKey(code) {
    window.dispatchEvent(new KeyboardEvent('keyup', { code: code, key: code, bubbles: true, cancelable: true }));
  }

  /* ---- build controls ---- */
  var css = document.createElement('style');
  css.textContent = [
    '#touchctl{position:fixed;inset:0;z-index:70;pointer-events:none;display:none;',
    '  font-family:Impact,"Arial Black",sans-serif;}',
    'body.hog-riding #touchctl{display:block;}',
    '.tbtn{position:fixed;pointer-events:auto;user-select:none;-webkit-user-select:none;',
    '  display:flex;align-items:center;justify-content:center;flex-direction:column;',
    '  background:rgba(8,8,8,.42);border:3px solid rgba(216,255,0,.5);border-radius:16px;',
    '  color:#d8ff00;text-shadow:0 2px 0 #000;touch-action:none;',
    '  bottom:calc(18px + env(safe-area-inset-bottom));}',
    '.tbtn:active,.tbtn.held{background:rgba(216,255,0,.22);border-color:#d8ff00;}',
    '.tbtn small{font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:10px;',
    '  letter-spacing:2px;color:#f2ead8;opacity:.8;margin-top:2px;}',
    '#tleft{left:calc(16px + env(safe-area-inset-left));width:96px;height:96px;font-size:40px;}',
    '#tright{left:calc(124px + env(safe-area-inset-left));width:96px;height:96px;font-size:40px;}',
    '#tcrank{right:calc(16px + env(safe-area-inset-right));width:140px;height:140px;border-radius:50%;',
    '  font-size:26px;letter-spacing:2px;color:#ff7a00;border-color:rgba(255,122,0,.6);}',
    '#tcrank small{color:#f2ead8;}',
    '.tmini{width:54px;height:44px;border-radius:10px;font-size:15px;letter-spacing:1px;',
    '  top:calc(12px + env(safe-area-inset-top));bottom:auto;color:#f2ead8;border-color:rgba(242,234,216,.4);}',
    '#tcam{right:calc(84px + env(safe-area-inset-right));}',
    '#tmute{right:calc(24px + env(safe-area-inset-right));}',
    '#tpause{right:calc(144px + env(safe-area-inset-right));}'
  ].join('\n');
  document.head.appendChild(css);

  var ctl = document.createElement('div');
  ctl.id = 'touchctl';
  ctl.innerHTML =
    '<div class="tbtn" id="tleft">&#9664;<small>STEER</small></div>' +
    '<div class="tbtn" id="tright">&#9654;<small>STEER</small></div>' +
    '<div class="tbtn" id="tcrank">CRANK<small>HOLD IT</small></div>' +
    '<div class="tbtn tmini" id="tcam">CAM</div>' +
    '<div class="tbtn tmini" id="tmute">SND</div>' +
    '<div class="tbtn tmini" id="tpause">II</div>';
  document.body.appendChild(ctl);

  /* hold-buttons: steer pads + crank */
  function holdBtn(id, code) {
    var el = document.getElementById(id);
    function down(e) {
      e.preventDefault();
      el.classList.add('held');
      pressKey(code);
    }
    function up(e) {
      if (e) e.preventDefault();
      el.classList.remove('held');
      releaseKey(code);
    }
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  holdBtn('tleft', 'ArrowLeft');
  holdBtn('tright', 'ArrowRight');
  holdBtn('tcrank', 'Space');

  /* tap-buttons: camera / mute / pause */
  function tapBtn(id, code) {
    var el = document.getElementById(id);
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      pressKey(code);
      releaseKey(code);
    });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  tapBtn('tcam', 'KeyC');
  tapBtn('tmute', 'KeyM');
  tapBtn('tpause', 'KeyP');

  /* reveal ride controls once a difficulty card is tapped */
  var cards = document.querySelectorAll('.diffbtn');
  for (var i = 0; i < cards.length; i++) {
    cards[i].addEventListener('click', function () {
      document.body.classList.add('hog-riding');
    });
  }

  /* block iOS pinch/double-tap zoom + long-press callout everywhere */
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('dblclick', function (e) { e.preventDefault(); });
})();
