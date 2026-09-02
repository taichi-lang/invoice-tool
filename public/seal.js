/*
 * 印影(電子印)の受け入れ判定。DOM に触らない純関数だけを置く。
 *
 * なぜ分けるか: 画像を読み込む処理はブラウザでしか動かないが、
 * 「どの画像なら受け入れるか」の判断は node のテストで固定できるため。
 *
 * 方針:
 *   ・画像はこの端末から出ない。data: URL にしてページ内で表示するだけで、送信はしない
 *     (CSP は connect-src 'none' / form-action 'none'。img-src だけが 'self' data: を許す)
 *   ・受け入れるのは PNG / JPEG / SVG の data: URL のみ。
 *     SVG は <img> に入れた場合スクリプトが動かないため、表示用途では扱える
 *   ・大きすぎる画像は JSON 保存の書き出しごと重くなるので上限を設ける
 */
(function (root) {
  'use strict';

  var MAX_BYTES = 1024 * 1024;               // 1MB。印影は数十KBで足りる
  var ALLOWED = ['image/png', 'image/jpeg', 'image/svg+xml'];

  /**
   * data: URL が印影として受け入れられるかを判定する。
   * @param {*} dataUrl 判定する値(想定は "data:image/png;base64,..." の文字列)
   * @returns {{ok: boolean, reason: string}} 受け入れ可否と、断る場合の理由
   */
  function checkSeal(dataUrl) {
    if (typeof dataUrl !== 'string' || dataUrl === '') {
      return { ok: false, reason: '画像が読み取れませんでした。' };
    }
    var head = dataUrl.slice(0, dataUrl.indexOf(','));
    if (head.slice(0, 5) !== 'data:') {
      return { ok: false, reason: 'この端末の中だけで扱える形式ではありません。' };
    }
    var mime = head.slice(5).split(';')[0].toLowerCase();
    if (ALLOWED.indexOf(mime) === -1) {
      return { ok: false, reason: 'PNG・JPEG・SVG の画像を選んでください。' };
    }
    if (dataUrl.length > MAX_BYTES) {
      return { ok: false, reason: '画像が大きすぎます(1MBまで)。' };
    }
    return { ok: true, reason: '' };
  }

  var api = { checkSeal: checkSeal, MAX_BYTES: MAX_BYTES, ALLOWED: ALLOWED };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.InvoiceSeal = api;
  }

})(typeof globalThis !== 'undefined' ? globalThis : this);
