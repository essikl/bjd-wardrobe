/* ui.js - 模态框 / 确认框 / 轻提示 */
'use strict';

const modalRoot = document.getElementById('modalRoot');

function toast(msg){
  let t = document.getElementById('toast');
  if(!t){
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* 打开模态框；返回 {close} */
function openModal(opts){
  const {title, body, footer, onClose} = opts;
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML =
    '<div class="modal">' +
      '<div class="modal-head"><span>' + esc(title || '') + '</span>' +
      '<button class="modal-close" data-act="close">x</button></div>' +
      '<div class="modal-body"></div>' +
      '<div class="modal-foot"></div>' +
    '</div>';
  const modal = mask.querySelector('.modal');
  const bodyEl = mask.querySelector('.modal-body');
  const footEl = mask.querySelector('.modal-foot');
  if(typeof body === 'string'){
    bodyEl.innerHTML = body;
  }else if(body && body.nodeType){
    bodyEl.appendChild(body);
  }
  if(footer){
    if(typeof footer === 'string'){
      footEl.innerHTML = footer;
    }else if(footer && footer.nodeType){
      footEl.appendChild(footer);
    }
  }else{
    footEl.style.display = 'none';
  }
  mask.addEventListener('click', (e) => {
    if(e.target === mask || (e.target.dataset && e.target.dataset.act === 'close')){
      close();
    }
  });
  function close(){
    if(!mask.parentNode) return;
    mask.parentNode.removeChild(mask);
    if(onClose) onClose();
  }
  modalRoot.appendChild(mask);
  return {close, bodyEl, footEl, mask};
}

/* 确认框，返回 Promise<boolean> */
function confirmDlg(title, message, okText, danger){
  okText = okText || '确认';
  return new Promise((resolve) => {
    const foot = document.createElement('div');
    foot.innerHTML =
      '<button class="btn" data-c="0">取消</button>' +
      '<button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-c="1">' + esc(okText) + '</button>';
    foot.style.display = 'flex';
    foot.style.gap = '8px';
    const m = openModal({
      title: title || '提示',
      body: '<div style="padding:4px 0;line-height:1.7">' + message + '</div>',
      footer: foot
    });
    foot.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        const ok = b.dataset.c === '1';
        m.close();
        resolve(ok);
      });
    });
    m.mask.addEventListener('click', (e) => {
      if(e.target === m.mask){ m.close(); resolve(false); }
    });
  });
}

/* 简单表单输入辅助：给容器绑定 esc 等由调用方处理 */
function field(label, html){
  return '<div class="form-group"><label>' + esc(label) + '</label>' + html + '</div>';
}
