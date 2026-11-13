// Gate drawer (right) of the exploded view: opened only when a gate is picked.  HTML + ECharts.
import * as echarts from 'echarts/core';
import { BarChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { STATUS_COLOR } from './data.js';

echarts.use([BarChart, PieChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);
const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const hm = (m) => { const h = Math.floor(m / 60), mm = Math.floor(m % 60); return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; };
export const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)} 小时 ${Math.round(m % 60)} 分` : `${Math.round(m)} 分`);
const AX = { axisLine: { lineStyle: { color: '#45525f' } }, axisLabel: { color: '#9fb2c6', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.07)' } } };

export class Panel {
  constructor(onOrder, onClose) {
    this.el = $('twin'); this.charts = {};
    this.el.addEventListener('click', (e) => { const r = e.target.closest('[data-order]'); if (r) onOrder(r.dataset.order); if (e.target.closest('[data-close]')) onClose(); });
  }
  chart(id) { const el = $(id); if (!el) return null; if (!this.charts[id] || this.charts[id].getDom() !== el) { if (this.charts[id]) this.charts[id].dispose(); this.charts[id] = echarts.init(el, null, { renderer: 'canvas' }); } return this.charts[id]; }
  hide() { this.el.style.display = 'none'; for (const k of Object.keys(this.charts)) { this.charts[k].dispose(); delete this.charts[k]; } this.key = null; }
  // view = { g, s, sub, T, order }
  show(view) {
    const { g, s, T } = view;
    this.el.style.display = 'block';
    if (this.key !== g.id) {
      this.key = g.id;
      this.el.innerHTML = `<div class="th"><button data-close="1" class="bk">✕</button><h3>${esc(g.id)}</h3><div class="dim" id="twSub"></div></div>
        <div id="twKpi"></div>
        <div class="sec" style="border-color:${STATUS_COLOR.bad}">在途超时 · 还没到本岗（点一单看路线）</div><div id="twLate"></div>
        <div class="sec">将要到达 · 在途未超时</div><div id="twInc"></div>
        <div class="sec" style="border-color:${STATUS_COLOR.warn}">已到达 · 超时未接收</div><div id="twUnrecv"></div>
        <div class="sec">分时段过岗次数</div><div id="twHour" class="ch" style="height:104px"></div>
        <div class="sec">在途单来自哪些楼</div><div id="twSrc" class="ch" style="height:112px"></div>
        <div class="sec">今日流入单 · 物品分类</div><div id="twCat" class="ch" style="height:118px"></div>
        <div class="note">模拟数据 · 口径同放行看板：按单统计</div>`;
    }
    $('twSub').textContent = `${view.sub}　截至 ${hm(T)}`;
    const k = (n, label, color) => `<div class="kp" style="border-color:${color}55"><b style="color:${n > 0 ? color : '#5d6b7a'}">${n}</b><span>${label}</span></div>`;
    $('twKpi').innerHTML = `<div class="kps k4">${k(s.incoming, '将到达', STATUS_COLOR.run)}${k(s.late, '在途超时', STATUS_COLOR.bad)}${k(s.unrecv, '超时未接收', STATUS_COLOR.warn)}${k(s.passed, '已过岗次数', '#e8eef5')}</div>`;
    const row = (x, right, color) => `<div class="od${view.order === x.o.id ? ' on' : ''}" data-order="${esc(x.o.id)}"><span class="id${x.o.special ? ' sp' : ''}">${esc(x.o.id)}</span><span class="fr">${esc(x.o.from.replace(/^ZZ-/, ''))}</span><span class="ov" style="color:${color}">${right}</span></div>`;
    const list = (arr, n, f) => (arr.length ? arr.slice(0, n).map(f).join('') + (arr.length > n ? `<div class="dim">… 共 ${arr.length} 单</div>` : '') : '<div class="dim">无</div>');
    $('twLate').innerHTML = list(s.lateList, 6, (x) => row(x, `超 ${dur(x.over)}`, STATUS_COLOR.bad));
    $('twInc').innerHTML = list(s.incList, 5, (x) => row(x, `剩 ${dur(x.left)}`, STATUS_COLOR.run));
    $('twUnrecv').innerHTML = list(s.unrecvList, 4, (x) => row(x, `超 ${dur(x.over)}`, STATUS_COLOR.warn));
    const hNow = Math.min(23, Math.floor(T / 60));
    this.chart('twHour').setOption({ animation: false, grid: { left: 26, right: 6, top: 8, bottom: 18 }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: { type: 'category', data: [...Array(24).keys()], ...AX, axisLabel: { ...AX.axisLabel, interval: 2 } }, yAxis: { type: 'value', minInterval: 1, ...AX },
      series: [{ type: 'bar', data: s.hourly.map((v, h) => ({ value: h <= hNow ? v : 0, itemStyle: { color: h === hNow ? '#7fd6ff' : '#3f7fc4' } })), barWidth: '62%' }] }, true);
    const src = [...s.src.entries()].sort((a, b) => (b[1][0] + b[1][1]) - (a[1][0] + a[1][1])).slice(0, 5).reverse();
    this.chart('twSrc').setOption({ animation: false, grid: { left: 38, right: 10, top: 4, bottom: 16 }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: { type: 'value', minInterval: 1, ...AX }, yAxis: { type: 'category', data: src.map((x) => x[0]), ...AX },
      series: [{ name: '在途', type: 'bar', stack: 'a', data: src.map((x) => x[1][0]), itemStyle: { color: STATUS_COLOR.run }, barWidth: '58%' }, { name: '在途超时', type: 'bar', stack: 'a', data: src.map((x) => x[1][1]), itemStyle: { color: STATUS_COLOR.bad } }] }, true);
    const cats = [...s.cats.entries()].sort((a, b) => b[1] - a[1]);
    this.chart('twCat').setOption({ animation: false, tooltip: { trigger: 'item' }, legend: { orient: 'vertical', right: 0, top: 'middle', textStyle: { color: '#9fb2c6', fontSize: 10 }, itemWidth: 9, itemHeight: 9, itemGap: 5 },
      color: ['#58a3f2', '#3ddc84', '#ffb020', '#b98cff', '#ff8a65', '#4dd0e1', '#c9d3de', '#f06292', '#aed581'],
      series: [{ type: 'pie', radius: ['46%', '78%'], center: ['30%', '50%'], label: { show: false }, data: cats.map(([name, value]) => ({ name, value })), itemStyle: { borderColor: '#0e141c', borderWidth: 1 } }] }, true);
  }
  resize() { for (const c of Object.values(this.charts)) c.resize(); }
}
