// Right-hand data panel of the exploded view (HTML + ECharts, same chart library as the release dashboard).
import * as echarts from 'echarts/core';
import { BarChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { STATUS_COLOR, statusOf } from './data.js';

echarts.use([BarChart, PieChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hm = (m) => { const h = Math.floor(m / 60), mm = Math.floor(m % 60); return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; };
const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)} 小时 ${Math.round(m % 60)} 分` : `${Math.round(m)} 分`);
const AX = { axisLine: { lineStyle: { color: '#45525f' } }, axisLabel: { color: '#9fb2c6', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.07)' } } };

export class Panel {
  constructor(onGate) {
    this.onGate = onGate; this.el = $('twin'); this.charts = {};
    this.el.addEventListener('click', (e) => { const r = e.target.closest('[data-gate]'); if (r) this.onGate(r.dataset.gate); const b = e.target.closest('[data-back]'); if (b) this.onGate(null); });
  }
  chart(id) { const el = $(id); if (!el) return null; if (!this.charts[id] || this.charts[id].getDom() !== el) { if (this.charts[id]) this.charts[id].dispose(); this.charts[id] = echarts.init(el, null, { renderer: 'canvas' }); } return this.charts[id]; }
  hide() { this.el.style.display = 'none'; for (const k of Object.keys(this.charts)) { this.charts[k].dispose(); delete this.charts[k]; } this.key = null; }
  kpis(s) {
    const k = (n, label, color, sub = '') => `<div class="kp" style="border-color:${color}55"><b style="color:${color}">${n}</b><span>${label}</span>${sub}</div>`;
    return `<div class="kps">${k(s.incoming, '将到达', '#58a3f2')}${k(s.late, '在途超时', STATUS_COLOR.bad)}${k(s.unrecv, '超时未接收', STATUS_COLOR.warn)}${k(s.passed, '已过岗次数', '#c9d3de')}${k(s.special, '在途特保', '#b98cff')}</div>`;
  }
  // view = { title, sub, s (stats), gates?: [{g, s}], T }
  show(view) {
    const { s, T } = view, key = view.title + (view.gates ? '|b' : '|g');
    this.el.style.display = 'block';
    if (this.key !== key) {
      this.key = key;
      this.el.innerHTML = `<div class="th">${view.gates ? '' : '<button data-back="1" class="bk">‹ 返回楼栋</button>'}<h3>${esc(view.title)}</h3><div class="dim" id="twSub"></div></div>
        <div id="twKpi"></div>
        ${view.gates ? '<div class="sec">各层门岗（点击查看）</div><div id="twGates"></div>' : ''}
        <div class="sec">分时段过岗次数</div><div id="twHour" class="ch" style="height:120px"></div>
        <div class="sec">在途单来源楼栋 TOP 6</div><div id="twSrc" class="ch" style="height:132px"></div>
        <div class="sec">今日流入单 · 物品分类</div><div id="twCat" class="ch" style="height:132px"></div>
        <div class="sec">在途超时单（按超时时长）</div><div id="twLate"></div>
        <div class="sec">超时未接收</div><div id="twUnrecv"></div>
        <div class="note">模拟数据 · 口径同放行看板：按单统计，放行类超时为红、接收类超时为黄</div>`;
    }
    $('twSub').textContent = `${view.sub}　截至 ${hm(T)}`;
    $('twKpi').innerHTML = this.kpis(s);
    if (view.gates) {
      let h = '', f = 0; const mx = Math.max(1, ...view.gates.map((x) => x.s.passed));
      for (const x of view.gates.slice().sort((a, b) => b.g.floor - a.g.floor || a.g.name.localeCompare(b.g.name))) {
        if (x.g.floor !== f) { f = x.g.floor; h += `<div class="fl">${f}F</div>`; }
        const c = STATUS_COLOR[statusOf(x.s)];
        h += `<div class="gr" data-gate="${esc(x.g.id)}"><i style="background:${c}"></i><span class="gn">${esc(x.g.name)}${x.g.side ? '' : '<em>未定位</em>'}</span><span class="bar"><u style="width:${(x.s.passed / mx * 100).toFixed(0)}%"></u></span>
          <span class="n" style="color:#58a3f2">${x.s.incoming}</span><span class="n" style="color:${STATUS_COLOR.bad}">${x.s.late}</span><span class="n" style="color:${STATUS_COLOR.warn}">${x.s.unrecv}</span><span class="n">${x.s.passed}</span></div>`;
      }
      $('twGates').innerHTML = `<div class="gr hd"><i></i><span class="gn">门岗</span><span class="bar"></span><span class="n">将到</span><span class="n">超时</span><span class="n">未收</span><span class="n">过岗</span></div>` + h;
    }
    const hNow = Math.min(23, Math.floor(T / 60));
    this.chart('twHour').setOption({ animation: false, grid: { left: 28, right: 8, top: 8, bottom: 18 }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: { type: 'category', data: [...Array(24).keys()].map((h) => h), ...AX, axisLabel: { ...AX.axisLabel, interval: 2 } }, yAxis: { type: 'value', minInterval: 1, ...AX },
      series: [{ type: 'bar', data: s.hourly.map((v, h) => ({ value: h <= hNow ? v : 0, itemStyle: { color: h === hNow ? '#7fd6ff' : '#3f7fc4' } })), barWidth: '62%' }] }, true);
    const src = [...s.src.entries()].sort((a, b) => (b[1][0] + b[1][1]) - (a[1][0] + a[1][1])).slice(0, 6).reverse();
    this.chart('twSrc').setOption({ animation: false, grid: { left: 40, right: 12, top: 4, bottom: 16 }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: { type: 'value', minInterval: 1, ...AX }, yAxis: { type: 'category', data: src.map((x) => x[0]), ...AX },
      series: [{ name: '在途', type: 'bar', stack: 'a', data: src.map((x) => x[1][0]), itemStyle: { color: '#58a3f2' }, barWidth: '58%' }, { name: '在途超时', type: 'bar', stack: 'a', data: src.map((x) => x[1][1]), itemStyle: { color: STATUS_COLOR.bad } }] }, true);
    const cats = [...s.cats.entries()].sort((a, b) => b[1] - a[1]);
    this.chart('twCat').setOption({ animation: false, tooltip: { trigger: 'item' }, legend: { orient: 'vertical', right: 0, top: 'middle', textStyle: { color: '#9fb2c6', fontSize: 10 }, itemWidth: 9, itemHeight: 9, itemGap: 5 },
      color: ['#58a3f2', '#3ddc84', '#ffb020', '#b98cff', '#ff8a65', '#4dd0e1', '#c9d3de', '#f06292', '#aed581'],
      series: [{ type: 'pie', radius: ['46%', '78%'], center: ['30%', '50%'], label: { show: false }, data: cats.map(([name, value]) => ({ name, value })), itemStyle: { borderColor: '#0e141c', borderWidth: 1 } }] }, true);
    const row = (x, color) => `<div class="od"><span class="id${x.o.special ? ' sp' : ''}">${esc(x.o.id)}</span><span class="fr">${esc(x.o.from.replace(/^ZZ-/, ''))}</span><span class="ov" style="color:${color}">超 ${dur(x.over)}</span></div>`;
    $('twLate').innerHTML = s.lateList.length ? s.lateList.slice(0, 6).map((x) => row(x, STATUS_COLOR.bad)).join('') + (s.lateList.length > 6 ? `<div class="dim">… 共 ${s.lateList.length} 单</div>` : '') : '<div class="dim">无</div>';
    $('twUnrecv').innerHTML = s.unrecvList.length ? s.unrecvList.slice(0, 4).map((x) => row(x, STATUS_COLOR.warn)).join('') + (s.unrecvList.length > 4 ? `<div class="dim">… 共 ${s.unrecvList.length} 单</div>` : '') : '<div class="dim">无</div>';
  }
  resize() { for (const c of Object.values(this.charts)) c.resize(); }
}
