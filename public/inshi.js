/*
 * 収入印紙 判定ツール(/inshi)の画面制御。
 * 判定そのものは stamp.js の純粋関数が行い、ここは入力の取得と描画だけを担当する。
 */
'use strict';

(function () {

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    amount: $('sdAmount'),
    rate: $('sdRate'),
    taxAmount: $('sdTaxAmount'),
    separateTax: $('sdSeparateTax'),
    delivery: $('sdDelivery'),
    payment: $('sdPayment'),
    business: $('sdBusiness'),
    result: $('sdResult'),
    tableBody: $('sdTableBody')
  };

  /** 税抜金額と税率から消費税額を求める(1円未満は切り捨て)。 */
  function currentTaxAmount() {
    var amount = Math.max(0, Number(els.amount.value) || 0);
    var rate = Number(els.rate.value) || 0;
    return Math.floor(amount * rate / 100);
  }

  function yen(value) {
    return '¥' + (Number(value) || 0).toLocaleString('ja-JP');
  }

  function render() {
    var amountExcl = Math.max(0, Number(els.amount.value) || 0);
    var taxAmount = currentTaxAmount();

    els.taxAmount.textContent = yen(taxAmount)
      + '(税込 ' + yen(amountExcl + taxAmount) + ')';

    var result = window.StampDuty.judge({
      delivery: els.delivery.value,
      payment: els.payment.value,
      business: els.business.value,
      amountExcl: amountExcl,
      taxAmount: taxAmount,
      separateTax: els.separateTax.checked
    });

    els.result.className = 'sd-result ' + (result.required ? 'is-required' : 'is-free');

    var parts = [];
    parts.push('<p class="sd-verdict">'
      + (result.required ? window.StampDuty.formatYen(result.duty) + 'の収入印紙が必要です' : '収入印紙は不要です')
      + '</p>');
    parts.push('<p class="sd-reason"></p>');
    parts.push('<dl class="sd-basis">'
      + '<dt>印紙税の記載金額</dt><dd>' + yen(result.basisAmount) + '</dd>'
      + '<dt>判定のもとにした金額</dt><dd class="sd-basis-label"></dd>'
      + '</dl>');
    if (result.notes.length) {
      parts.push('<ul class="sd-notes"></ul>');
    }
    els.result.innerHTML = parts.join('');

    // 文言は textContent で入れる(HTMLとして解釈させない)
    els.result.querySelector('.sd-reason').textContent = result.reason;
    els.result.querySelector('.sd-basis-label').textContent = result.basisLabel;
    var list = els.result.querySelector('.sd-notes');
    if (list) {
      result.notes.forEach(function (note) {
        var li = document.createElement('li');
        li.textContent = note;
        list.appendChild(li);
      });
    }
  }

  /** 税額表を描画する(数値をHTMLに直書きせず、判定ロジックと同じ表から作る)。 */
  function renderTable() {
    window.StampDuty.receiptTable().forEach(function (row) {
      var tr = document.createElement('tr');
      var th = document.createElement('th');
      th.textContent = row.label;
      var td = document.createElement('td');
      td.className = 'num';
      td.textContent = row.duty === 0 ? '非課税(不要)' : window.StampDuty.formatYen(row.duty);
      tr.appendChild(th);
      tr.appendChild(td);
      els.tableBody.appendChild(tr);
    });
  }

  /**
   * 請求書ジェネレーターの領収書モードから ?amount= と ?rate= で金額を引き継ぐ。
   * 想定外の値は無視して既定値のままにする(表示の破綻を避けるため)。
   */
  function applyQuery() {
    var query = new URLSearchParams(location.search);

    var amount = Number(query.get('amount'));
    if (Number.isFinite(amount) && amount >= 0) {
      els.amount.value = String(Math.floor(amount));
    }

    var rate = query.get('rate');
    var allowed = Array.prototype.map.call(els.rate.options, function (o) { return o.value; });
    if (rate !== null && allowed.indexOf(rate) !== -1) {
      els.rate.value = rate;
    }
  }

  ['amount', 'rate', 'separateTax', 'delivery', 'payment', 'business'].forEach(function (key) {
    els[key].addEventListener('input', render);
    els[key].addEventListener('change', render);
  });

  applyQuery();
  renderTable();
  render();

})();
