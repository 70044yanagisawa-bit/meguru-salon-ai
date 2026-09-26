/* 名刺プレビュー：入稿サイズの切り替えとガイド表示だけを担当する */
(function () {
  'use strict';

  var body = document.body;
  var rule = document.getElementById('pagerule');

  /* @page の size はCSS変数を受け付けないため、モードごとに実寸で書き換える */
  var PAGE = {
    trim:  '91mm 55mm',
    bleed: '97mm 61mm',
    marks: '103mm 67mm'
  };

  function applyMode(mode) {
    if (!PAGE[mode]) return;
    body.dataset.mode = mode;
    rule.textContent = '@page{ size:' + PAGE[mode] + '; margin:0; }';
  }

  Array.prototype.forEach.call(
    document.querySelectorAll('input[name="mode"]'),
    function (input) {
      input.addEventListener('change', function () {
        if (input.checked) applyMode(input.value);
      });
    }
  );

  var guide = document.getElementById('guide');
  guide.addEventListener('change', function () {
    body.dataset.guide = guide.checked ? 'on' : 'off';
  });

  document.getElementById('print').addEventListener('click', function () {
    window.print();
  });

  /* ?view=proof … 操作パネルを隠した確認用表示（スクリーンショット・校正用） */
  var params = new URLSearchParams(location.search);
  if (params.get('view') === 'proof') {
    body.dataset.view = 'proof';
    if (params.get('guide') !== 'on') guide.checked = false;
    var m = params.get('mode');
    if (m && PAGE[m]) {
      var target = document.querySelector('input[name="mode"][value="' + m + '"]');
      if (target) target.checked = true;
    }
  }

  /* 再読み込み時にブラウザが保持している選択状態と@pageを合わせる */
  var checked = document.querySelector('input[name="mode"]:checked');
  if (checked) applyMode(checked.value);
  body.dataset.guide = guide.checked ? 'on' : 'off';
})();
