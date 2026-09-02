/* utils.js - 通用工具函数 */
'use strict';

function uid(){
  return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function pad(n){ return n < 10 ? '0' + n : '' + n; }

/* Date -> 'YYYY-MM-DD'（本地时区） */
function fmtDate(d){
  if(!d) return '';
  if(typeof d === 'string') d = new Date(d);
  if(isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function todayStr(){
  return fmtDate(new Date());
}

/* 'YYYY-MM-DD' 或 Date -> Date；解析失败返回 null */
function parseDate(s){
  if(!s) return null;
  if(s instanceof Date) return isNaN(s.getTime()) ? null : s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function addDays(d, n){
  const r = new Date(d.getTime());
  r.setDate(r.getDate() + n);
  return r;
}

function isWeekend(d){
  const day = d.getDay();
  return day === 0 || day === 6;
}

/* 从 startDate 起，跳过周末，往后数 n 个工作日，返回 'YYYY-MM-DD' */
function addWorkdays(startDate, n){
  let d = parseDate(startDate);
  if(!d || isNaN(n) || n < 0) return '';
  d = addDays(d, 1); // 从次日开始计算
  let added = 0;
  while(added < n){
    if(!isWeekend(d)) added++;
    if(added < n) d = addDays(d, 1);
  }
  return fmtDate(d);
}

/* 工作日数 -> 估算自然日数（每周 5/7 比例） */
function estimateNaturalDays(workdays){
  const w = Number(workdays) || 0;
  if(w <= 0) return 0;
  return Math.ceil(w * 7 / 5);
}

/* 自然日数 -> 近似月数文案（30天/月） */
function daysToMonthText(days){
  if(isNaN(days) || days <= 0) return '';
  const m = Math.round(days / 30);
  if(m <= 1) return days + ' 天';
  return '约 ' + m + ' 个月（' + days + ' 天）';
}

/* 从今天到目标日期的剩余天数；目标已过则返回负数 */
function daysLeft(dateStr){
  const t = todayStr();
  if(!dateStr) return null;
  const diff = Math.round((parseDate(dateStr) - parseDate(t)) / 86400000);
  return diff;
}

function fmtMoney(n){
  const v = Number(n) || 0;
  return v.toLocaleString('zh-CN', {minimumFractionDigits: 0, maximumFractionDigits: 2});
}

/* X 天后的日期字符串 */
function dateAfterToday(days){
  return fmtDate(addDays(new Date(), days));
}

function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
